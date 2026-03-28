import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { createSellOrder } from '@/lib/services/nft-shop';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
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
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-nfts:sell`, {
    limit: 20,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let payload: { userGiftId?: string };
  try {
    payload = (await req.json()) as { userGiftId?: string };
  } catch {
    return applyHeaders(NextResponse.json({ error: 'Некорректные данные запроса.' }, { status: 400 }), rateResult);
  }

  if (!payload.userGiftId) {
    return applyHeaders(NextResponse.json({ error: 'Не указан NFT для продажи.' }, { status: 400 }), rateResult);
  }

  try {
    if (isDemoRequest(req)) {
      return applyHeaders(
        NextResponse.json({
          success: true,
          balance: getDemoBalance(),
          soldId: payload.userGiftId
        }),
        rateResult
      );
    }

    const user = await resolveUser(req);
    const result = await createSellOrder({
      userId: user.userId,
      userGiftId: payload.userGiftId,
      source: 'MINI_APP'
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        balance: {
          available: result.balance.available,
          reserved: result.balance.reserved,
          bonusAvailable: result.balance.bonusAvailable,
          bonusReserved: result.balance.bonusReserved
        },
        gift: result.gift
          ? {
              id: result.gift.id,
              name: result.gift.gift.name,
              rarity: result.gift.gift.rarity,
              priceStars: result.gift.gift.priceStars
            }
          : null
      }),
      rateResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось продать NFT.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
