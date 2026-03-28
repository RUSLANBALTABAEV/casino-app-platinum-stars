'use server';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';

export async function createPromo(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const code = formData.get('code');
  const description = formData.get('description');
  const rewardRaw = formData.get('reward');
  const usageLimitRaw = formData.get('usageLimit');
  const perUserLimitRaw = formData.get('perUserLimit');
  const bonusPercentRaw = formData.get('bonusPercent');
  const validFromRaw = formData.get('validFrom');
  const validToRaw = formData.get('validTo');
  const grantsStatusRaw = formData.get('grantsStatus');
  const statusDurationRaw = formData.get('statusDurationDays');

  if (typeof code !== 'string' || !code.trim()) {
    throw new Error('Укажите код промокода.');
  }

  const reward = Number.parseInt(typeof rewardRaw === 'string' ? rewardRaw : '0', 10);
  if (Number.isNaN(reward) || reward < 0) {
    throw new Error('Неверное значение бонуса.');
  }

  const usageLimit =
    typeof usageLimitRaw === 'string' && usageLimitRaw.trim().length > 0
      ? Number.parseInt(usageLimitRaw, 10)
      : null;
  const perUserLimit =
    typeof perUserLimitRaw === 'string' && perUserLimitRaw.trim().length > 0
      ? Number.parseInt(perUserLimitRaw, 10)
      : 1;
  const bonusPercent =
    typeof bonusPercentRaw === 'string' && bonusPercentRaw.trim().length > 0
      ? Number.parseInt(bonusPercentRaw, 10)
      : 0;

  const validFrom =
    typeof validFromRaw === 'string' && validFromRaw ? new Date(validFromRaw) : null;
  const validTo =
    typeof validToRaw === 'string' && validToRaw ? new Date(validToRaw) : null;

  let grantsStatus: 'STANDARD' | 'PREMIUM' | null = null;
  if (typeof grantsStatusRaw === 'string' && grantsStatusRaw !== 'none' && grantsStatusRaw.trim()) {
    const normalized = grantsStatusRaw.trim().toUpperCase();
    if (normalized === 'STANDARD' || normalized === 'PREMIUM') {
      grantsStatus = normalized;
    } else {
      throw new Error('Некорректный статус для промокода.');
    }
  }

  const statusDurationDays =
    grantsStatus && typeof statusDurationRaw === 'string' && statusDurationRaw.trim().length > 0
      ? Number.parseInt(statusDurationRaw, 10)
      : null;

  if (statusDurationDays !== null && (Number.isNaN(statusDurationDays) || statusDurationDays <= 0)) {
    throw new Error('Длительность статуса должна быть положительным числом.');
  }

  await db.promoCode.create({
    data: {
      code: code.trim().toUpperCase(),
      description: typeof description === 'string' ? description.trim() : null,
      starReward: reward,
      usageLimit,
      isActive: true,
      perUserLimit: perUserLimit ?? 1,
      bonusPercent,
      validFrom,
      validTo,
      grantsStatus,
      statusDurationDays
    }
  });

  revalidatePath('/admin/promo');
}

export async function togglePromo(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const promoId = formData.get('promoId');
  const command = formData.get('command');

  if (typeof promoId !== 'string' || !promoId) {
    throw new Error('Идентификатор промокода обязателен.');
  }

  const isActivate = command === 'activate';

  await db.promoCode.update({
    where: { id: promoId },
    data: {
      isActive: isActivate
    }
  });

  revalidatePath('/admin/promo');
}
