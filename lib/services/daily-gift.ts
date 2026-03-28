import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getSystemSetting, upsertSystemSetting } from '@/lib/services/system-settings';

export type DailyGiftStatus = {
  canClaim: boolean;
  secondsUntilNextClaim: number;
  currentStreak: number;
  nextReward: number;
  nextStreak: number;
  lastClaimedAt: Date | null;
};

export type DailyGiftConfig = {
  cooldownSeconds: number;
  baseReward: number;
  streakStep: number;
  maxReward: number;
  rewardsByDay?: number[];
};

const DAILY_GIFT_SETTING_KEY = 'dailyGift:config';
const DEFAULT_CONFIG: DailyGiftConfig = {
  cooldownSeconds: 24 * 60 * 60,
  baseReward: 10,
  streakStep: 2,
  maxReward: 40,
  rewardsByDay: []
};

function normalizeConfig(value: unknown): DailyGiftConfig {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CONFIG;
  }
  const record = value as Record<string, unknown>;
  const cooldownSecondsRaw = typeof record.cooldownSeconds === 'number' ? record.cooldownSeconds : DEFAULT_CONFIG.cooldownSeconds;
  const baseRewardRaw = typeof record.baseReward === 'number' ? record.baseReward : DEFAULT_CONFIG.baseReward;
  const streakStepRaw = typeof record.streakStep === 'number' ? record.streakStep : DEFAULT_CONFIG.streakStep;
  const maxRewardRaw = typeof record.maxReward === 'number' ? record.maxReward : DEFAULT_CONFIG.maxReward;
  const rewardsByDayRaw = Array.isArray(record.rewardsByDay)
    ? record.rewardsByDay.filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0).map((v) => Math.round(v))
    : [];

  return {
    cooldownSeconds: Math.max(60, Math.floor(cooldownSecondsRaw)),
    baseReward: Math.max(0, Math.round(baseRewardRaw)),
    streakStep: Math.max(0, Math.round(streakStepRaw)),
    maxReward: Math.max(0, Math.round(maxRewardRaw)),
    rewardsByDay: rewardsByDayRaw
  };
}

export async function getDailyGiftConfig(): Promise<DailyGiftConfig> {
  const raw = await getSystemSetting<DailyGiftConfig>(DAILY_GIFT_SETTING_KEY, DEFAULT_CONFIG);
  return normalizeConfig(raw);
}

export async function setDailyGiftConfig(next: DailyGiftConfig): Promise<void> {
  const normalized = normalizeConfig(next);
  await upsertSystemSetting({
    key: DAILY_GIFT_SETTING_KEY,
    value: normalized,
    description: 'Настройки ежедневного подарка (награды, шаг серии, кулдаун)'
  });
}

function computeReward(streak: number, config: DailyGiftConfig): number {
  const normalizedStreak = Math.max(1, Math.floor(streak));
  const rewards = config.rewardsByDay ?? [];
  if (rewards.length > 0) {
    const reward = rewards[Math.min(rewards.length - 1, normalizedStreak - 1)] ?? 0;
    return Math.max(0, Math.round(reward));
  }

  const reward = config.baseReward + (normalizedStreak - 1) * config.streakStep;
  return Math.min(config.maxReward, Math.max(0, Math.round(reward)));
}

export async function getDailyGiftStatus(userId: string): Promise<DailyGiftStatus> {
  const config = await getDailyGiftConfig();
  const now = new Date();
  const today = startOfDay(now);

  const lastClaim = await prisma.dailyGiftClaim.findFirst({
    where: { userId },
    orderBy: { claimDay: 'desc' },
    select: {
      claimDay: true,
      createdAt: true,
      streak: true
    }
  });

  if (!lastClaim) {
    return {
      canClaim: true,
      secondsUntilNextClaim: 0,
      currentStreak: 0,
      nextStreak: 1,
      nextReward: computeReward(1, config),
      lastClaimedAt: null
    };
  }

  const lastDay = startOfDay(lastClaim.claimDay);
  const nextDay = addDays(lastDay, 1);
  const cooldownEnd = new Date(lastClaim.createdAt.getTime() + config.cooldownSeconds * 1000);
  // Гарантируем "раз в сутки" (уникальность userId+claimDay), даже если cooldownSeconds меньше суток.
  const nextAllowedAt = new Date(Math.max(nextDay.getTime(), cooldownEnd.getTime()));
  if (now.getTime() < nextAllowedAt.getTime()) {
    const seconds = Math.max(0, Math.floor((nextAllowedAt.getTime() - now.getTime()) / 1000));
    return {
      canClaim: false,
      secondsUntilNextClaim: seconds,
      currentStreak: lastClaim.streak,
      nextStreak: lastClaim.streak,
      nextReward: computeReward(lastClaim.streak, config),
      lastClaimedAt: lastClaim.createdAt
    };
  }

  const diff = differenceInCalendarDays(today, lastDay);

  const nextStreak = diff === 1 ? lastClaim.streak + 1 : 1;
  return {
    canClaim: true,
    secondsUntilNextClaim: 0,
    currentStreak: lastClaim.streak,
    nextStreak,
    nextReward: computeReward(nextStreak, config),
    lastClaimedAt: lastClaim.createdAt
  };
}

export async function claimDailyGift(userId: string): Promise<{
  reward: number;
  streak: number;
  balance: { available: number; reserved: number };
}> {
  const config = await getDailyGiftConfig();
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lastClaim = await tx.dailyGiftClaim.findFirst({
      where: { userId },
      orderBy: { claimDay: 'desc' },
      select: { claimDay: true, streak: true, createdAt: true }
    });

    if (lastClaim) {
      const lastDay = startOfDay(lastClaim.claimDay);
      const nextDay = addDays(lastDay, 1);
      const cooldownEnd = new Date(lastClaim.createdAt.getTime() + config.cooldownSeconds * 1000);
      const nextAllowedAt = new Date(Math.max(nextDay.getTime(), cooldownEnd.getTime()));

      if (lastDay.getTime() === today.getTime()) {
        throw new Error('Подарок уже получен. Возвращайтесь завтра!');
      }
      if (now.getTime() < nextAllowedAt.getTime()) {
        throw new Error('Подарок ещё не готов. Попробуйте позже!');
      }
    }

    const streak =
      lastClaim && startOfDay(lastClaim.claimDay).getTime() === yesterday.getTime()
        ? lastClaim.streak + 1
        : 1;
    const reward = computeReward(streak, config);

    // Записываем получение подарка (уникальность userId+claimDay защитит от гонок).
    try {
      await tx.dailyGiftClaim.create({
        data: {
          userId,
          claimDay: today,
          streak,
          reward
        }
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
      if (code === 'P2002') {
        // На всякий случай: два запроса одновременно. Не падаем Prisma-ошибкой.
        throw new Error('Подарок уже получен. Возвращайтесь завтра!');
      }
      throw error;
    }

    const existingBalance = await tx.starBalance.findUnique({
      where: { userId },
      select: { id: true, available: true, reserved: true }
    });

    const balance = existingBalance
      ? await tx.starBalance.update({
          where: { userId },
          data: {
            available: { increment: reward },
            lifetimeEarn: { increment: reward }
          },
          select: { available: true, reserved: true }
        })
      : await tx.starBalance.create({
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
          },
          select: { available: true, reserved: true }
        });

    await tx.transaction.create({
      data: {
        userId,
        type: 'REWARD',
        amount: reward,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'DAILY_GIFT',
          streak,
          claimDay: today.toISOString()
        }
      }
    });

    return { reward, streak, balance };
  });
}
