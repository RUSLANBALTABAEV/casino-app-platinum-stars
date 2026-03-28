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

type TicTacToeAction = 'start' | 'move';

type TicTacToeBody = {
  action?: TicTacToeAction;
  bet?: number;
  sessionId?: string;
  index?: number;
};

type TicTacToeMetadata = {
  board: Array<'X' | 'O' | null>;
  status: 'active' | 'win' | 'lose' | 'draw';
  multiplier: number;
};

type TicTacToeResponse = {
  sessionId: string;
  board: Array<'X' | 'O' | null>;
  status: TicTacToeMetadata['status'];
  payout?: number;
  balance?: {
    available: number;
    reserved: number;
    bonusAvailable?: number;
    bonusReserved?: number;
  };
};

const demoSessions = new Map<string, TicTacToeMetadata>();

function checkWinner(board: Array<'X' | 'O' | null>) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function isBoardFull(board: Array<'X' | 'O' | null>) {
  return board.every((cell) => cell !== null);
}

function findWinningMove(board: Array<'X' | 'O' | null>, mark: 'X' | 'O') {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (const [a, b, c] of lines) {
    const line = [board[a], board[b], board[c]];
    const emptyIndex = line.findIndex((cell) => cell === null);
    if (emptyIndex === -1) {
      continue;
    }
    const marks = line.filter((cell) => cell === mark).length;
    if (marks === 2) {
      return [a, b, c][emptyIndex];
    }
  }
  return null;
}

// Minimax with alpha-beta pruning — unbeatable AI
function minimax(
  board: Array<'X' | 'O' | null>,
  depth: number,
  isMax: boolean,
  alpha: number,
  beta: number
): number {
  const winner = checkWinner(board);
  if (winner === 'O') return 10 - depth;
  if (winner === 'X') return depth - 10;
  if (isBoardFull(board)) return 0;
  if (depth >= 6) return 0; // depth limit for speed

  if (isMax) {
    let best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'O';
        best = Math.max(best, minimax(board, depth + 1, false, alpha, beta));
        board[i] = null;
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  } else {
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = 'X';
        best = Math.min(best, minimax(board, depth + 1, true, alpha, beta));
        board[i] = null;
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
    }
    return best;
  }
}

/**
 * AI move with configurable difficulty:
 * - winChance >= 0.6 → smart AI (plays optimally most of the time, rare mistakes)
 * - winChance < 0.6  → easier AI (makes random moves more often)
 * 
 * This prevents the "always win" exploit by mixing optimal and random moves.
 */
function findBestMove(board: Array<'X' | 'O' | null>, winChance = 0.45) {
  const empty = board.map((v, i) => v === null ? i : -1).filter(i => i >= 0);
  if (!empty.length) return null;

  // Always block immediate player win (anti-exploit)
  const blockMove = findWinningMove(board, 'X');
  if (blockMove !== null) {
    // Always block - this prevents the known winning exploit
    return blockMove;
  }

  // Take immediate win if available
  const winMove = findWinningMove(board, 'O');
  if (winMove !== null) return winMove;

  // Difficulty: higher winChance = smarter AI = harder for player
  // winChance 0.45 means player wins ~45% → house edge ~5% after multiplier
  const smartness = Math.min(0.95, Math.max(0.3, 1 - winChance));
  
  if (Math.random() < smartness) {
    // Play randomly (gives player more wins)
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // Play optimally (AI tries to win/draw)
  let bestScore = -Infinity;
  let bestMove = empty[0]!;

  // Shuffle to randomize equal moves
  const shuffled = [...empty].sort(() => Math.random() - 0.5);

  for (const i of shuffled) {
    board[i] = 'O';
    const score = minimax(board, 0, false, -Infinity, Infinity);
    board[i] = null;
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-ttt:post`, {
    limit: 60,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: TicTacToeBody;
  try {
    body = (await req.json()) as TicTacToeBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  const action: TicTacToeAction = body.action ?? 'start';

  const setting = await getGameSetting('TICTACTOE', 'config');
  const config = (setting?.value ?? {}) as { multiplier?: number; baseBet?: number; winChance?: number; drawChance?: number };
  const multiplier  = typeof config.multiplier  === 'number' ? config.multiplier  : 2.0;
  const baseBet     = typeof config.baseBet     === 'number' ? config.baseBet     : 15;
  const winChance   = typeof config.winChance   === 'number' ? config.winChance   : 0.45; // 45% player wins → ~90% RTP
  const drawChance  = typeof config.drawChance  === 'number' ? config.drawChance  : 0.20; // 20% draws → bet returned

  if (isDemoRequest(req)) {
    if (action === 'start') {
      const sessionId = crypto.randomUUID();
      demoSessions.set(sessionId, { board: Array(9).fill(null), status: 'active', multiplier });
      const response: TicTacToeResponse = {
        sessionId,
        board: Array(9).fill(null),
        status: 'active',
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
    if (session.status !== 'active') {
      return applyHeaders(NextResponse.json({ error: 'Игра уже завершена.' }, { status: 400 }), rateResult);
    }

    const index = typeof body.index === 'number' ? Math.round(body.index) : -1;
    if (index < 0 || index >= 9 || session.board[index]) {
      return applyHeaders(NextResponse.json({ error: 'Некорректный ход.' }, { status: 400 }), rateResult);
    }

    session.board[index] = 'X';
    const playerWin = checkWinner(session.board);
    if (playerWin) {
      session.status = 'win';
      const response: TicTacToeResponse = {
        sessionId,
        board: session.board,
        status: 'win',
        payout: Math.round(baseBet * multiplier),
        balance: getDemoBalance()
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    if (isBoardFull(session.board)) {
      session.status = 'draw';
      const response: TicTacToeResponse = {
        sessionId,
        board: session.board,
        status: 'draw',
        payout: baseBet,
        balance: getDemoBalance()
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

    const aiMove = findBestMove(session.board, winChance);
    if (aiMove !== null) {
      session.board[aiMove] = 'O';
    }
    const aiWin = checkWinner(session.board);
    if (aiWin) {
      session.status = 'lose';
    } else if (isBoardFull(session.board)) {
      session.status = 'draw';
    }

    const response: TicTacToeResponse = {
      sessionId,
      board: session.board,
      status: session.status,
      payout: session.status === 'win' ? Math.round(baseBet * multiplier) : session.status === 'draw' ? baseBet : 0,
      balance: getDemoBalance()
    };
    return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
  }

  try {
    const user = await resolveUser(req);
    const bet = typeof body.bet === 'number' ? Math.max(1, Math.round(body.bet)) : baseBet;

    if (action === 'start') {
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
            meta: { source: 'TICTACTOE_WAGER' }
          }
        });
        const session = await tx.gameSession.create({
          data: {
            userId: user.userId,
            gameType: 'TICTACTOE',
            wager: bet,
            metadata: {
              board: Array(9).fill(null),
              status: 'active',
              multiplier
            } satisfies TicTacToeMetadata
          }
        });
        return { balance: updatedBalance, session };
      });

      await logSecurityEvent({
        type: 'TICTACTOE_START',
        severity: 'INFO',
        message: 'Пользователь начал игру TTT',
        userId: user.userId,
        metadata: { bet }
      });

      const response: TicTacToeResponse = {
        sessionId: result.session.id,
        board: Array(9).fill(null),
        status: 'active',
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
    if (!session || session.gameType !== 'TICTACTOE' || session.userId !== user.userId) {
      return applyHeaders(NextResponse.json({ error: 'Сессия не найдена.' }, { status: 404 }), rateResult);
    }
    const metadata = session.metadata as TicTacToeMetadata | null;
    if (!metadata) {
      return applyHeaders(NextResponse.json({ error: 'Некорректные данные сессии.' }, { status: 400 }), rateResult);
    }
    if (session.finishedAt || metadata.status !== 'active') {
      return applyHeaders(NextResponse.json({ error: 'Игра уже завершена.' }, { status: 400 }), rateResult);
    }

    const index = typeof body.index === 'number' ? Math.round(body.index) : -1;
    if (index < 0 || index >= 9 || metadata.board[index]) {
      return applyHeaders(NextResponse.json({ error: 'Некорректный ход.' }, { status: 400 }), rateResult);
    }

    const nextBoard = [...metadata.board];
    nextBoard[index] = 'X';

    let status: TicTacToeMetadata['status'] = 'active';
    let payout = 0;
    let finishedAt: Date | null = null;

    if (checkWinner(nextBoard) === 'X') {
      status = 'win';
    } else if (isBoardFull(nextBoard)) {
      status = 'draw';
    } else {
      const aiMove = findBestMove(nextBoard, winChance);
      if (aiMove !== null) {
        nextBoard[aiMove] = 'O';
      }
      if (checkWinner(nextBoard) === 'O') {
        status = 'lose';
      } else if (isBoardFull(nextBoard)) {
        status = 'draw';
      }
    }

    if (status === 'win') {
      payout = Math.round((session.wager ?? 0) * multiplier);
      finishedAt = new Date();
    } else if (status === 'draw') {
      payout = session.wager ?? 0;
      finishedAt = new Date();
    } else if (status === 'lose') {
      payout = 0;
      finishedAt = new Date();
    }

    if (status === 'active') {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          metadata: {
            board: nextBoard,
            status: 'active',
            multiplier
          } satisfies TicTacToeMetadata
        }
      });
      const response: TicTacToeResponse = {
        sessionId: session.id,
        board: nextBoard,
        status: 'active'
      };
      return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
    }

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
            meta: { source: 'TICTACTOE_REWARD', outcome: status }
          }
        });
      }
      await tx.gameSession.update({
        where: { id: session.id },
        data: {
          payout,
          finishedAt,
          metadata: {
            board: nextBoard,
            status,
            multiplier
          } satisfies TicTacToeMetadata
        }
      });
      return updatedBalance;
    });

    await logSecurityEvent({
      type: 'TICTACTOE_FINISH',
      severity: 'INFO',
      message: 'Пользователь завершил матч TTT',
      userId: user.userId,
      metadata: { bet: session.wager ?? 0, payout, status }
    });

    const response: TicTacToeResponse = {
      sessionId: session.id,
      board: nextBoard,
      status,
      payout,
      balance: {
        available: result.available,
        reserved: result.reserved,
        bonusAvailable: result.bonusAvailable,
        bonusReserved: result.bonusReserved
      }
    };
    return applyHeaders(NextResponse.json({ success: true, result: response }), rateResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сыграть.';
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
