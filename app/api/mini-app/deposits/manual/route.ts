import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getEconomyConfig } from '@/lib/services/economy';
import { prisma } from '@/lib/prisma';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function ensureAuthorized(req: NextRequest) {
  const rawInitData = getInitData(req);
  if (!rawInitData) {
    throw new Error('Missing init data');
  }

  const botToken = getBotToken();
  if (!verifyInitData(rawInitData, botToken)) {
    throw new Error('Invalid Telegram signature');
  }

  const parsed = parseInitData(rawInitData);
  assertInitDataIsFresh(parsed);
  const telegramUser = ensureTelegramUser(parsed);
  return syncTelegramUser(telegramUser);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 10,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const syncResult = await ensureAuthorized(req);
    if (!syncResult || !syncResult.userId) {
      return applyHeaders(
        NextResponse.json({ error: 'Не удалось синхронизировать пользователя' }, { status: 401 }),
        rateResult
      );
    }

    const userId = syncResult.userId;
    const body = (await req.json().catch(() => ({}))) as {
      stars?: number;
      rubAmount?: number;
      paymentPurpose?: string;
    };

    if (!body.stars || typeof body.stars !== 'number' || body.stars <= 0) {
      return applyHeaders(
        NextResponse.json({ error: 'Укажите корректное количество звёзд' }, { status: 400 }),
        rateResult
      );
    }

    const economy = await getEconomyConfig();
    const customPurchase = economy.customPurchase;

    if (body.stars < customPurchase.minStars || body.stars > customPurchase.maxStars) {
      return applyHeaders(
        NextResponse.json(
          {
            error: `Количество звёзд должно быть от ${customPurchase.minStars} до ${customPurchase.maxStars}`
          },
          { status: 400 }
        ),
        rateResult
      );
    }

    const calculatedRubAmount = Math.ceil(body.stars * customPurchase.rubPerStar);
    const rubAmount = body.rubAmount ?? calculatedRubAmount;

    const validPurposes = ['долг', 'подарок', 'занимаю'];
    if (!body.paymentPurpose || typeof body.paymentPurpose !== 'string' || !validPurposes.includes(body.paymentPurpose)) {
      return applyHeaders(
        NextResponse.json(
          { error: 'Назначение платежа обязательно. Выберите: долг, подарок или занимаю' },
          { status: 400 }
        ),
        rateResult
      );
    }
    const paymentPurpose = body.paymentPurpose;

    const depositRequest = await prisma.manualDepositRequest.create({
      data: {
        userId: userId,
        stars: body.stars,
        rubAmount,
        paymentPurpose,
        status: 'PENDING'
      }
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        depositRequestId: depositRequest.id
      }),
      rateResult
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message ? error.message : 'Unauthorized request';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 401 }),
      rateResult
    );
  }
}

