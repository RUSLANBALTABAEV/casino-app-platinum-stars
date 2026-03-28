import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { playInstantGame } from '@/lib/services/instant-games';
import { getGameSetting } from '@/lib/services/game-settings';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  getDevTelegramUser,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

type UpgradeBody = {
  bet?: number;
};

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-upgrade:post`, {
    limit: 12,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: UpgradeBody;
  try {
    body = (await req.json()) as UpgradeBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  const bet = typeof body.bet === 'number' ? body.bet : 20;

  try {
    if (isDemoRequest(req)) {
      const win = Math.random() > 0.55;
      return applyHeaders(
        NextResponse.json({
          success: true,
          result: {
            win,
            payout: win ? Math.round(bet * 2.5) : 0,
            balance: getDemoBalance()
          }
        }),
        rateResult
      );
    }

    const setting = await getGameSetting('UPGRADE', 'config');
    const config = (setting?.value ?? {}) as {
      winChance?: number;
      multiplier?: number;
      nftChance?: number;
      nftGiftIds?: string[];
    };

    const user = await resolveUser(req);
    const result = await playInstantGame({
      userId: user.userId,
      wager: bet,
      winChance: typeof config.winChance === 'number' ? config.winChance : 0.55,  // 55% win chance
      multiplier: typeof config.multiplier === 'number' ? config.multiplier : 1.72,  // ~94.6% RTP
      gameType: 'UPGRADE',
      meta: { mode: 'upgrade' },
      nftChance: config.nftChance,
      nftGiftIds: config.nftGiftIds
    });

    return applyHeaders(
      NextResponse.json({ success: true, result }),
      rateResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сыграть.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
