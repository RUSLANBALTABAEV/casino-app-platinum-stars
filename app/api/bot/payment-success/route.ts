import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { changeStarBalance } from '@/lib/services/starBalanceService';
import { ensureDatabaseReady } from '@/lib/db/ensure';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:payment-success`, {
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
    await ensureDatabaseReady();

    const body = (await req.json()) as {
      telegramId?: number;
      payload?: string;
      stars?: number;
      currency?: string;
      telegramPaymentChargeId?: string;
      providerPaymentChargeId?: string;
    };

    if (!body.telegramId || !body.payload || !body.stars) {
      return applyHeaders(
        NextResponse.json({ error: 'Недостаточно данных для обработки платежа' }, { status: 400 }),
        rateResult
      );
    }

    const telegramId = BigInt(body.telegramId);
    const stars = Number(body.stars);

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return applyHeaders(
        NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 }),
        rateResult
      );
    }

    // Проверяем, не обработан ли уже этот платеж
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        providerRef: body.payload,
        provider: 'TELEGRAM_STARS',
        status: 'COMPLETED'
      }
    });

    if (existingTransaction) {
      return applyHeaders(
        NextResponse.json({ error: 'Платеж уже обработан', success: true }),
        rateResult
      );
    }

    // Обновляем транзакцию со статусом PENDING на COMPLETED
    const transaction = await prisma.transaction.findFirst({
      where: {
        providerRef: body.payload,
        provider: 'TELEGRAM_STARS',
        status: 'PENDING'
      }
    });

    if (transaction) {
      // Обновляем баланс
      await changeStarBalance(user.id, stars);

      // Обновляем транзакцию
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'COMPLETED',
          meta: {
            ...((transaction.meta as Record<string, unknown>) || {}),
            telegramPaymentChargeId: body.telegramPaymentChargeId,
            providerPaymentChargeId: body.providerPaymentChargeId,
            processedAt: new Date().toISOString()
          }
        }
      });

      return applyHeaders(
        NextResponse.json({ success: true, stars }),
        rateResult
      );
    }

    // Если транзакции нет, создаем новую и зачисляем баланс
    await changeStarBalance(user.id, stars);

    await prisma.transaction.create({
      data: {
        userId: user.id,
        type: 'DEPOSIT',
        amount: stars,
        currency: body.currency || 'XTR',
        provider: 'TELEGRAM_STARS',
        providerRef: body.payload,
        status: 'COMPLETED',
        meta: {
          telegramPaymentChargeId: body.telegramPaymentChargeId,
          providerPaymentChargeId: body.providerPaymentChargeId,
          processedAt: new Date().toISOString()
        }
      }
    });

    return applyHeaders(
      NextResponse.json({ success: true, stars }),
      rateResult
    );
  } catch (error) {
    console.error('Payment processing error:', error);
    const message = error instanceof Error ? error.message : 'Ошибка обработки платежа';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      rateResult
    );
  }
}

