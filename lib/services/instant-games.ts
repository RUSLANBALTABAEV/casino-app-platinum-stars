import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import { getGameAvailability } from '@/lib/services/game-settings';

type InstantGameResult = {
  win: boolean;
  payout: number;
  balance: {
    available: number;
    reserved: number;
  };
  nftGift?: {
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string | null;
  } | null;
};

export async function playInstantGame({
  userId,
  wager,
  winChance,
  multiplier,
  gameType,
  meta,
  nftChance,
  nftGiftIds
}: {
  userId: string;
  wager: number;
  winChance: number;
  multiplier: number;
  gameType: 'MINES' | 'COINFLIP' | 'TICTACTOE' | 'UPGRADE' | 'BATTLE' | 'CRAFT';
  meta?: Record<string, unknown>;
  nftChance?: number;
  nftGiftIds?: string[];
}): Promise<InstantGameResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error('Операции игры недоступны без базы данных.');
  }

  const availability = await getGameAvailability(gameType);
  if (!availability.enabled) {
    throw new Error(availability.message ?? 'Игра временно недоступна.');
  }

  const normalizedWager = Math.max(1, Math.round(wager));
  const normalizedChance = Math.max(0, Math.min(1, winChance));
  const normalizedMultiplier = Math.max(1, multiplier);

  const win = Math.random() <= normalizedChance;
  const payout = win ? Math.max(0, Math.round(normalizedWager * normalizedMultiplier)) : 0;

  let rewardNft: InstantGameResult['nftGift'] = null;
  const nftRoll = Math.random() * 100;
  if (nftChance && nftChance > 0 && nftRoll <= nftChance && nftGiftIds?.length) {
    const giftId = nftGiftIds[Math.floor(Math.random() * nftGiftIds.length)];
    const gift = await prisma.nftGift.findUnique({ where: { id: giftId } });
    if (gift && gift.isActive) {
      rewardNft = {
        id: gift.id,
        name: gift.name,
        rarity: gift.rarity,
        imageUrl: gift.imageUrl ?? null
      };
    }
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let balance = await tx.starBalance.findUnique({ where: { userId } });
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

    if (balance.available < normalizedWager) {
      throw new Error('Недостаточно звёзд для ставки.');
    }

    const updatedBalance = await tx.starBalance.update({
      where: { userId },
      data: {
        available: { set: balance.available - normalizedWager + payout },
        lifetimeSpend: { increment: normalizedWager },
        ...(payout > 0
          ? {
              lifetimeEarn: { increment: payout }
            }
          : {})
      }
    });

    await tx.transaction.create({
      data: {
        userId,
        type: 'PURCHASE',
        amount: normalizedWager,
        currency: 'STARS',
        provider: 'MANUAL',
        status: 'COMPLETED',
        meta: {
          source: `${gameType}_WAGER`,
          ...(meta ?? {})
        }
      }
    });

    if (payout > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: 'REWARD',
          amount: payout,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: `${gameType}_REWARD`,
            ...(meta ?? {})
          }
        }
      });
    }

    const session = await tx.gameSession.create({
      data: {
        userId,
        gameType,
        wager: normalizedWager,
        payout,
        finishedAt: new Date(),
        metadata: {
          win,
          payout,
          multiplier: normalizedMultiplier,
          ...(meta ?? {}),
          nftGiftId: rewardNft?.id ?? null
        }
      }
    });

    if (rewardNft) {
      await tx.userNftGift.create({
        data: {
          userId,
          giftId: rewardNft.id,
          source: gameType,
          metadata: meta ?? {}
        }
      });
    }

    return {
      balance: updatedBalance,
      session
    };
  });

  await logSecurityEvent({
    type: `${gameType}_PLAY`,
    severity: 'INFO',
    message: `Пользователь сыграл в ${gameType}`,
    userId,
    metadata: {
      wager: normalizedWager,
      payout,
      win,
      nftGiftId: rewardNft?.id ?? null
    }
  });

  return {
    win,
    payout,
    balance: {
      available: result.balance.available,
      reserved: result.balance.reserved
    },
    nftGift: rewardNft
  };
}
