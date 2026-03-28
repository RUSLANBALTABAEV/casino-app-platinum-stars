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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 20,
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
    const resolvedParams = await params;
    const depositRequestId = resolvedParams.id;

    const depositRequest = await prisma.manualDepositRequest.findUnique({
      where: {
        id: depositRequestId,
        userId: userId
      },
      select: {
        id: true,
        stars: true,
        rubAmount: true,
        paymentPurpose: true,
        status: true,
        createdAt: true
      }
    });

    if (!depositRequest) {
      return applyHeaders(
        NextResponse.json({ error: 'Запрос не найден' }, { status: 404 }),
        rateResult
      );
    }

    return applyHeaders(
      NextResponse.json({
        success: true,
        depositRequest: {
          id: depositRequest.id,
          stars: depositRequest.stars,
          rubAmount: depositRequest.rubAmount,
          paymentPurpose: depositRequest.paymentPurpose,
          status: depositRequest.status,
          createdAt: depositRequest.createdAt.toISOString()
        }
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

