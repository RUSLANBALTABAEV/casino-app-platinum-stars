import type { PrismaClient } from '@prisma/client';
import { addDays, isAfter } from 'date-fns';

import { prisma } from '@/lib/prisma';
import { StatusPlan } from '@/types/status-plan';

export type UserStatus = 'STANDARD' | 'PREMIUM';

interface StatusPlanInput {
  slug: string;
  name: string;
  description?: string | null;
  tier: UserStatus;
  price: number;
  currency: string;
  durationDays?: number | null;
  benefits?: Record<string, unknown> | null;
  isActive?: boolean;
}

type StatusPlanRecord = StatusPlan;
type StatusClient = Pick<PrismaClient, 'user' | 'securityEvent'>;

function normalizeBenefits(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export async function listStatusPlans(
  options: { includeInactive?: boolean } = {}
): Promise<StatusPlanRecord[]> {
  const { includeInactive = false } = options;

  const plans = await prisma.statusPlan.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [
      { tier: 'asc' },
      { price: 'asc' }
    ]
  });

  return plans.map((plan: StatusPlanRecord) => ({
    ...plan,
    benefits: normalizeBenefits(plan.benefits)
  }));
}

export async function getStatusPlanBySlug(slug: string): Promise<StatusPlanRecord | null> {
  const plan = await prisma.statusPlan.findUnique({
    where: { slug }
  });

  if (!plan) {
    return null;
  }

  return {
    ...plan,
    benefits: normalizeBenefits(plan.benefits)
  };
}

export async function upsertStatusPlan(input: StatusPlanInput): Promise<StatusPlanRecord> {
  const {
    slug,
    name,
    description,
    tier,
    price,
    currency,
    durationDays,
    benefits,
    isActive = true
  } = input;

  const plan = await prisma.statusPlan.upsert({
    where: { slug },
    create: {
      slug,
      name,
      description: description ?? null,
      tier,
      price,
      currency,
      durationDays: durationDays ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      benefits: (benefits as any) ?? null,
      isActive
    },
    update: {
      name,
      description: description ?? null,
      tier,
      price,
      currency,
      durationDays: durationDays ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      benefits: (benefits as any) ?? null,
      isActive
    }
  });

  return {
    ...plan,
    benefits: normalizeBenefits(plan.benefits)
  };
}

interface ApplyUserStatusOptions {
  durationDays?: number | null;
  expiresAt?: Date | null;
  actorId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  client?: StatusClient;
}

export async function applyUserStatus(
  userId: string,
  tier: UserStatus,
  options: ApplyUserStatusOptions = {}
) : Promise<{
  id: string;
  status: UserStatus;
  statusExpiresAt: Date | null;
}> {
  const now = new Date();
  let expiresAt: Date | null = null;

  if (options.expiresAt) {
    expiresAt = options.expiresAt;
  } else if (options.durationDays && options.durationDays > 0) {
    expiresAt = addDays(now, options.durationDays);
  }

  const db: StatusClient = options.client ?? prisma;

  const updated = await db.user.update({
    where: { id: userId },
    data: {
      status: tier,
      statusExpiresAt: tier === 'PREMIUM' ? expiresAt : null,
      isPremium: tier === 'PREMIUM'
    },
    select: {
      id: true,
      status: true,
      statusExpiresAt: true
    }
  });

  await db.securityEvent.create({
    data: {
      type: 'STATUS_CHANGED',
      severity: 'INFO',
      message: `Статус изменён на ${tier}`,
      userId,
      metadata: {
        expiresAt: updated.statusExpiresAt ?? null,
        reason: options.reason ?? null,
        actor: options.actorId ?? null,
        ...(options.metadata ?? {})
      }
    }
  });

  return updated;
}

export async function ensureUserStatusFresh(userId: string): Promise<void> {
  const record = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      statusExpiresAt: true
    }
  });

  if (!record) {
    return;
  }

  if (
    record.status === 'PREMIUM' &&
    record.statusExpiresAt instanceof Date &&
    isAfter(new Date(), record.statusExpiresAt)
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'STANDARD',
        statusExpiresAt: null,
        isPremium: false
      }
    });

    await prisma.securityEvent.create({
      data: {
        type: 'STATUS_EXPIRED',
        severity: 'INFO',
        message: 'Премиум-статус истёк автоматически',
        userId
      }
    });
  }
}
