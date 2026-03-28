import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getGameAvailability, getGameSetting } from '@/lib/services/game-settings';
import { syncTelegramUser } from '@/lib/services/user';
import { isDemoRequest } from '@/lib/demo-mode';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function ensureUser(req: NextRequest) {
  const raw = getInitData(req);
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing init data');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) {
      throw new Error('Invalid signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }

  const data = parseInitData(raw);
  assertInitDataIsFresh(data);
  const telegramUser = ensureTelegramUser(data);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(getClientIdentifier(req), {
    limit: 45,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  const url = new URL(req.url);
  const gameTypeParam = url.searchParams.get('gameType') ?? 'ROULETTE';

  if (
    ![
      'ROULETTE',
      'RUNNER',
      'LOTTERY',
      'CASE',
      'BONUS',
      'CRASH',
      'MINES',
      'COINFLIP',
      'TICTACTOE',
      'UPGRADE',
      'BATTLE',
      'CRAFT'
    ].includes(gameTypeParam)
  ) {
    return applyHeaders(
      NextResponse.json({ error: 'Unsupported game type' }, { status: 400 }),
      rateResult
    );
  }

  try {
    if (!isDemoRequest(req)) {
      await ensureUser(req);
    }
  } catch (error: unknown) {
    let message = 'Unauthorized';
    if (error instanceof Error) {
      message = error.message;
    }
    return applyHeaders(NextResponse.json({ error: message }, { status: 401 }), rateResult);
  }

  let setting: unknown = null;
  try {
    setting = await getGameSetting(
      gameTypeParam as
        | 'ROULETTE'
        | 'RUNNER'
        | 'LOTTERY'
        | 'CASE'
        | 'BONUS'
        | 'CRASH'
        | 'MINES'
        | 'COINFLIP'
        | 'TICTACTOE'
        | 'UPGRADE'
        | 'BATTLE'
        | 'CRAFT',
      'config'
    );
  } catch {
    setting = null;
  }

  const configValue =
    setting && typeof setting === 'object' && 'value' in setting
      ? (setting as { value: unknown }).value ?? null
      : null;

  const availability = await getGameAvailability(
    gameTypeParam as
      | 'ROULETTE'
      | 'RUNNER'
      | 'LOTTERY'
      | 'CASE'
      | 'BONUS'
      | 'CRASH'
      | 'MINES'
      | 'COINFLIP'
      | 'TICTACTOE'
      | 'UPGRADE'
      | 'BATTLE'
      | 'CRAFT'
  );

  return applyHeaders(
    NextResponse.json({
      gameType: gameTypeParam,
      config: configValue,
      status: availability
    }),
    rateResult
  );
}
