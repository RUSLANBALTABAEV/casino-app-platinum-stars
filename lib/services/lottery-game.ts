import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import {
  getDefaultLotteryConfig,
  type LotteryConfig,
  type LotteryDistributionDefinition,
  type LotteryPoolDefinition
} from '@/lib/config/lottery-default';

type StoredLotteryConfig = {
  pools?: LotteryPoolDefinition[];
};

export interface LotteryBalance {
  available: number;
  reserved: number;
}

export interface LotteryPoolState extends LotteryPoolDefinition {
  entriesCount: number;
  entriesRemaining: number;
  userEntries: number;
}

export interface LotteryWinner {
  entryId: string;
  userId: string;
  poolId: string;
  poolName: string;
  position: number;
  prize: number;
  createdAt: Date;
}

export interface LotteryState {
  config: LotteryConfig;
  pools: LotteryPoolState[];
  balance: LotteryBalance;
  userResults: LotteryWinner[];
  recentResults: LotteryWinner[];
}

export interface JoinLotteryResult {
  entryId: string;
  pool: LotteryPoolState;
  balance: LotteryBalance;
  winners: LotteryWinner[];
}

function normalizePool(entry: unknown, index: number): LotteryPoolDefinition | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
 
  const raw = entry as Record<string, unknown>;

  const participantLimitValue = raw.participantLimit;
  const participantLimit =
    typeof participantLimitValue === 'number' && Number.isFinite(participantLimitValue) && participantLimitValue > 0
      ? Math.floor(participantLimitValue)
      : 0;
  const ticketCostValue = raw.ticketCost;
  const ticketCost =
    typeof ticketCostValue === 'number' && Number.isFinite(ticketCostValue) && ticketCostValue > 0
      ? Math.floor(ticketCostValue)
      : 0;
  const prizePercentValue = raw.prizePercent;
  const prizePercent =
    typeof prizePercentValue === 'number' && prizePercentValue > 0 && prizePercentValue <= 1
      ? prizePercentValue
      : 0;
 
  const distributionRaw = Array.isArray(raw.distribution) ? raw.distribution : [];

  if (!participantLimit || !ticketCost || !prizePercent || distributionRaw.length === 0) {
    return null;
  }
 
  const distribution: LotteryDistributionDefinition[] = distributionRaw
    .map((item) => {
      if (!item) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const placeValue = record.place;
      const shareValue = record.share;
      const place = typeof placeValue === 'number' && Number.isFinite(placeValue) && placeValue > 0 ? Math.floor(placeValue) : null;
      const share = typeof shareValue === 'number' && shareValue > 0 ? shareValue : null;
      if (!place || !share) {
        return null;
      }
      const normalizedDistribution: LotteryDistributionDefinition = { place, share };
      return normalizedDistribution;
    })
    .filter((value): value is LotteryDistributionDefinition => Boolean(value));
 
  if (!distribution.length) {
    return null;
  }
 
  const totalShare = distribution.reduce((sum, item) => sum + item.share, 0);
  if (totalShare <= 0) {
    return null;
  }
 
  const idRaw = raw.id;
  const nameRaw = raw.name;

  const normalizedPool: LotteryPoolDefinition = {
    id: typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : `pool-${index + 1}`,
    name: typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : `Лотерея ${index + 1}`,
    participantLimit,
    ticketCost,
    prizePercent,
    distribution
  };

  return normalizedPool;
}

function normalizeConfig(value: unknown): LotteryConfig {
  if (!value || typeof value !== 'object') {
    return getDefaultLotteryConfig();
  }

  const record = value as StoredLotteryConfig;
  const pools = Array.isArray(record.pools) ? record.pools : [];
  const normalizedPools = pools
    .map((entry, index) => normalizePool(entry, index))
    .filter((pool): pool is LotteryPoolDefinition => Boolean(pool));

  if (!normalizedPools.length) {
    return getDefaultLotteryConfig();
  }

  const normalizedConfig: LotteryConfig = { pools: normalizedPools };
  return normalizedConfig;
}

export async function getLotteryConfig(): Promise<LotteryConfig> {
  try {
    // Используем правильные параметры: gameType: 'LOTTERY', key: 'config'
    // Это соответствует тому, как сохраняется в админке через saveLotteryConfigAction
    const record = await prisma.gameSetting.findUnique({
      where: {
        gameType_key: {
          gameType: 'LOTTERY',
          key: 'config'
        }
      }
    });

    if (!record?.value) {
      return getDefaultLotteryConfig();
    }

    return normalizeConfig(record.value);
  } catch {
    return getDefaultLotteryConfig();
  }
}

function toPoolState({
  pool,
  entriesCount,
  userEntries
}: {
  pool: LotteryPoolDefinition;
  entriesCount: number;
  userEntries: number;
}): LotteryPoolState {
  return {
    ...pool,
    entriesCount,
    entriesRemaining: Math.max(pool.participantLimit - entriesCount, 0),
    userEntries
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapResultToWinner(result: any): LotteryWinner {
  return {
    entryId: result.entryId,
    userId: result.userId,
    poolId: result.poolId,
    poolName: result.poolName,
    position: result.position,
    prize: result.prize,
    createdAt: result.createdAt
  };
}

export async function getLotteryState(userId: string): Promise<LotteryState> {
  if (!process.env.DATABASE_URL) {
    const config = getDefaultLotteryConfig();
    return {
      config,
      pools: config.pools.map((pool) => toPoolState({ pool, entriesCount: 0, userEntries: 0 })),
      balance: { available: 0, reserved: 0 },
      userResults: [],
      recentResults: []
    };
  }

  const config = await getLotteryConfig();

  let balanceRecord = await prisma.starBalance.findUnique({
    where: { userId },
    select: {
      available: true,
      reserved: true
    }
  });
  
  // Если баланса нет - создаем его
  if (!balanceRecord) {
    const { upsertStarBalanceByUserId } = await import('@/lib/db/star-balance');
    await upsertStarBalanceByUserId(userId, 0);
    balanceRecord = await prisma.starBalance.findUnique({
      where: { userId },
      select: {
        available: true,
        reserved: true
      }
    });
  }
 
  const poolEntriesRaw: Array<{ poolId: string }> = await prisma.lotteryEntry.findMany({
    select: { poolId: true }
  });
 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userResults: any[] = await prisma.lotteryResult.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentResults: any[] = await prisma.lotteryResult.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12
  });
 
  const poolEntryMap = new Map<string, number>();
  poolEntriesRaw.forEach((entry) => {
    poolEntryMap.set(entry.poolId, (poolEntryMap.get(entry.poolId) ?? 0) + 1);
  });

  const userActiveEntriesRaw: Array<{ poolId: string }> = await prisma.lotteryEntry.findMany({
    where: { userId },
    select: { poolId: true }
  });
  const userEntryMap = new Map<string, number>();
  userActiveEntriesRaw.forEach((entry) => {
    userEntryMap.set(entry.poolId, (userEntryMap.get(entry.poolId) ?? 0) + 1);
  });

  const pools: LotteryPoolState[] = config.pools.map((pool) =>
    toPoolState({
      pool,
      entriesCount: poolEntryMap.get(pool.id) ?? 0,
      userEntries: userEntryMap.get(pool.id) ?? 0
    })
  );

  return {
    config,
    pools,
    balance: balanceRecord ?? { available: 0, reserved: 0 },
    userResults: userResults.map(mapResultToWinner),
    recentResults: recentResults.map(mapResultToWinner)
  };
}

function computePrizeShares(pool: LotteryPoolDefinition): number[] {
  const totalPot = Math.floor(pool.ticketCost * pool.participantLimit * pool.prizePercent);
  if (totalPot <= 0) {
    return [];
  }
  const shares = pool.distribution.map((entry) => Math.floor(totalPot * entry.share));
  if (!shares.length) {
    return [];
  }
  return shares;
}

function shuffle<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export async function joinLotteryPool({
  userId,
  poolId
}: {
  userId: string;
  poolId: string;
}): Promise<JoinLotteryResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Операции лотереи недоступны без базы данных.');
  }

  const config = await getLotteryConfig();
  const pool = config.pools.find((entry) => entry.id === poolId);
  if (!pool) {
    throw new Error('Лотерея недоступна. Попробуйте обновить список.');
  }

  const prizeShares = computePrizeShares(pool);

  type LotteryTransactionResult = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entry: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    balance: any;
    winners: LotteryWinner[];
  };

  const transactionResult: LotteryTransactionResult = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    if (balance.available < pool.ticketCost) {
      throw new Error('Недостаточно звёзд для покупки билета.');
    }

    const updatedBalance = await tx.starBalance.update({
      where: { userId },
      data: {
        available: { decrement: pool.ticketCost },
        lifetimeSpend: { increment: pool.ticketCost }
      }
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        amount: pool.ticketCost,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'LOTTERY_ENTRY',
          poolId: pool.id,
          poolName: pool.name
        }
      }
    });

    const entry = await tx.lotteryEntry.create({
      data: {
        userId,
        poolId: pool.id,
        poolName: pool.name,
        ticketCost: pool.ticketCost
      }
    });

    const participantLimit = pool.participantLimit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const poolEntries: any[] = await tx.lotteryEntry.findMany({
      where: { poolId: pool.id },
      orderBy: { createdAt: 'asc' },
      take: participantLimit
    });

    const winners: LotteryWinner[] = [];

    if (poolEntries.length === participantLimit && prizeShares.length) {
      const candidateIds = poolEntries.map((item) => item.id);
      const shuffledEntries = shuffle(poolEntries);

      for (let index = 0; index < prizeShares.length; index += 1) {
        const prize = prizeShares[index];
        if (prize <= 0) {
          continue;
        }
        const winnerEntry = shuffledEntries[index];
        if (!winnerEntry) {
          break;
        }

        const updatedWinnerBalance = await tx.starBalance.update({
          where: { userId: winnerEntry.userId },
          data: {
            available: { increment: prize },
            lifetimeEarn: { increment: prize }
          }
        });

        await tx.transaction.create({
          data: {
            userId: winnerEntry.userId,
            type: 'REWARD',
            amount: prize,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: {
              source: 'LOTTERY_REWARD',
              poolId: pool.id,
              poolName: pool.name,
              entryId: winnerEntry.id
            }
          }
        });

        const result = await tx.lotteryResult.create({
          data: {
            entryId: winnerEntry.id,
            userId: winnerEntry.userId,
            poolId: pool.id,
            poolName: pool.name,
            position: index + 1,
            prize
          }
        });

        winners.push(mapResultToWinner(result));

        await logSecurityEvent({
          type: 'LOTTERY_WINNER',
          severity: 'INFO',
          message: `Выигрыш в ${pool.name}: ${prize} ★`,
          userId: winnerEntry.userId,
          metadata: {
            poolId: pool.id,
            prize,
            entryId: winnerEntry.id
          }
        });

        // Update local balance for winner if it's the purchasing user
        if (winnerEntry.userId === userId) {
          updatedBalance.available = updatedWinnerBalance.available;
          updatedBalance.reserved = updatedWinnerBalance.reserved;
        }
      }

      await tx.lotteryEntry.deleteMany({
        where: {
          id: {
            in: candidateIds
          }
        }
      });
    }

    const transactionData: LotteryTransactionResult = {
      entry,
      balance: updatedBalance,
      winners
    };

    return transactionData;
  });

  const remainingEntries = await prisma.lotteryEntry.count({ where: { poolId: pool.id } });
  const userEntries = await prisma.lotteryEntry.count({ where: { poolId: pool.id, userId } });

  await logSecurityEvent({
    type: 'LOTTERY_ENTRY_PURCHASED',
    severity: 'INFO',
    message: `Покупка билета в лотерее ${pool.name}`,
    userId,
    metadata: {
      poolId: pool.id,
      ticketCost: pool.ticketCost
    }
  });

  return {
    entryId: transactionResult.entry.id,
    pool: toPoolState({ pool, entriesCount: remainingEntries, userEntries }),
    balance: {
      available: transactionResult.balance.available,
      reserved: transactionResult.balance.reserved
    },
    winners: transactionResult.winners
  };
}
