import { NextRequest, NextResponse } from 'next/server';

import * as WithdrawalEnums from '@/types/withdrawal-enums';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { listUserWithdrawals, submitWithdrawal } from '@/lib/services/withdrawal';
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

async function ensureUser(req: NextRequest) {
  const rawInitData = getInitData(req);
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

  const parsed = parseInitData(rawInitData);
  assertInitDataIsFresh(parsed);
  const telegramUser = ensureTelegramUser(parsed);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 30,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Повторите позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const synced = await ensureUser(req);
    const withdrawals = await listUserWithdrawals(synced.userId);
    return applyHeaders(
      NextResponse.json({ withdrawals }),
      rateResult
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Не удалось получить историю выводов.';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:withdrawals`, {
    limit: 10,
    windowMs: 10 * 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: {
    amount?: number;
    destination?: string;
    type?: 'STARS' | 'NFT_GIFT';
    currency?: 'STARS' | 'XTR' | 'USD' | 'EUR';
    comment?: string | null;
    meta?: Record<string, unknown>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
      rateResult
    );
  }

  if (typeof body.destination !== 'string' || body.destination.trim().length === 0) {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите адрес или контакт для вывода.' }, { status: 422 }),
      rateResult
    );
  }

  try {
    const type: WithdrawalEnums.WithdrawalType =
      body.type === 'NFT_GIFT'
        ? WithdrawalEnums.WithdrawalType.NFT_GIFT
        : WithdrawalEnums.WithdrawalType.STARS;
    const requestedAmount = body.amount;
    if (type === WithdrawalEnums.WithdrawalType.STARS) {
      if (
        typeof requestedAmount !== 'number' ||
        Number.isNaN(requestedAmount) ||
        requestedAmount <= 0
      ) {
        return applyHeaders(
          NextResponse.json({ error: 'Укажите корректную сумму вывода.' }, { status: 422 }),
          rateResult
        );
      }
    } else if (
      typeof requestedAmount === 'number' &&
      (Number.isNaN(requestedAmount) || requestedAmount <= 0)
    ) {
      return applyHeaders(
        NextResponse.json({ error: 'Количество NFT должно быть положительным.' }, { status: 422 }),
        rateResult
      );
    }

    const allowedCurrencies: WithdrawalEnums.WithdrawalCurrency[] = [
      WithdrawalEnums.WithdrawalCurrency.STARS,
      WithdrawalEnums.WithdrawalCurrency.XTR,
      WithdrawalEnums.WithdrawalCurrency.USD,
      WithdrawalEnums.WithdrawalCurrency.EUR
    ];
    const currency =
      body.currency && allowedCurrencies.includes(body.currency as WithdrawalEnums.WithdrawalCurrency)
        ? (body.currency as WithdrawalEnums.WithdrawalCurrency)
        : WithdrawalEnums.WithdrawalCurrency.STARS;

    const synced = await ensureUser(req);
    const withdrawal = await submitWithdrawal({
      userId: synced.userId,
      amount:
        type === WithdrawalEnums.WithdrawalType.STARS && typeof body.amount === 'number'
          ? body.amount
          : 1,
      destination: body.destination.trim(),
      type,
      currency,
      comment: body.comment ?? null,
      meta: body.meta ?? {}
    });
    return applyHeaders(NextResponse.json({ withdrawal }), rateResult);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Не удалось создать заявку на вывод.';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}
