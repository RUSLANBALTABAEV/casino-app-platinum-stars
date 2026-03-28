import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import { isAdminWithBoostEnabled, getHighValuePrizeForAdmin, logAdminAction } from '@/lib/services/admin-boost';
import {
  type RouletteConfig,
  type RoulettePrizeDefinition,
  type RouletteVariant,
  getDefaultRouletteConfig
} from '@/lib/config/roulette-default';

type StoredRouletteConfig = {
  spinCost?: number;
  variant?: RouletteVariant;
  sectors?: RoulettePrizeDefinition[];
  slots?: {
    stakeOptions?: number[];
    compoundPercent?: number;
    nftChance?: number;
    nftGiftIds?: string[];
  };
};

export interface RouletteHistoryEntry {
  id: string;
  prizeName: string;
  rewardType: RoulettePrizeDefinition['rewardType'];
  rewardValue: number;
  cost: number;
  variant: RouletteVariant;
  createdAt: Date;
}

export interface SpinRouletteResult {
  prize: RoulettePrizeDefinition;
  prizeIndex: number;
  nftGift?: {
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string | null;
  } | null;
  balance: {
    available: number;
    reserved: number;
  };
  historyEntry: RouletteHistoryEntry;
}

function normalizeConfig(value: unknown): RouletteConfig {
  if (!value || typeof value !== 'object') {
    return getDefaultRouletteConfig();
  }

  const record = value as StoredRouletteConfig;
  const fallback = getDefaultRouletteConfig();

  const spinCost =
    typeof record.spinCost === 'number' && Number.isFinite(record.spinCost) && record.spinCost > 0
      ? Math.round(record.spinCost)
      : fallback.spinCost;

  const variant: RouletteVariant = record.variant === 'slots' ? 'slots' : 'wheel';

  const sectors = Array.isArray(record.sectors) && record.sectors.length > 0 ? record.sectors : fallback.sectors;
  const slots = typeof record.slots === 'object' && record.slots
    ? (record.slots as StoredRouletteConfig['slots'])
    : fallback.slots;

  const normalizedSectors: RoulettePrizeDefinition[] = [];
  sectors.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const candidate = entry as Partial<RoulettePrizeDefinition> & { id?: string };
    const { name, rewardType, value, weight, primary, secondary, description } = candidate;
    if (
      typeof name !== 'string' ||
      (rewardType !== 'stars' && rewardType !== 'item') ||
      typeof value !== 'number' ||
      typeof weight !== 'number' ||
      typeof primary !== 'string' ||
      typeof secondary !== 'string'
    ) {
      return;
    }

    const id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id.trim() : `prize-${index + 1}`;
    normalizedSectors.push({
      id,
      name,
      rewardType,
      value: Math.max(0, Math.round(value)),
      weight: Math.max(0.01, Number.parseFloat(String(weight))) || 1,
      primary,
      secondary,
      description: typeof description === 'string' ? description : undefined
    });
  });

  return {
    spinCost,
    variant,
    sectors: normalizedSectors.length > 0 ? normalizedSectors : fallback.sectors,
    slots: slots
      ? {
          stakeOptions: Array.isArray(slots.stakeOptions)
            ? slots.stakeOptions.map((value) => Math.max(1, Math.round(Number(value) || 0))).filter((value) => value > 0)
            : fallback.slots?.stakeOptions ?? [spinCost],
          compoundPercent:
            typeof slots.compoundPercent === 'number' && Number.isFinite(slots.compoundPercent)
              ? slots.compoundPercent
              : fallback.slots?.compoundPercent ?? 0,
          nftChance:
            typeof slots.nftChance === 'number' && Number.isFinite(slots.nftChance)
              ? slots.nftChance
              : fallback.slots?.nftChance ?? 0,
          nftGiftIds: Array.isArray(slots.nftGiftIds)
            ? slots.nftGiftIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            : fallback.slots?.nftGiftIds
        }
      : fallback.slots
  };
}

export async function getRouletteConfig(): Promise<RouletteConfig> {
  try {
    const record = await prisma.gameSetting.findUnique({
      where: {
        gameType_key: {
          gameType: 'ROULETTE',
          key: 'config'
        }
      }
    });

    if (!record?.value) {
      return getDefaultRouletteConfig();
    }

    return normalizeConfig(record.value);
  } catch {
    return getDefaultRouletteConfig();
  }
}

function pickPrize(sectors: RoulettePrizeDefinition[]): { prize: RoulettePrizeDefinition; index: number } {
  const totalWeight = sectors.reduce((sum, sector) => sum + sector.weight, 0);
  const roll = Math.random() * (totalWeight || 1);
  let cumulative = 0;
  for (let index = 0; index < sectors.length; index += 1) {
    cumulative += sectors[index].weight;
    if (roll <= cumulative) {
      return { prize: sectors[index], index };
    }
  }
  const lastIndex = Math.max(sectors.length - 1, 0);
  return { prize: sectors[lastIndex], index: lastIndex };
}

export async function getRouletteHistory(userId: string, limit = 12): Promise<RouletteHistoryEntry[]> {
  if (!process.env.DATABASE_URL) {
    return [];
  }

  const sessions = await prisma.gameSession.findMany({
    where: {
      userId,
      gameType: 'ROULETTE'
    },
    orderBy: { finishedAt: 'desc' },
    take: limit
  });

  return sessions.map((session: any) => {
    const metadata = (session.metadata ?? {}) as Record<string, unknown>;
    const prizeName = typeof metadata.prizeName === 'string' ? metadata.prizeName : 'Приз';
    const rewardType = metadata.rewardType === 'item' ? 'item' : 'stars';
    const rewardValue = typeof metadata.rewardValue === 'number' ? metadata.rewardValue : session.payout ?? 0;
    const cost = typeof metadata.cost === 'number' ? metadata.cost : session.wager ?? 0;
    const variant = metadata.variant === 'slots' ? 'slots' : 'wheel';

    return {
      id: session.id,
      prizeName,
      rewardType,
      rewardValue,
      cost,
      variant,
      createdAt: session.finishedAt ?? session.startedAt
    } satisfies RouletteHistoryEntry;
  });
}

export async function spinRouletteForUser({
  userId,
  variant,
  stake
}: {
  userId: string;
  variant?: RouletteVariant;
  stake?: number;
}): Promise<SpinRouletteResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Операции с рулеткой недоступны без базы данных.');
  }

  const config = await getRouletteConfig();
  const effectiveVariant: RouletteVariant = variant === 'slots' ? 'slots' : config.variant;
  const sectors = config.sectors;
  if (!sectors.length) {
    throw new Error('Рулетка временно недоступна. Попробуйте позже.');
  }

  // Check if admin boost is enabled for this user
  const hasAdminBoost = await isAdminWithBoostEnabled(userId);
  let prizeResult;

  if (hasAdminBoost) {
    // Admin gets guaranteed high-value prize (top 25%)
    const boostResult = getHighValuePrizeForAdmin(sectors);
    if (!boostResult) {
      // Fallback to normal if something went wrong
      prizeResult = pickPrize(sectors);
    } else {
      prizeResult = boostResult;
      await logAdminAction(userId, 'ROULETTE_BOOST_APPLIED', {
        variant: effectiveVariant,
        selectedPrize: sectors[prizeResult.index].name
      });
    }
  } else {
    prizeResult = pickPrize(sectors);
  }

  const { prize, index } = prizeResult;
  const slotsConfig = config.slots;
  const stakeValue =
    effectiveVariant === 'slots'
      ? Math.max(
          1,
          Math.round(
            typeof stake === 'number' && Number.isFinite(stake) && stake > 0
              ? slotsConfig?.stakeOptions?.includes(Math.round(stake))
                ? stake
                : slotsConfig?.stakeOptions?.[0] ?? config.spinCost
              : slotsConfig?.stakeOptions?.[0] ?? config.spinCost
          )
        )
      : config.spinCost;
  const compoundPercent = slotsConfig?.compoundPercent ?? 0;
  const nftChance = slotsConfig?.nftChance ?? 0;
  let rewardStars = prize.rewardType === 'stars' ? prize.value : 0;
  let rewardNft: { id: string; name: string; rarity: string; imageUrl?: string | null } | null = null;
  let resolvedPrize: RoulettePrizeDefinition = prize;

  if (effectiveVariant === 'slots') {
    const nftRoll = Math.random() * 100;
    if (nftChance > 0 && nftRoll <= nftChance && slotsConfig?.nftGiftIds?.length) {
      const giftId = slotsConfig.nftGiftIds[Math.floor(Math.random() * slotsConfig.nftGiftIds.length)];
      const gift = await prisma.nftGift.findUnique({ where: { id: giftId } });
      if (gift && gift.isActive) {
        rewardNft = {
          id: gift.id,
          name: gift.name,
          rarity: gift.rarity,
          imageUrl: gift.imageUrl ?? null
        };
        rewardStars = 0;
      }
    }

    if (!rewardNft && prize.rewardType === 'stars') {
      const baseMultiplier = 1 + Math.max(0, compoundPercent) / 100;
      const prizeMultiplier = prize.value > 0 ? prize.value / 100 : 1;
      rewardStars = Math.max(0, Math.round(stakeValue * baseMultiplier * prizeMultiplier));
    } else if (rewardNft) {
      rewardStars = 0;
    }
  }

  if (effectiveVariant === 'slots') {
    if (rewardNft) {
      resolvedPrize = {
        ...prize,
        name: rewardNft.name,
        rewardType: 'item',
        value: 0,
        description: 'NFT подарок'
      };
    } else if (prize.rewardType === 'stars') {
      resolvedPrize = {
        ...prize,
        value: rewardStars
      };
    }
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let balance = await tx.starBalance.findUnique({
      where: { userId }
    });

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

    if (balance.available < stakeValue) {
      throw new Error('Недостаточно звёзд для запуска рулетки.');
    }

    // Сначала списываем стоимость спина
    const balanceAfterSpend = balance.available - stakeValue;
    
    // Затем добавляем награду (если есть)
    const finalBalance = balanceAfterSpend + rewardStars;
    
    console.log(`[ROULETTE] Balance calculation: ${balance.available} - ${stakeValue} + ${rewardStars} = ${finalBalance}`);
    
    const updatedBalance = await tx.starBalance.update({
      where: { userId },
      data: {
        available: { set: finalBalance },
        lifetimeSpend: { increment: stakeValue },
        ...(rewardStars > 0
          ? {
              lifetimeEarn: { increment: rewardStars }
            }
          : {})
      }
    });
    
    console.log(`[ROULETTE] Balance updated: ${updatedBalance.available} (was ${balance.available})`);

    await tx.transaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        amount: stakeValue,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: 'ROULETTE_SPIN',
          variant: effectiveVariant,
          stake: stakeValue,
          prize: resolvedPrize.name
        }
      }
    });

    if (rewardStars > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: 'REWARD',
          amount: rewardStars,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'ROULETTE_REWARD',
            prize: prize.name
          }
        }
      });
    }

    const session = await tx.gameSession.create({
      data: {
        userId,
        gameType: 'ROULETTE',
        wager: stakeValue,
        payout: rewardStars,
        finishedAt: new Date(),
        metadata: {
          variant: effectiveVariant,
          prizeId: prize.id,
          prizeName: resolvedPrize.name,
          rewardType: resolvedPrize.rewardType,
          rewardValue: rewardStars,
          cost: stakeValue,
          nftGiftId: rewardNft?.id ?? null
        }
      }
    });

    if (rewardNft) {
      await tx.userNftGift.create({
        data: {
          userId,
          giftId: rewardNft.id,
          source: 'SLOTS',
          metadata: {
            stake: stakeValue,
            variant: effectiveVariant,
            prizeId: prize.id,
            prizeName: prize.name
          }
        }
      });
    }

    return {
      session,
      balance: updatedBalance
    };
  });

  await logSecurityEvent({
    type: 'ROULETTE_SPIN',
    severity: 'INFO',
    message: `Пользователь сделал спин рулетки (${prize.name})`,
    userId,
    metadata: {
      variant: effectiveVariant,
      prize: prize.name,
      rewardType: prize.rewardType,
      rewardStars
    }
  });

  const historyEntry: RouletteHistoryEntry = {
    id: result.session.id,
    prizeName: resolvedPrize.name,
    rewardType: resolvedPrize.rewardType,
    rewardValue: rewardStars,
    cost: stakeValue,
    variant: effectiveVariant,
    createdAt: result.session.finishedAt ?? result.session.startedAt
  };

  return {
    prize: resolvedPrize,
    prizeIndex: index,
    nftGift: rewardNft,
    balance: {
      available: result.balance.available,
      reserved: result.balance.reserved
    },
    historyEntry
  };
}
