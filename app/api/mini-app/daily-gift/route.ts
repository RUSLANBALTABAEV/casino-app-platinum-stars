import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { claimDailyGift, getDailyGiftStatus } from '@/lib/services/daily-gift';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

function getInitDataHeader(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest) {
  const rawInitData = getInitDataHeader(req);
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }

  try {
    const botToken = getBotToken();
    if (!verifyInitData(rawInitData, botToken)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }

  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-daily-gift:get`, {
    limit: 60,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const user = await resolveUser(req);
    const status = await getDailyGiftStatus(user.userId);
    return applyHeaders(NextResponse.json({ status }), rateResult);
  } catch (error: unknown) {
    let message = 'Не удалось получить ежедневный подарок';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-daily-gift:post`, {
    limit: 10,
    windowMs: 5 * 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const user = await resolveUser(req);
    const result = await claimDailyGift(user.userId);
    const status = await getDailyGiftStatus(user.userId);
    return applyHeaders(
      NextResponse.json({
        success: true,
        result,
        status
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось забрать подарок.';
    if (error instanceof Error) {
      message = error.message;
    }
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
