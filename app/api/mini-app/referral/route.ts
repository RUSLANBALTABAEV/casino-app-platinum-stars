import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getReferralStats, registerReferral } from '@/lib/services/referral';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

function getInitDataHeader(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function ensureUser(req: NextRequest) {
  const rawInitData = getInitDataHeader(req);
  if (!rawInitData) {
    throw new Error('Missing X-Telegram-Init-Data header');
  }

  const botToken = getBotToken();
  if (!verifyInitData(rawInitData, botToken)) {
    throw new Error('Invalid Telegram signature');
  }

  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:referral:get`, {
    limit: 30,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const synced = await ensureUser(req);
    const stats = await getReferralStats(synced.userId);
    return applyHeaders(NextResponse.json({ referral: stats }), rateResult);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Не удалось получить данные реферальной программы';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:referral:post`, {
    limit: 10,
    windowMs: 10 * 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Повторите позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: { action?: string; code?: string };
  try {
    body = (await req.json()) as { action?: string; code?: string };
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
      rateResult
    );
  }

  const action = body.action ?? 'attach';

  try {
    const synced = await ensureUser(req);
    if (action === 'attach') {
      if (!body.code) {
        return applyHeaders(
          NextResponse.json({ error: 'Укажите реферальный код' }, { status: 422 }),
          rateResult
        );
      }
      await registerReferral(synced.userId, body.code);
      const stats = await getReferralStats(synced.userId);
      return applyHeaders(NextResponse.json({ success: true, referral: stats }), rateResult);
    }

    return applyHeaders(
      NextResponse.json({ error: 'Unsupported action' }, { status: 400 }),
      rateResult
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Не удалось обработать реферальный запрос';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}
