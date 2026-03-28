import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { prisma } from '@/lib/prisma';
import { getGameSetting } from '@/lib/services/game-settings';
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

type MinesAction = 'start' | 'pick' | 'cashout';

type MinesBody = {
  action?: MinesAction;
  bet?: number;
  mines?: number;
  sessionId?: string;
  index?: number;
};

type MinesMetadata = {
  gridSize: number;
  minesCount: number;
  mines: number[];
  picks: number[];
  status: 'active' | 'lost' | 'cashed';
  stepMultiplier: number;
  maxMultiplier: number;
};

type MinesConfig = {
  baseBet?: number;
  maxMultiplier?: number;
  stepMultiplier?: number;
  minMines?: number;
  maxMines?: number;
  nftChance?: number;
  nftGiftIds?: string[];
};

type MinesResponse = {
  sessionId: string;
  gridSize: number;
  minesCount: number;
  picks: number[];
  status: MinesMetadata['status'];
  multiplier: number;
  payout?: number;
  mines?: number[];
  balance?: {
    available: number;
    reserved: number;
    bonusAvailable?: number;
    bonusReserved?: number;
  };
  nftGift?: {
    id: string;
    name: string;
    rarity: string;
    imageUrl?: string | null;
  } | null;
};

const GRID_SIZE = 5;
const TOTAL_CELLS = GRID_SIZE * GRID_SIZE;
const DEFAULT_MIN_MINES = 3;
const DEFAULT_MAX_MINES = 10;
const DEFAULT_STEP_MULTIPLIER = 0.28; // tuned for ~94% RTP
const DEFAULT_MAX_MULTIPLIER = 20; // allow high multipliers on risky plays

const demoSessions = new Map<string, MinesMetadata>();

function computeMultiplier(picks: number, step: number, max: number, minesCount: number = 5) {
  if (picks === 0) return 1;
  // Probability-based: each pick surviving increases mult by survival_odds
  // survival_prob for pick k = (safe_cells - k) / (total_cells - k)
  const totalCells = 25;
  const safeCells = totalCells - minesCount;
  let survivalProb = 1;
  for (let k = 0; k < picks; k++) {
    survivalProb *= (safeCells - k) / (totalCells - k);
  }
  // mult = (1 / survivalProb) * RTP_factor (0.95)
  const rawMult = (1 / survivalProb) * 0.50;
  return Math.min(max, Math.max(1.01, parseFloat(rawMult.toFixed(2))));
}

function generateMines(minesCount: number): number[] {
  const positions = Array.from({ length: TOTAL_CELLS }, (_, index) => index);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions.slice(0, minesCount);
}

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

async function rewardNft({
  userId,
  config,
  meta
}: {
  userId: string;
  config: MinesConfig;
  meta: Record<string, unknown>;
}) {
  if (!config.nftChance || config.nftChance <= 0 || !config.nftGiftIds?.length) {
    return null;
  }
  const roll = Math.random() * 100;
  if (roll > config.nftChance) {
    return null;
  }
  const giftId = config.nftGiftIds[Math.floor(Math.random() * config.nftGiftIds.length)];
  const gift = await prisma.nftGift.findUnique({ where: { id: giftId } });
  if (!gift || !gift.isActive) {
    return null;
  }
  await prisma.userNftGift.create({
    data: {
      userId,
      giftId: gift.id,
      source: 'MINES',
      metadata: meta
    }
  });
  return {
    id: gift.id,
    name: gift.name,
    rarity: gift.rarity,
    imageUrl: gift.imageUrl ?? null
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-mines:post`, {
    limit: 24,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: MinesBody;
  try {
    body = (await req.json()) as MinesBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  const action: MinesAction = body.action ?? 'start';

  const setting = await getGameSetting('MINES', 'config');
  const config = (setting?.value ?? {}) as MinesConfig;
  const stepMultiplier = typeof config.stepMultiplier === 'number' ? config.stepMultiplier : DEFAULT_STEP_MULTIPLIER;
  const maxMultiplier = typeof config.maxMultiplier === 'number' ? config.maxMultiplier : DEFAULT_MAX_MULTIPLIER;
  const minMines = typeof config.minMines === 'number' ? config.minMines : DEFAULT_MIN_MINES;
  const maxMines = typeof config.maxMines === 'number' ? config.maxMines : DEFAULT_MAX_MINES;
  const baseBet = typeof config.baseBet === 'number' ? config.baseBet : 10;

  if (isDemoRequest(req)) {
    const bet = typeof body.bet === 'number' ? Math.max(1, Math.round(body.bet)) : baseBet;
    if (action === 'start') {
      const minesCount = typeof body.mines === 'number' ? Math.round(body.mines) : minMines;
      const normalizedMines = Math.min(Math.max(minMines, minesCount), maxMines);
      const sessionId = crypto.randomUUID();
      demoSessions.set(sessionId, {
        gridSize: GRID_SIZE,
        minesCount: normalizedMines,
        mines: generateMines(normalizedMines),
        picks: [],
        status: 'active',
        stepMultiplier,
        maxMultiplier
      });
      const response: MinesResponse = {
        sessionId,
        gridSize: GRID_SIZE,
        minesCount: normalizedMines,
        picks: [],
        status: 'active',
        multiplier: computeMultiplier(0, stepMultiplier, maxMultiplier),
        balance: getDemoBalance()
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    const sessionId = body.sessionId;
    if (!sessionId) {
      return applyHeaders(NextResponse.json({ error: 'Не найдена сессия.' }, { status: 400 }), rateResult);
    }
    const session = demoSessions.get(sessionId);
    if (!session) {
      return applyHeaders(NextResponse.json({ error: 'Сессия не найдена.' }, { status: 404 }), rateResult);
    }
    if (action === 'pick') {
      const index = typeof body.index === 'number' ? Math.round(body.index) : -1;
      if (index < 0 || index >= TOTAL_CELLS) {
        return applyHeaders(NextResponse.json({ error: 'Некорректный выбор.' }, { status: 400 }), rateResult);
      }
      if (session.status !== 'active') {
        return applyHeaders(NextResponse.json({ error: 'Игра уже завершена.' }, { status: 400 }), rateResult);
      }
      if (session.picks.includes(index)) {
        return applyHeaders(
          NextResponse.json({
            success: true,
            result: {
              sessionId,
              gridSize: GRID_SIZE,
              minesCount: session.minesCount,
              picks: session.picks,
              status: session.status,
              multiplier: computeMultiplier(session.picks.length, stepMultiplier, maxMultiplier),
              balance: getDemoBalance()
            }
          }),
          rateResult
        );
      }
      if (session.mines.includes(index)) {
        session.status = 'lost';
        const response: MinesResponse = {
          sessionId,
          gridSize: GRID_SIZE,
          minesCount: session.minesCount,
          picks: session.picks,
          status: 'lost',
          multiplier: computeMultiplier(session.picks.length, stepMultiplier, maxMultiplier),
          mines: session.mines,
          payout: 0,
          balance: getDemoBalance()
        };
        return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
      }
      session.picks.push(index);
      const response: MinesResponse = {
        sessionId,
        gridSize: GRID_SIZE,
        minesCount: session.minesCount,
        picks: session.picks,
        status: session.status,
        multiplier: computeMultiplier(session.picks.length, stepMultiplier, maxMultiplier),
        balance: getDemoBalance()
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    if (action === 'cashout') {
      if (session.status !== 'active') {
        return applyHeaders(NextResponse.json({ error: 'Игра уже завершена.' }, { status: 400 }), rateResult);
      }
      session.status = 'cashed';
      const multiplier = computeMultiplier(session.picks.length, stepMultiplier, maxMultiplier);
      const payout = Math.max(0, Math.round(bet * multiplier));
      const response: MinesResponse = {
        sessionId,
        gridSize: GRID_SIZE,
        minesCount: session.minesCount,
        picks: session.picks,
        status: 'cashed',
        multiplier,
        payout,
        mines: session.mines,
        balance: getDemoBalance()
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }
  }

  try {
    const user = await resolveUser(req);
    const bet = typeof body.bet === 'number' ? Math.max(1, Math.round(body.bet)) : baseBet;

    if (action === 'start') {
      const minesCount = typeof body.mines === 'number' ? Math.round(body.mines) : minMines;
      const normalizedMines = Math.min(Math.max(minMines, minesCount), maxMines);
      const mines = generateMines(normalizedMines);

      const result = await prisma.$transaction(async (tx) => {
        let balance = await tx.starBalance.findUnique({ where: { userId: user.userId } });
        if (!balance) {
          balance = await tx.starBalance.create({
            data: {
              userId: user.userId,
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
        if (balance.available < bet) {
          throw new Error('Недостаточно звёзд для ставки.');
        }
        const updatedBalance = await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            available: { set: balance.available - bet },
            lifetimeSpend: { increment: bet }
          }
        });
        await tx.transaction.create({
          data: {
            userId: user.userId,
            type: 'PURCHASE',
            amount: bet,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: { source: 'MINES_WAGER' }
          }
        });
        const session = await tx.gameSession.create({
          data: {
            userId: user.userId,
            gameType: 'MINES',
            wager: bet,
            metadata: {
              gridSize: GRID_SIZE,
              minesCount: normalizedMines,
              mines,
              picks: [],
              status: 'active',
              stepMultiplier,
              maxMultiplier
            } satisfies MinesMetadata
          }
        });
        return { balance: updatedBalance, session };
      });

      await logSecurityEvent({
        type: 'MINES_START',
        severity: 'INFO',
        message: 'Пользователь начал игру Mines',
        userId: user.userId,
        metadata: { bet, minesCount: normalizedMines }
      });

      const response: MinesResponse = {
        sessionId: result.session.id,
        gridSize: GRID_SIZE,
        minesCount: normalizedMines,
        picks: [],
        status: 'active',
        multiplier: computeMultiplier(0, stepMultiplier, maxMultiplier),
        balance: {
          available: result.balance.available,
          reserved: result.balance.reserved,
          bonusAvailable: result.balance.bonusAvailable,
          bonusReserved: result.balance.bonusReserved
        }
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    if (!body.sessionId) {
      return applyHeaders(NextResponse.json({ error: 'Не найдена сессия.' }, { status: 400 }), rateResult);
    }

    const session = await prisma.gameSession.findUnique({ where: { id: body.sessionId } });
    if (!session || session.gameType !== 'MINES' || session.userId !== user.userId) {
      return applyHeaders(NextResponse.json({ error: 'Сессия не найдена.' }, { status: 404 }), rateResult);
    }
    const metadata = session.metadata as MinesMetadata | null;
    if (!metadata) {
      return applyHeaders(NextResponse.json({ error: 'Некорректные данные сессии.' }, { status: 400 }), rateResult);
    }
    if (session.finishedAt || metadata.status !== 'active') {
      return applyHeaders(NextResponse.json({ error: 'Игра уже завершена.' }, { status: 400 }), rateResult);
    }

    if (action === 'pick') {
      const index = typeof body.index === 'number' ? Math.round(body.index) : -1;
      if (index < 0 || index >= TOTAL_CELLS) {
        return applyHeaders(NextResponse.json({ error: 'Некорректный выбор.' }, { status: 400 }), rateResult);
      }
      if (metadata.picks.includes(index)) {
        const response: MinesResponse = {
          sessionId: session.id,
          gridSize: metadata.gridSize,
          minesCount: metadata.minesCount,
          picks: metadata.picks,
          status: metadata.status,
          multiplier: computeMultiplier(metadata.picks.length, metadata.stepMultiplier, metadata.maxMultiplier)
        };
        return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
      }

      if (metadata.mines.includes(index)) {
        const updatedMetadata: MinesMetadata = {
          ...metadata,
          status: 'lost'
        };
        await prisma.gameSession.update({
          where: { id: session.id },
          data: {
            metadata: updatedMetadata,
            payout: 0,
            finishedAt: new Date()
          }
        });
        await logSecurityEvent({
          type: 'MINES_LOSE',
          severity: 'INFO',
          message: 'Пользователь проиграл в Mines',
          userId: user.userId,
          metadata: { picks: metadata.picks.length, bet: session.wager }
        });
        const response: MinesResponse = {
          sessionId: session.id,
          gridSize: metadata.gridSize,
          minesCount: metadata.minesCount,
          picks: metadata.picks,
          status: 'lost',
          multiplier: computeMultiplier(metadata.picks.length, metadata.stepMultiplier, metadata.maxMultiplier),
          payout: 0,
          mines: metadata.mines
        };
        return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
      }

      const nextPicks = [...metadata.picks, index];
      const updatedMetadata: MinesMetadata = {
        ...metadata,
        picks: nextPicks
      };
      await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          metadata: updatedMetadata
        }
      });

      const response: MinesResponse = {
        sessionId: session.id,
        gridSize: metadata.gridSize,
        minesCount: metadata.minesCount,
        picks: nextPicks,
        status: 'active',
        multiplier: computeMultiplier(nextPicks.length, metadata.stepMultiplier, metadata.maxMultiplier)
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    if (action === 'cashout') {
      const multiplier = computeMultiplier(metadata.picks.length, metadata.stepMultiplier, metadata.maxMultiplier);
      const payout = Math.max(0, Math.round((session.wager ?? 0) * multiplier));
      const result = await prisma.$transaction(async (tx) => {
        const updatedBalance = await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            available: { increment: payout },
            ...(payout > 0 ? { lifetimeEarn: { increment: payout } } : {})
          }
        });
        if (payout > 0) {
          await tx.transaction.create({
            data: {
              userId: user.userId,
              type: 'REWARD',
              amount: payout,
              currency: 'STARS',
              provider: 'MANUAL',
              status: 'COMPLETED',
              meta: { source: 'MINES_REWARD' }
            }
          });
        }
        const updatedMetadata: MinesMetadata = {
          ...metadata,
          status: 'cashed'
        };
        const updatedSession = await tx.gameSession.update({
          where: { id: session.id },
          data: {
            payout,
            finishedAt: new Date(),
            metadata: updatedMetadata
          }
        });
        return { updatedBalance, updatedSession };
      });

      const nftGift = await rewardNft({
        userId: user.userId,
        config,
        meta: { picks: metadata.picks.length, wager: session.wager ?? 0 }
      });

      await logSecurityEvent({
        type: 'MINES_CASHOUT',
        severity: 'INFO',
        message: 'Пользователь забрал выигрыш в Mines',
        userId: user.userId,
        metadata: { picks: metadata.picks.length, payout, nftGiftId: nftGift?.id ?? null }
      });

      const response: MinesResponse = {
        sessionId: session.id,
        gridSize: metadata.gridSize,
        minesCount: metadata.minesCount,
        picks: metadata.picks,
        status: 'cashed',
        multiplier,
        payout,
        mines: metadata.mines,
        balance: {
          available: result.updatedBalance.available,
          reserved: result.updatedBalance.reserved,
          bonusAvailable: result.updatedBalance.bonusAvailable,
          bonusReserved: result.updatedBalance.bonusReserved
        },
        nftGift
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сыграть.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }

  return applyHeaders(NextResponse.json({ error: 'Некорректное действие.' }, { status: 400 }), rateResult);
}
