import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { changeBonusBalance, changeStarBalance } from '@/lib/services/starBalanceService';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';
import { ensureDatabaseReady } from '@/lib/db/ensure';

type PromoApplyResult = {
  promoApplied: boolean;
  promoCode: string | null;
  bonusStars: number;
  promoError: string | null;
};

function readPromoCode(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const raw = (meta as Record<string, unknown>).promoCode;
  if (typeof raw !== 'string') {
    return null;
  }
  const normalized = raw.trim().toUpperCase();
  return normalized ? normalized : null;
}

async function tryApplyDepositPromo(userId: string, depositStars: number, promoCode: string): Promise<PromoApplyResult> {
  const promo = await prisma.promoCode.findUnique({
    where: { code: promoCode },
    include: { _count: { select: { redemptions: true } } }
  });

  if (!promo || !promo.isActive) {
    return { promoApplied: false, promoCode, bonusStars: 0, promoError: 'Промокод не найден' };
  }

  const now = new Date();
  if (promo.validFrom && now < promo.validFrom) {
    return { promoApplied: false, promoCode: promo.code, bonusStars: 0, promoError: 'Промокод ещё не активирован' };
  }
  if (promo.validTo && now > promo.validTo) {
    return { promoApplied: false, promoCode: promo.code, bonusStars: 0, promoError: 'Срок промокода истёк' };
  }
  if (promo.usageLimit && promo._count.redemptions >= promo.usageLimit) {
    return {
      promoApplied: false,
      promoCode: promo.code,
      bonusStars: 0,
      promoError: 'Лимит активаций промокода исчерпан'
    };
  }
  if (!promo.bonusPercent || promo.bonusPercent <= 0) {
    return { promoApplied: false, promoCode: promo.code, bonusStars: 0, promoError: 'Этот промокод не даёт бонус к пополнению' };
  }

  const already = await prisma.promoRedemption.findUnique({
    where: { userId_promoId: { userId, promoId: promo.id } },
    select: { id: true }
  });
  if (already) {
    return { promoApplied: false, promoCode: promo.code, bonusStars: 0, promoError: 'Вы уже использовали этот промокод' };
  }

  const bonusStars = Math.floor((depositStars * promo.bonusPercent) / 100);
  if (bonusStars <= 0) {
    return { promoApplied: false, promoCode: promo.code, bonusStars: 0, promoError: 'Бонус по промокоду слишком мал для этой суммы' };
  }

  await prisma.promoRedemption.create({
    data: {
      userId,
      promoId: promo.id,
      reward: 0
    }
  });

  await prisma.transaction.create({
    data: {
      userId,
      type: 'REWARD',
      amount: bonusStars,
      currency: 'STARS',
      provider: 'MANUAL',
      status: 'COMPLETED',
      meta: {
        source: 'DEPOSIT_BONUS_PROMO',
        code: promo.code,
        bonusPercent: promo.bonusPercent,
        depositStars
      }
    }
  });

  return { promoApplied: true, promoCode: promo.code, bonusStars, promoError: null };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:telegram-stars-complete`, {
    limit: 10,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    await ensureDatabaseReady();

    const raw = req.headers.get('x-telegram-init-data');
    if (!raw) {
      return applyHeaders(
        NextResponse.json({ error: 'Отсутствуют данные инициализации Telegram.' }, { status: 401 }),
        rateResult
      );
    }

    const botToken = getBotToken();
    if (!verifyInitData(raw, botToken)) {
      return applyHeaders(
        NextResponse.json({ error: 'Не удалось подтвердить подпись Telegram.' }, { status: 401 }),
        rateResult
      );
    }

    const initData = parseInitData(raw);
    assertInitDataIsFresh(initData);
    const telegramUser = ensureTelegramUser(initData);
    const syncResult = await syncTelegramUser(telegramUser);
    const userId = syncResult.userId;

    const body = (await req.json()) as { payload?: string };
    if (!body.payload) {
      return applyHeaders(
        NextResponse.json({ error: 'Отсутствует payload платежа.' }, { status: 400 }),
        rateResult
      );
    }

    // Находим транзакцию со статусом PENDING
    const transaction = await prisma.transaction.findFirst({
      where: {
        providerRef: body.payload,
        provider: 'TELEGRAM_STARS',
        status: 'PENDING',
        userId: userId
      }
    });

    if (!transaction) {
      // Проверяем, может быть транзакция уже обработана
      const completedTransaction = await prisma.transaction.findFirst({
        where: {
          providerRef: body.payload,
          provider: 'TELEGRAM_STARS',
          status: 'COMPLETED',
          userId: userId
        }
      });

      if (completedTransaction) {
        return applyHeaders(
          NextResponse.json({ 
            success: true, 
            stars: completedTransaction.amount,
            message: 'Платеж уже обработан'
          }),
          rateResult
        );
      }

      return applyHeaders(
        NextResponse.json({ error: 'Транзакция не найдена.' }, { status: 404 }),
        rateResult
      );
    }

    const promoCode = readPromoCode(transaction.meta);
    const promoResult: PromoApplyResult = promoCode
      ? await tryApplyDepositPromo(userId, transaction.amount, promoCode).catch((error) => ({
          promoApplied: false,
          promoCode,
          bonusStars: 0,
          promoError: error instanceof Error ? error.message : 'Не удалось применить промокод'
        }))
      : { promoApplied: false, promoCode: null, bonusStars: 0, promoError: null };

    // Зачисляем баланс (депозит + бонус звёзд по промо)
    await changeStarBalance(userId, transaction.amount + promoResult.bonusStars);

    // Бонусная валюта 10% от суммы пополнения
    const bonusCoins = Math.floor(transaction.amount * 0.1);
    if (bonusCoins > 0) {
      await changeBonusBalance(userId, bonusCoins);
    }

    // Обновляем транзакцию
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'COMPLETED',
        meta: {
          ...((transaction.meta as Record<string, unknown>) || {}),
          completedAt: new Date().toISOString(),
          completedVia: 'frontend_callback',
          promoApplied: promoResult.promoApplied,
          promoCode: promoResult.promoCode,
          promoError: promoResult.promoError,
          bonusStars: promoResult.bonusStars
        }
      }
    });

    return applyHeaders(
      NextResponse.json({ 
        success: true, 
        stars: transaction.amount,
        bonusStars: promoResult.bonusStars,
        totalCredited: transaction.amount + promoResult.bonusStars,
        bonusCoins,
        promoApplied: promoResult.promoApplied,
        promoCode: promoResult.promoCode,
        promoError: promoResult.promoError
      }),
      rateResult
    );
  } catch (error) {
    console.error('Payment completion error:', error);
    const message = error instanceof Error ? error.message : 'Ошибка обработки платежа';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      rateResult
    );
  }
}

