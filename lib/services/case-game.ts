import { Prisma } from '@prisma/client';

import {
  type CaseDefinition,
  type CaseGameConfig,
  type CaseItemDefinition,
  getDefaultCaseConfig
} from '@/lib/config/case-default';
import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import {
  isAdminWithBoostEnabled,
  getHighValuePrizeForAdmin,
  logAdminAction
} from '@/lib/services/admin-boost';

export interface CaseHistoryEntry {
  id: string;
  caseId: string;
  caseName: string;
  itemId?: string | null;
  itemName: string;
  rarity: string;
  color?: string | null;
  stars?: number | null;
  nftGiftId?: string | null;
  createdAt: Date;
}

export interface OpenCaseResult {
  case: CaseDefinition;
  reward: CaseItemDefinition;
  nftGift?: {
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string | null;
  } | null;
  balance: {
    available: number;
    reserved: number;
    bonusAvailable: number;
    bonusReserved: number;
  };
  historyEntry: CaseHistoryEntry;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return fallback;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return fallback;
}

function ensureId(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function ensureText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function normalizeItem(item: unknown, fallbackId: string, index: number): CaseItemDefinition | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const record = item as Record<string, unknown>;
  const name = ensureText(record.name, `Приз ${index + 1}`);
  const id = ensureId(record.id, `${fallbackId}-item-${index + 1}`);
  const rarity = ensureText(record.rarity, 'Неизвестно');
  const weight = toPositiveNumber(
    'weight' in record ? record.weight : 'chance' in record ? record.chance : undefined,
    1
  );

  const normalized: CaseItemDefinition = {
    id,
    name,
    rarity,
    weight
  };

  if (record.chance !== undefined) {
    const chance = toPositiveNumber(record.chance, 0);
    if (chance > 0) {
      normalized.chance = chance;
    }
  }

  if (record.color && typeof record.color === 'string') {
    normalized.color = record.color;
  }

  const stars = toNonNegativeNumber(record.stars, -1);
  if (stars >= 0) {
    normalized.stars = Math.round(stars);
  }

  if (typeof record.description === 'string' && record.description.trim()) {
    normalized.description = record.description.trim();
  }

  if (typeof record.nftGiftId === 'string' && record.nftGiftId.trim()) {
    normalized.nftGiftId = record.nftGiftId.trim();
  }

  return normalized;
}

function normalizeCase(entry: unknown, index: number): CaseDefinition | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const id = ensureId(record.id, `case-${index + 1}`);
  const name = ensureText(record.name, `Контейнер ${index + 1}`);
  const price = Math.round(toPositiveNumber(record.price, 1));

  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items: CaseItemDefinition[] = [];
  rawItems.forEach((item, itemIndex) => {
    const normalized = normalizeItem(item, id, itemIndex);
    if (normalized) {
      items.push(normalized);
    }
  });

  if (items.length === 0) {
    return null;
  }

  const normalized: CaseDefinition = {
    id,
    name,
    price,
    items
  };

  if (typeof record.currency === 'string' && record.currency.trim().toUpperCase() === 'BONUS') {
    normalized.currency = 'BONUS';
  } else {
    normalized.currency = 'STARS';
  }

  if (typeof record.description === 'string' && record.description.trim()) {
    normalized.description = record.description.trim();
  }

  if (typeof record.badge === 'string' && record.badge.trim()) {
    normalized.badge = record.badge.trim();
  }

  if (typeof record.artwork === 'string' && record.artwork.trim()) {
    normalized.artwork = record.artwork.trim();
  }

  return normalized;
}

function normalizeConfig(value: unknown): CaseGameConfig {
  if (!value || typeof value !== 'object') {
    return getDefaultCaseConfig();
  }

  const record = value as Record<string, unknown>;
  const rawCases = Array.isArray(record.cases) ? record.cases : [];
  const cases = rawCases
    .map((entry, index) => normalizeCase(entry, index))
    .filter((entry): entry is CaseDefinition => Boolean(entry));

  if (cases.length === 0) {
    return getDefaultCaseConfig();
  }

  return { cases };
}

export async function getCaseConfig(): Promise<CaseGameConfig> {
  try {
    const setting = await prisma.gameSetting.findUnique({
      where: {
        gameType_key: {
          gameType: 'CASE',
          key: 'config'
        }
      }
    });

    if (!setting || !setting.value) {
      return getDefaultCaseConfig();
    }

    return normalizeConfig(setting.value);
  } catch {
    return getDefaultCaseConfig();
  }
}

export async function getCaseHistory(userId: string, limit = 10): Promise<CaseHistoryEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: any[] = await prisma.caseReward.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit
  });

  return entries.map((entry) => ({
    id: entry.id,
    caseId: entry.caseId,
    caseName: entry.caseName,
    itemId: entry.itemId,
    itemName: entry.itemName,
    rarity: entry.rarity,
    color: entry.color,
    stars: entry.stars,
    nftGiftId: entry.nftGiftId ?? null,
    createdAt: entry.createdAt
  }));
}

function pickReward(items: CaseItemDefinition[]): CaseItemDefinition {
  const totalWeight = items.reduce((acc, item) => acc + item.weight, 0);
  const roll = Math.random() * totalWeight;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.weight;
    if (roll <= cumulative) {
      return item;
    }
  }
  return items[items.length - 1];
}

export async function openCaseForUser({
  userId,
  caseId
}: {
  userId: string;
  caseId: string;
}): Promise<OpenCaseResult> {
  const normalizedCaseId = caseId.trim().toLowerCase();
  const config = await getCaseConfig();
  const caseDefinition = config.cases.find((entry) => entry.id.toLowerCase() === normalizedCaseId);

  if (!caseDefinition) {
    throw new Error('Кейс недоступен. Попробуйте обновить список.');
  }

  // Check if admin boost is enabled for this user
  const hasAdminBoost = await isAdminWithBoostEnabled(userId);
  let reward;

  if (hasAdminBoost) {
    // Admin gets guaranteed high-value item (top 25%)
    // Convert items to format expected by getHighValuePrizeForAdmin (with 'value' field)
    const itemsWithValue = caseDefinition.items.map((item) => ({
      ...item,
      value: item.stars ?? 0
    }));
    const boostResult = getHighValuePrizeForAdmin(itemsWithValue);
    if (!boostResult) {
      // Fallback to normal if something went wrong
      reward = pickReward(caseDefinition.items);
    } else {
      // Find the original item by index
      reward = caseDefinition.items[boostResult.index] ?? pickReward(caseDefinition.items);
      await logAdminAction(userId, 'CASE_BOOST_APPLIED', {
        caseId: caseDefinition.id,
        selectedItem: reward.name
      });
    }
  } else {
    reward = pickReward(caseDefinition.items);
  }

  const rewardStars = reward.stars ?? 0;
  const rewardNftId = reward.nftGiftId ?? null;
  let rewardNft: { id: string; name: string; rarity: string; imageUrl?: string | null } | null = null;

  if (rewardNftId) {
    const gift = await prisma.nftGift.findUnique({
      where: { id: rewardNftId }
    });
    if (!gift || !gift.isActive) {
      throw new Error('NFT-подарок недоступен. Обновите список кейсов.');
    }
    rewardNft = {
      id: gift.id,
      name: gift.name,
      rarity: gift.rarity,
      imageUrl: gift.imageUrl ?? null
    };
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

    const usesBonus = (caseDefinition.currency ?? 'STARS') === 'BONUS';
    const availableBalance = usesBonus ? balance.bonusAvailable : balance.available;
    if (availableBalance < caseDefinition.price) {
      throw new Error(
        usesBonus ? 'Недостаточно бонусных монет для открытия кейса.' : 'Недостаточно звёзд для открытия кейса.'
      );
    }

    const availableAfterSpend = availableBalance - caseDefinition.price;
    const availableAfterReward = usesBonus ? balance.available + rewardStars : availableAfterSpend + rewardStars;

    if (availableAfterReward < 0) {
      throw new Error('Недостаточно средств.');
    }

    const updatedBalance = await tx.starBalance.update({
      where: { userId },
      data: {
        ...(usesBonus
          ? {
              bonusAvailable: { set: availableAfterSpend },
              bonusLifetimeSpend: { increment: caseDefinition.price },
              ...(rewardStars > 0 ? { available: { set: availableAfterReward } } : {})
            }
          : {
              available: { set: availableAfterReward },
              lifetimeSpend: { increment: caseDefinition.price }
            }),
        ...(rewardStars > 0
          ? {
              lifetimeEarn: { increment: rewardStars }
            }
          : {})
      }
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        amount: caseDefinition.price,
        currency: usesBonus ? 'BONUS' : 'STARS',
        provider: 'TELEGRAM_STARS',
        status: 'COMPLETED',
        meta: {
          source: 'CASE_OPEN',
          caseId: caseDefinition.id,
          caseName: caseDefinition.name
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
            source: 'CASE_REWARD',
            caseId: caseDefinition.id,
            itemId: reward.id,
            itemName: reward.name
          }
        }
      });
    }

    if (rewardNft) {
      await tx.userNftGift.create({
        data: {
          userId,
          giftId: rewardNft.id,
          source: 'CASE_OPEN',
          metadata: {
            caseId: caseDefinition.id,
            caseName: caseDefinition.name,
            itemId: reward.id,
            itemName: reward.name
          }
        }
      });
    }

    const rewardRecord = await tx.caseReward.create({
      data: {
        userId,
        caseId: caseDefinition.id,
        caseName: caseDefinition.name,
        itemId: reward.id,
        itemName: reward.name,
        rarity: reward.rarity,
        color: reward.color ?? null,
        stars: rewardStars > 0 ? rewardStars : null,
        nftGiftId: rewardNft?.id ?? null,
        metadata: {
          chance: reward.chance ?? null
        }
      }
    });

    await tx.gameSession.create({
      data: {
        userId,
        gameType: 'CASE',
        wager: caseDefinition.price,
        payout: rewardStars,
        metadata: {
          caseId: caseDefinition.id,
          caseName: caseDefinition.name,
          reward: {
            id: reward.id,
            name: reward.name,
            rarity: reward.rarity,
            stars: rewardStars,
            nftGiftId: rewardNft?.id ?? null
          }
        }
      }
    });

    return {
      rewardRecord,
      balance: updatedBalance
    };
  });

  await logSecurityEvent({
    type: 'CASE_OPENED',
    severity: 'INFO',
    message: `Пользователь открыл кейс ${caseDefinition.name}`,
    userId,
    metadata: {
      caseId: caseDefinition.id,
      reward: reward.name,
      stars: rewardStars
    }
  });

  const historyEntry: CaseHistoryEntry = {
    id: result.rewardRecord.id,
    caseId: result.rewardRecord.caseId,
    caseName: result.rewardRecord.caseName,
    itemId: result.rewardRecord.itemId ?? undefined,
    itemName: result.rewardRecord.itemName,
    rarity: result.rewardRecord.rarity,
    color: result.rewardRecord.color ?? undefined,
    stars: result.rewardRecord.stars ?? undefined,
    nftGiftId: result.rewardRecord.nftGiftId ?? undefined,
    createdAt: result.rewardRecord.createdAt
  };

  return {
    case: caseDefinition,
    reward,
    nftGift: rewardNft,
    balance: {
      available: result.balance.available,
      reserved: result.balance.reserved,
      bonusAvailable: result.balance.bonusAvailable,
      bonusReserved: result.balance.bonusReserved
    },
    historyEntry
  };
}
