import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const MIN_STARS = 10;
const MAX_STARS = 50000;

type CreateInvoiceBody = {
  stars?: number;
  promoCode?: string;
};

function normalizePromoCode(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const normalized = input.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 64) {
    throw new Error('Промокод слишком длинный.');
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new Error('Промокод содержит недопустимые символы.');
  }
  return normalized;
}

async function ensureUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    throw new Error('Отсутствуют данные инициализации Telegram.');
  }

  const botToken = getBotToken();
  if (!verifyInitData(raw, botToken)) {
    throw new Error('Не удалось подтвердить подпись Telegram.');
  }

  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  const syncResult = await syncTelegramUser(telegramUser);
  const userId = syncResult.userId;

  return { userId, telegramUser };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:telegram-stars`, {
    limit: 15,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const { userId, telegramUser } = await ensureUser(req);

    const body = (await req.json()) as CreateInvoiceBody;
    const stars = Number(body?.stars ?? 0);
    const promoCode = normalizePromoCode(body?.promoCode);

    if (!Number.isInteger(stars) || stars < MIN_STARS || stars > MAX_STARS) {
      return applyHeaders(
        NextResponse.json(
          { error: `Количество звёзд должно быть в диапазоне ${MIN_STARS}–${MAX_STARS}.` },
          { status: 400 }
        ),
        rateResult
      );
    }

    // Payload должен быть строкой до 128 символов, содержащей только буквы, цифры, дефисы и подчеркивания
    // Telegram user ID может быть BigInt, преобразуем в строку
    const userIdStr = String(telegramUser.id);
    const timestamp = Date.now();
    const payload = `stars_${userIdStr}_${timestamp}`.substring(0, 128);
    const botToken = getBotToken();

    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Пополнение звёзд',
        description: `Пополнение баланса на ${stars} ★`,
        payload: payload,
        currency: 'XTR',
        prices: [
          {
            label: 'Звёзды',
            amount: stars
          }
        ]
      })
    });

    const data = (await response.json()) as { ok: boolean; result?: string; description?: string };

    if (!response.ok || !data?.ok || !data.result) {
      const message = data?.description ?? 'Telegram вернул ошибку при создании счёта.';
      return applyHeaders(NextResponse.json({ error: message }, { status: 502 }), rateResult);
    }

    await prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        amount: stars,
        currency: 'XTR',
        provider: 'TELEGRAM_STARS',
        providerRef: payload,
        status: 'PENDING',
        meta: {
          invoiceUrl: data.result,
          promoCode
        }
      }
    });

    return applyHeaders(NextResponse.json({ invoiceUrl: data.result, payload, promoCode }), rateResult);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось подготовить пополнение через Telegram.';
    const status = message.includes('инициализации') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}
