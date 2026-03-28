import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { prisma } from '@/lib/prisma';
import { getGameAvailability, getGameSetting } from '@/lib/services/game-settings';
import { logSecurityEvent } from '@/lib/services/security';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  getDevTelegramUser,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

type BattleBody = {
  bet?: number;
  nftGiftIds?: string[];
};

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-battle:post`, {
    limit: 8,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: BattleBody;
  try {
    body = (await req.json()) as BattleBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  const bet = typeof body.bet === 'number' ? body.bet : 50;
  const nftGiftIds = Array.isArray(body.nftGiftIds) ? body.nftGiftIds.filter(Boolean) : [];

  try {
    const availability = await getGameAvailability('BATTLE');
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
        rateResult
      );
    }

    if (isDemoRequest(req)) {
      const win = Math.random() > 0.5;
      return applyHeaders(
        NextResponse.json({
          success: true,
          result: {
            status: 'COMPLETED',
            win,
            payout: win ? bet * 2 : 0,
            balance: getDemoBalance()
          }
        }),
        rateResult
      );
    }

    const setting = await getGameSetting('BATTLE', 'config');
    const config = (setting?.value ?? {}) as {
      minPlayers?: number;
      maxPlayers?: number;
    };

    const user = await resolveUser(req);
    const normalizedBet = Math.max(1, Math.round(bet));
    const maxPlayers = typeof config.maxPlayers === 'number' ? config.maxPlayers : 2;
    if (maxPlayers !== 2) {
      throw new Error('Батлы сейчас доступны только для 2 игроков.');
    }

    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.starBalance.findUnique({ where: { userId: user.userId } });
      if (!balance || balance.available < normalizedBet) {
        throw new Error('Недостаточно звёзд для участия в батле.');
      }

      const ownedNfts = nftGiftIds.length
        ? await tx.userNftGift.findMany({
            where: { userId: user.userId, id: { in: nftGiftIds }, status: 'OWNED' },
            include: { gift: true }
          })
        : [];

      if (nftGiftIds.length && ownedNfts.length !== nftGiftIds.length) {
        throw new Error('Некоторые NFT недоступны для ставки.');
      }

      const pendingMatch = await tx.battleMatch.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' }
      });

      const entry = {
        userId: user.userId,
        wager: normalizedBet,
        nftGiftIds: ownedNfts.map((item) => item.id)
      };

      if (!pendingMatch) {
        await tx.starBalance.update({
          where: { userId: user.userId },
          data: { available: { decrement: normalizedBet }, lifetimeSpend: { increment: normalizedBet } }
        });

        await tx.transaction.create({
          data: {
            userId: user.userId,
            type: 'PURCHASE',
            amount: normalizedBet,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: { source: 'BATTLE_WAGER' }
          }
        });

        if (ownedNfts.length) {
          await tx.userNftGift.updateMany({
            where: { id: { in: ownedNfts.map((item) => item.id) } },
            data: { status: 'STAKED' }
          });
        }

        const match = await tx.battleMatch.create({
          data: {
            status: 'PENDING',
            currency: 'STARS',
            entries: [entry]
          }
        });

        return {
          status: 'WAITING',
          matchId: match.id
        };
      }

      const entries = Array.isArray(pendingMatch.entries) ? pendingMatch.entries : [];
      if (entries.length >= maxPlayers) {
        throw new Error('Батл уже заполнен.');
      }
      if (entries.some((item: any) => item.userId === user.userId)) {
        throw new Error('Вы уже участвуете в этом батле.');
      }

      const updatedEntries = [...entries, entry];

      const allEntriesWithValue = await Promise.all(
        updatedEntries.map(async (item: any) => {
          const nftItems = Array.isArray(item.nftGiftIds) && item.nftGiftIds.length
            ? await tx.userNftGift.findMany({
                where: { id: { in: item.nftGiftIds } },
                include: { gift: true }
              })
            : [];
          const nftValue = nftItems.reduce((sum, nft) => sum + (nft.gift.priceStars ?? 0), 0);
          return { ...item, weight: item.wager + nftValue };
        })
      );

      const totalWeight = allEntriesWithValue.reduce((sum, item) => sum + item.weight, 0);
      const roll = Math.random() * (totalWeight || 1);
      let cumulative = 0;
      let winner = allEntriesWithValue[0];
      for (const item of allEntriesWithValue) {
        cumulative += item.weight;
        if (roll <= cumulative) {
          winner = item;
          break;
        }
      }

      await tx.starBalance.update({
        where: { userId: user.userId },
        data: { available: { decrement: normalizedBet }, lifetimeSpend: { increment: normalizedBet } }
      });

      await tx.transaction.create({
        data: {
          userId: user.userId,
          type: 'PURCHASE',
          amount: normalizedBet,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: { source: 'BATTLE_WAGER', matchId: pendingMatch.id }
        }
      });

      if (ownedNfts.length) {
        await tx.userNftGift.updateMany({
          where: { id: { in: ownedNfts.map((item) => item.id) } },
          data: { status: 'STAKED' }
        });
      }

      const totalWager = updatedEntries.reduce((sum, item: any) => sum + (item.wager ?? 0), 0);
      const winnerPayout = totalWager;

      await tx.starBalance.update({
        where: { userId: winner.userId },
        data: { available: { increment: winnerPayout }, lifetimeEarn: { increment: winnerPayout } }
      });

      await tx.transaction.create({
        data: {
          userId: winner.userId,
          type: 'REWARD',
          amount: winnerPayout,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: { source: 'BATTLE_WIN', matchId: pendingMatch.id }
        }
      });

      const stakedNftIds = updatedEntries.flatMap((item: any) =>
        Array.isArray(item.nftGiftIds) ? item.nftGiftIds : []
      );

      if (stakedNftIds.length) {
        await tx.userNftGift.updateMany({
          where: { id: { in: stakedNftIds } },
          data: { userId: winner.userId, status: 'OWNED' }
        });
      }

      const match = await tx.battleMatch.update({
        where: { id: pendingMatch.id },
        data: {
          status: 'COMPLETED',
          entries: updatedEntries,
          winnerUserId: winner.userId,
          completedAt: new Date()
        }
      });

      for (const entryItem of updatedEntries) {
        await tx.gameSession.create({
          data: {
            userId: entryItem.userId,
            gameType: 'BATTLE',
            wager: entryItem.wager ?? normalizedBet,
            payout: entryItem.userId === winner.userId ? winnerPayout : 0,
            finishedAt: new Date(),
            metadata: {
              matchId: match.id,
              entries: updatedEntries,
              winnerUserId: winner.userId
            }
          }
        });
      }

      return {
        status: 'COMPLETED',
        matchId: match.id,
        winnerUserId: winner.userId,
        payout: winner.userId === user.userId ? winnerPayout : 0
      };
    });

    if (result.status === 'WAITING') {
      return applyHeaders(
        NextResponse.json({ success: true, result }),
        rateResult
      );
    }

    await logSecurityEvent({
      type: 'BATTLE_RESULT',
      severity: 'INFO',
      message: 'Завершён батл',
      userId: user.userId,
      metadata: result
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        result
      }),
      rateResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сыграть.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
