import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import {
  getDefaultRunnerConfig,
  type RunnerConfig,
  type RunnerPayoutDefinition
} from '@/lib/config/runner-default';

type StoredRunnerConfig = {
  attemptCost?: number;
  payouts?: RunnerPayoutDefinition[];
  freeAttemptsPerDay?: number;
  cooldownSeconds?: number;
};

export interface RunnerBalance {
  available: number;
  reserved: number;
}

export interface RunnerStatus {
  freeAttemptsRemaining: number;
  cooldownSecondsRemaining: number;
  attemptCost: number;
}

export interface RunnerHistoryEntry {
  id: string;
  score: number;
  distance: number;
  cost: number;
  reward: number;
  freeAttempt: boolean;
  createdAt: Date;
}

export interface StartRunnerAttemptResult {
  attemptId: string;
  cost: number;
  freeAttempt: boolean;
  balance: RunnerBalance;
  status: RunnerStatus;
}

export interface FinishRunnerAttemptResult {
  reward: number;
  thresholdsUnlocked: RunnerPayoutDefinition[];
  balance: RunnerBalance;
  historyEntry: RunnerHistoryEntry;
  status: RunnerStatus;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

function normalizeRunnerConfig(value: unknown): RunnerConfig {
  if (!value || typeof value !== 'object') {
    return getDefaultRunnerConfig();
  }

  const record = value as StoredRunnerConfig;
  const fallback = getDefaultRunnerConfig();

  const attemptCost = toPositiveInteger(record.attemptCost, fallback.attemptCost);

  const payoutsSource = Array.isArray(record.payouts) ? record.payouts : fallback.payouts;
  const payouts: RunnerPayoutDefinition[] = [];

  payoutsSource.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const threshold = toPositiveInteger(entry.threshold, 0);
    const reward = toPositiveInteger(entry.reward, 0);
    if (!threshold || !reward) {
      return;
    }
    const normalized: RunnerPayoutDefinition = {
      threshold,
      reward
    };
    if (entry.label && typeof entry.label === 'string') {
      normalized.label = entry.label;
    }
    payouts.push(normalized);
  });

  payouts.sort((a, b) => a.threshold - b.threshold);

  const freeAttemptsPerDay = record.freeAttemptsPerDay
    ? toNonNegativeInteger(record.freeAttemptsPerDay, fallback.freeAttemptsPerDay ?? 0)
    : fallback.freeAttemptsPerDay ?? 0;

  const cooldownSeconds = record.cooldownSeconds
    ? toNonNegativeInteger(record.cooldownSeconds, fallback.cooldownSeconds ?? 0)
    : fallback.cooldownSeconds ?? 0;

  return {
    attemptCost,
    payouts: payouts.length ? payouts : fallback.payouts,
    freeAttemptsPerDay: freeAttemptsPerDay || undefined,
    cooldownSeconds: cooldownSeconds || undefined
  } satisfies RunnerConfig;
}

export async function getRunnerConfig(): Promise<RunnerConfig> {
  try {
    const record = await prisma.gameSetting.findUnique({
      where: {
        gameType_key: {
          gameType: 'RUNNER',
          key: 'config'
        }
      }
    });

    if (!record?.value) {
      return getDefaultRunnerConfig();
    }

    return normalizeRunnerConfig(record.value);
  } catch {
    return getDefaultRunnerConfig();
  }
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

async function countFreeAttemptsToday(userId: string): Promise<number> {
  const today = startOfToday();
  return prisma.gameSession.count({
    where: {
      userId,
      gameType: 'RUNNER',
      startedAt: {
        gte: today
      },
      metadata: {
        path: ['freeAttempt'],
        equals: true
      }
    }
  });
}

async function resolveCooldownSecondsRemaining(userId: string, cooldownSeconds?: number): Promise<number> {
  if (!cooldownSeconds || cooldownSeconds <= 0) {
    return 0;
  }

  const lastSession = await prisma.gameSession.findFirst({
    where: { userId, gameType: 'RUNNER' },
    orderBy: { startedAt: 'desc' }
  });

  if (!lastSession) {
    return 0;
  }

  const reference = lastSession.finishedAt ?? lastSession.startedAt;
  const diff = (Date.now() - reference.getTime()) / 1000;
  const remaining = cooldownSeconds - diff;
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

async function computeStatus(userId: string, config: RunnerConfig): Promise<RunnerStatus> {
  const freeAttemptsUsed = config.freeAttemptsPerDay
    ? await countFreeAttemptsToday(userId)
    : 0;
  const freeAttemptsRemaining = Math.max((config.freeAttemptsPerDay ?? 0) - freeAttemptsUsed, 0);
  const cooldownSecondsRemaining = await resolveCooldownSecondsRemaining(userId, config.cooldownSeconds);

  return {
    freeAttemptsRemaining,
    cooldownSecondsRemaining,
    attemptCost: config.attemptCost
  };
}

export async function getRunnerStatus(userId: string): Promise<RunnerStatus> {
  const config = await getRunnerConfig();
  return computeStatus(userId, config);
}

function sumRewards(payouts: RunnerPayoutDefinition[], score: number): {
  reward: number;
  thresholds: RunnerPayoutDefinition[];
} {
  const thresholds: RunnerPayoutDefinition[] = [];
  let reward = 0;
  payouts.forEach((entry) => {
    if (score >= entry.threshold) {
      reward += entry.reward;
      thresholds.push(entry);
    }
  });
  return { reward, thresholds };
}

export async function startRunnerAttempt({ userId }: { userId: string }): Promise<StartRunnerAttemptResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Операции раннера недоступны без подключения к базе данных.');
  }

  const config = await getRunnerConfig();
  const status = await computeStatus(userId, config);

  if (status.cooldownSecondsRemaining > 0) {
    throw new Error(`Подождите ${status.cooldownSecondsRemaining} сек., чтобы начать новый забег.`);
  }

  let cost = config.attemptCost;
  let freeAttempt = false;
  if (status.freeAttemptsRemaining > 0) {
    cost = 0;
    freeAttempt = true;
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let balance = await tx.starBalance.findUnique({ where: { userId } });
    
    // Если баланса нет - создаем его
    if (!balance) {
      balance = await tx.starBalance.create({
        data: {
          userId,
          available: 0,
          reserved: 0,
          lifetimeEarn: 0,
          lifetimeSpend: 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0
        }
      });
    }

    if (cost > 0 && balance.available < cost) {
      throw new Error('Недостаточно звёзд для участия в забеге.');
    }

    let updatedBalance = balance;
    
    if (cost > 0) {
      // Списываем баланс
      const balanceAfterSpend = balance.available - cost;
      
      updatedBalance = await tx.starBalance.update({
        where: { userId },
        data: {
          available: { set: balanceAfterSpend },
          lifetimeSpend: { increment: cost }
        }
      });
      
      console.log(`[RUNNER] Balance deducted: ${balance.available} -> ${balanceAfterSpend} (cost: ${cost})`);
      
      // Создаем транзакцию
      await tx.transaction.create({
        data: {
          userId,
          type: 'PURCHASE',
          amount: cost,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'RUNNER_ATTEMPT'
          }
        }
      });
      
      console.log(`[RUNNER] Transaction created: PURCHASE ${cost} stars`);
    } else {
      console.log(`[RUNNER] Free attempt, no balance deduction`);
    }

    const session = await tx.gameSession.create({
      data: {
        userId,
        gameType: 'RUNNER',
        wager: cost,
        metadata: {
          freeAttempt,
          thresholdsUnlocked: []
        }
      }
    });

    return {
      session,
      balance: updatedBalance
    };
  });

  await logSecurityEvent({
    type: 'RUNNER_ATTEMPT_STARTED',
    severity: 'INFO',
    message: freeAttempt ? 'Запущена бесплатная попытка раннера' : 'Запущена попытка раннера',
    userId,
    metadata: {
      attemptId: result.session.id,
      cost,
      freeAttempt
    }
  });

  const updatedStatus = await computeStatus(userId, config);

  return {
    attemptId: result.session.id,
    cost,
    freeAttempt,
    balance: {
      available: result.balance.available,
      reserved: result.balance.reserved
    },
    status: updatedStatus
  } satisfies StartRunnerAttemptResult;
}

export async function finishRunnerAttempt({
  userId,
  attemptId,
  score,
  distance
}: {
  userId: string;
  attemptId: string;
  score: number;
  distance?: number;
}): Promise<FinishRunnerAttemptResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Операции раннера недоступны без подключения к базе данных.');
  }

  const normalizedScore = Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
  const normalizedDistance = Number.isFinite(distance ?? 0) && (distance ?? 0) > 0 ? Math.floor(distance as number) : 0;

  const config = await getRunnerConfig();
  const { reward, thresholds } = sumRewards(config.payouts, normalizedScore);

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const session = await tx.gameSession.findUnique({ where: { id: attemptId } });
    if (!session || session.userId !== userId || session.gameType !== 'RUNNER') {
      throw new Error('Попытка не найдена.');
    }
    if (session.finishedAt) {
      throw new Error('Попытка уже завершена.');
    }

    let balance = await tx.starBalance.findUnique({ where: { userId } });
    
    // Если баланса нет - создаем его
    if (!balance) {
      balance = await tx.starBalance.create({
        data: {
          userId,
          available: 0,
          reserved: 0,
          lifetimeEarn: 0,
          lifetimeSpend: 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0
        }
      });
    }

    let updatedBalance = balance;

    if (reward > 0) {
      updatedBalance = await tx.starBalance.update({
        where: { userId },
        data: {
          available: { increment: reward },
          lifetimeEarn: { increment: reward }
        }
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
            source: 'RUNNER_REWARD',
            attemptId
          }
        }
      });
    }

    const metadataRaw = session.metadata;
    const metadataObject: Record<string, unknown> =
      metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
        ? { ...(metadataRaw as Record<string, unknown>) }
        : {};
    metadataObject.thresholdsUnlocked = thresholds.map((entry) => ({
      threshold: entry.threshold,
      reward: entry.reward,
      label: entry.label ?? null
    }));
    metadataObject.freeAttempt = Boolean(metadataObject.freeAttempt);

    const updatedSession = await tx.gameSession.update({
      where: { id: attemptId },
      data: {
        score: normalizedScore,
        distance: normalizedDistance || null,
        payout: reward,
        finishedAt: new Date(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: metadataObject as any
      }
    });

    return {
      session: updatedSession,
      balance: updatedBalance
    };
  });

  await logSecurityEvent({
    type: 'RUNNER_ATTEMPT_FINISHED',
    severity: 'INFO',
    message: reward > 0 ? `Попытка завершена. Награда: ${reward} ★` : 'Попытка завершена без награды',
    userId,
    metadata: {
      attemptId,
      score: normalizedScore,
      distance: normalizedDistance,
      reward
    }
  });

  const historyEntry: RunnerHistoryEntry = {
    id: result.session.id,
    score: result.session.score ?? 0,
    distance: result.session.distance ?? 0,
    cost: result.session.wager ?? 0,
    reward: result.session.payout ?? 0,
    freeAttempt: Boolean((result.session.metadata as Record<string, unknown> | null)?.freeAttempt),
    createdAt: result.session.finishedAt ?? result.session.startedAt
  };

  const status = await computeStatus(userId, config);

  return {
    reward,
    thresholdsUnlocked: thresholds,
    balance: {
      available: result.balance.available,
      reserved: result.balance.reserved
    },
    historyEntry,
    status
  };
}

export async function getRunnerHistory(userId: string, limit = 10): Promise<RunnerHistoryEntry[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const sessions = await prisma.gameSession.findMany({
    where: {
      userId,
      gameType: 'RUNNER'
    },
    orderBy: { finishedAt: 'desc' },
    take: limit
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sessions.map((session: any): RunnerHistoryEntry => {
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    return {
      id: session.id,
      score: session.score ?? 0,
      distance: session.distance ?? 0,
      cost: session.wager ?? 0,
      reward: session.payout ?? 0,
      freeAttempt: Boolean(metadata.freeAttempt),
      createdAt: session.finishedAt ?? session.startedAt
    };
  });
}
