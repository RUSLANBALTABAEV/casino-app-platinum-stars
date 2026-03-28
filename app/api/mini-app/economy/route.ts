import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getEconomyConfig, getActivityCostSummary } from '@/lib/services/economy';
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

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function ensureAuthorized(req: NextRequest) {
  const rawInitData = getInitData(req);
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing init data');
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

  const parsed = parseInitData(rawInitData);
  assertInitDataIsFresh(parsed);
  const telegramUser = ensureTelegramUser(parsed);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 40,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    await ensureAuthorized(req);
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message ? error.message : 'Unauthorized request';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 401 }),
      rateResult
    );
  }

  const [economy, activities] = await Promise.all([
    getEconomyConfig(),
    getActivityCostSummary()
  ]);

  return applyHeaders(
    NextResponse.json({
      economy,
      activityCosts: activities
    }),
    rateResult
  );
}
