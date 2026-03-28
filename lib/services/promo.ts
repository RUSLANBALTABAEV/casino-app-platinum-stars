import { addDays, isAfter, isBefore, startOfDay } from 'date-fns';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

export interface PromoRedemptionResult {
  reward: number;
  promoId: string;
  code: string;
  totalRedeemed: number;
  remainingGlobalUses: number | null;
  grantedStatus: {
    tier: 'STANDARD' | 'PREMIUM';
    expiresAt: Date | null;
  } | null;
}

type PromoSelection = {
  usageLimit?: number | null;
  perUserLimit?: number | null;
  _count: { redemptions: number };
  redemptions: Array<{ id: string }>;
  grantsStatus?: 'STANDARD' | 'PREMIUM' | null;
  statusDurationDays?: number | null;
};

export async function redeemPromoForUser(userId: string, code: string): Promise<PromoRedemptionResult> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('Промокод не должен быть пустым');
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: normalizedCode },
    include: {
      _count: {
        select: { redemptions: true }
      }
    }
  });

  if (!promo) {
    await logSecurityEvent({
      type: 'PROMO_INVALID',
      severity: 'WARNING',
      message: `Промокод не найден: ${normalizedCode}`,
      userId
    });
    throw new Error('Промокод не найден');
  }

  if (!promo.isActive) {
    await logSecurityEvent({
      type: 'PROMO_INVALID',
      severity: 'WARNING',
      message: `Неактивный промокод: ${normalizedCode}`,
      userId
    });
    throw new Error('Промокод не найден');
  }

  const now = new Date();
  if (promo.validFrom && isBefore(now, promo.validFrom)) {
    throw new Error('Промокод ещё не активирован');
  }
  if (promo.validTo && isAfter(now, promo.validTo)) {
    await logSecurityEvent({
      type: 'PROMO_EXPIRED',
      severity: 'INFO',
      message: `Истёкший промокод: ${normalizedCode}`,
      userId
    });
    throw new Error('Срок промокода истёк');
  }
  if (promo.usageLimit && promo._count.redemptions >= promo.usageLimit) {
    await logSecurityEvent({
      type: 'PROMO_LIMIT',
      severity: 'INFO',
      message: `Лимит промокода исчерпан: ${normalizedCode}`,
      userId
    });
    throw new Error('Лимит активаций промокода исчерпан');
  }

  const existingRedemption = await prisma.promoRedemption.findUnique({
    where: {
      userId_promoId: {
        userId,
        promoId: promo.id
      }
    }
  });

  if (existingRedemption) {
    await logSecurityEvent({
      type: 'PROMO_DUPLICATE',
      severity: 'WARNING',
      message: `Повторная попытка активации промокода: ${normalizedCode}`,
      userId
    });
    throw new Error('Вы уже активировали этот промокод');
  }

  const reward = promo.starReward ?? 0;
  let grantedStatus: PromoRedemptionResult['grantedStatus'] = null;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const newRedemption = await tx.promoRedemption.create({
      data: {
        promoId: promo.id,
        userId,
        reward
      }
    });

    if (reward > 0) {
      // Получаем или создаем баланс
      const existingBalance = await tx.starBalance.findUnique({
        where: { userId }
      });

      if (!existingBalance) {
        await tx.starBalance.create({
          data: {
            userId,
            available: reward,
            reserved: 0,
            lifetimeEarn: reward,
            lifetimeSpend: 0,
            bonusAvailable: 0,
            bonusReserved: 0,
            bonusLifetimeEarn: 0,
            bonusLifetimeSpend: 0
          }
        });
      } else {
        await tx.starBalance.update({
          where: { userId },
          data: {
            available: { increment: reward },
            lifetimeEarn: { increment: reward }
          }
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          type: 'REWARD',
          amount: reward,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'PROMO',
            code: promo.code
          }
        }
      });
    }

    if (promo.grantsStatus) {
      let expiresAt: Date | null = null;
      if (typeof promo.statusDurationDays === 'number' && promo.statusDurationDays > 0) {
        expiresAt = addDays(new Date(), promo.statusDurationDays);
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          status: promo.grantsStatus,
          statusExpiresAt: promo.grantsStatus === 'PREMIUM' ? expiresAt : null,
          isPremium: promo.grantsStatus === 'PREMIUM'
        },
        select: {
          id: true
        }
      });

      await tx.securityEvent.create({
        data: {
          type: 'STATUS_BY_PROMO',
          severity: 'INFO',
          message: `Статус ${promo.grantsStatus} выдан промокодом ${promo.code}`,
          userId: updated.id,
          metadata: {
            expiresAt
          }
        }
      });

      grantedStatus = {
        tier: promo.grantsStatus,
        expiresAt
      };
    }

    return newRedemption;
  });

  const remaining =
    promo.usageLimit !== null && promo.usageLimit !== undefined
      ? promo.usageLimit - (promo._count.redemptions + 1)
      : null;

  await logSecurityEvent({
    type: 'PROMO_REDEEMED',
    severity: 'INFO',
    message: `Промокод ${promo.code} активирован`,
    userId,
    metadata: {
      reward
    }
  });

  return {
    reward,
    promoId: promo.id,
    code: promo.code,
    totalRedeemed: promo._count.redemptions + 1,
    remainingGlobalUses: remaining,
    grantedStatus
  };
}

export async function countAvailablePromos(userId: string): Promise<number> {
  const now = new Date();

  const promos = await prisma.promoCode.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validTo: null }, { validTo: { gte: now } }] }
      ]
    },
    include: {
      _count: { select: { redemptions: true } },
      redemptions: {
        where: { userId },
        select: { id: true }
      }
    }
  });

  return promos.filter((promo: PromoSelection & { usageLimit?: number | null; perUserLimit?: number | null }) => {
    const data = promo as PromoSelection;
    if (promo.usageLimit && promo._count.redemptions >= promo.usageLimit) {
      return false;
    }
    if (data.redemptions.length >= (promo.perUserLimit ?? 1)) {
      return false;
    }
    return true;
  }).length;
}

export function getDailyWindow(date: Date = new Date()): { start: Date; end: Date } {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  return { start, end };
}
