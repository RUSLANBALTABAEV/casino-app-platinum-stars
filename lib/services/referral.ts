import crypto from 'crypto';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import { getSystemSetting, upsertSystemSetting } from '@/lib/services/system-settings';
import { Prisma } from '@prisma/client';

const REFERRAL_REWARD_SETTING_KEY = 'referral:reward';
const DEFAULT_REFERRAL_REWARD = 50;

export function generateReferralLink(botUsername: string, referralCode: string): string {
  const cleanUsername = botUsername.replace('@', '').trim();
  return `https://t.me/${cleanUsername}?start=${referralCode}`;
}

function generateCodeCandidate(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function getReferralReward(): Promise<number> {
  const raw = await getSystemSetting<number>(REFERRAL_REWARD_SETTING_KEY);
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw);
  }
  return DEFAULT_REFERRAL_REWARD;
}

export async function setReferralReward(value: number): Promise<void> {
  const normalized = Number.isFinite(value) && value >= 0 ? Math.round(value) : DEFAULT_REFERRAL_REWARD;
  await upsertSystemSetting({
    key: REFERRAL_REWARD_SETTING_KEY,
    value: normalized,
    description: 'Размер бонуса за активированную реферальную программу (в звёздах)'
  });
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateCodeCandidate();
    const existing = await prisma.user.count({
      where: { referralCode: candidate }
    });
    if (existing === 0) {
      return candidate;
    }
  }
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

export async function ensureUserReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true }
  });
  if (user?.referralCode) {
    return user.referralCode;
  }
  const code = await generateUniqueReferralCode();
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
    select: { referralCode: true }
  });
  return updated.referralCode;
}

export async function registerReferral(inviteeId: string, referralCode: string): Promise<void> {
  const normalizedCode = referralCode.trim();
  if (!normalizedCode) {
    throw new Error('Укажите реферальный код.');
  }

  const [invitee, inviter] = await Promise.all([
    prisma.user.findUnique({
      where: { id: inviteeId },
      select: {
        id: true,
        referralRecord: {
          select: { id: true }
        }
      }
    }),
    prisma.user.findFirst({
      where: {
        referralCode: {
          equals: normalizedCode,
          mode: 'insensitive'
        }
      },
      select: { id: true }
    })
  ]);

  if (!invitee) {
    throw new Error('Пользователь не найден.');
  }
  if (!inviter) {
    throw new Error('Неверный реферальный код.');
  }
  if (inviter.id === invitee.id) {
    throw new Error('Нельзя использовать собственный код.');
  }
  if (invitee.referralRecord) {
    throw new Error('Реферальный код уже был использован.');
  }

  const rewardAmount = await getReferralReward();
  const now = new Date();

  // Объединяем создание реферала и начисление награды в одну транзакцию
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Создаем запись реферала
    await tx.referral.create({
      data: {
        inviterId: inviter.id,
        inviteeId,
        rewardAmount,
        rewardIssued: true,
        completedAt: now
      }
    });

    // Начисляем награду рефереру
    await tx.starBalance.upsert({
      where: { userId: inviter.id },
      create: {
        userId: inviter.id,
        available: rewardAmount,
        lifetimeEarn: rewardAmount
      },
      update: {
        available: { increment: rewardAmount },
        lifetimeEarn: { increment: rewardAmount }
      }
    });

    // Создаем транзакцию для истории
    await tx.transaction.create({
      data: {
        userId: inviter.id,
        type: 'REWARD',
        amount: rewardAmount,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'REFERRAL',
          inviteeId,
          registeredAt: now.toISOString(),
          autoCompleted: true
        }
      }
    });
  });

  await logSecurityEvent({
    type: 'REFERRAL_REGISTERED',
    severity: 'INFO',
    message: `Реферальный код применён`,
    userId: inviteeId,
    metadata: {
      inviterId: inviter.id,
      rewardAmount
    }
  });

  await logSecurityEvent({
    type: 'REFERRAL_COMPLETED',
    severity: 'INFO',
    message: 'Реферальная награда начислена',
    userId: inviter.id,
    metadata: {
      inviteeId,
      registeredAt: now.toISOString(),
      autoCompleted: true
    }
  });
}

export async function completeReferral(inviteeId: string, metadata?: Record<string, unknown>): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const referral = await tx.referral.findUnique({
      where: { inviteeId },
      include: {
        inviter: {
          select: {
            id: true
          }
        }
      }
    });

    if (!referral) {
      throw new Error('Реферальная запись не найдена.');
    }
    if (referral.rewardIssued) {
      return;
    }

    const rewardAmount = referral.rewardAmount > 0 ? referral.rewardAmount : await getReferralReward();
    const now = new Date();

    await tx.referral.update({
      where: { id: referral.id },
      data: {
        rewardIssued: true,
        completedAt: now,
        rewardAmount
      }
    });

    await tx.starBalance.upsert({
      where: { userId: referral.inviter.id },
      create: {
        userId: referral.inviter.id,
        available: rewardAmount,
        lifetimeEarn: rewardAmount
      },
      update: {
        available: { increment: rewardAmount },
        lifetimeEarn: { increment: rewardAmount }
      }
    });

    await tx.transaction.create({
      data: {
        userId: referral.inviter.id,
        type: 'REWARD',
        amount: rewardAmount,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'REFERRAL',
          inviteeId,
          ...(metadata ?? {})
        }
      }
    });
  });

  await logSecurityEvent({
    type: 'REFERRAL_COMPLETED',
    severity: 'INFO',
    message: 'Реферальная награда начислена',
    userId: inviteeId,
    metadata
  });
}

export async function getReferralStats(userId: string): Promise<{
  referralCode: string;
  referralLink: string;
  invited: number;
  completed: number;
  pending: number;
  rewardPerFriend: number;
  referredBy: {
    id: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
}> {
  const reward = await getReferralReward();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralCode: true,
      referralsSent: {
        select: {
          id: true,
          rewardIssued: true
        }
      },
      referralRecord: {
        select: {
          rewardIssued: true,
          inviter: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  if (!user) {
    throw new Error('Пользователь не найден.');
  }

  const invited = user.referralsSent.length;
  const completed = user.referralsSent.filter((ref: { id: string; rewardIssued: boolean }) => ref.rewardIssued).length;
  const pending = invited - completed;

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || 'platinumstarsgamebot';
  const referralLink = generateReferralLink(botUsername, user.referralCode);

  return {
    referralCode: user.referralCode,
    referralLink,
    invited,
    completed,
    pending,
    rewardPerFriend: reward,
    referredBy: user.referralRecord?.inviter ?? null
  };
}
