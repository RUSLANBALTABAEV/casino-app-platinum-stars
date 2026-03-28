import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { prisma } from '@/lib/prisma';
import { getGameSetting } from '@/lib/services/game-settings';
import { getGameAvailability } from '@/lib/services/game-settings';
import { syncTelegramUser } from '@/lib/services/user';
import { logSecurityEvent } from '@/lib/services/security';
import {
  assertInitDataIsFresh, ensureTelegramUser, getBotToken,
  getDevTelegramUser, isDevTelegramBypassEnabled,
  parseInitData, verifyInitData
} from '@/lib/telegram/init-data';

// action: 'start' — deduct bet, return sessionId
// action: 'cashout' — credit payout, close session
// action: 'crash' — record loss (bet already deducted at start)

type CrashBody = {
  action: 'start' | 'cashout' | 'crash';
  bet?: number;
  sessionId?: string;
  multiplier?: number;
};

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    if (!verifyInitData(raw, getBotToken())) throw new Error('Invalid Telegram signature');
  } catch {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Invalid Telegram signature');
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  return syncTelegramUser(ensureTelegramUser(initData));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:crash:post`, {
    limit: 60, windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  let body: CrashBody;
  try { body = await req.json() as CrashBody; } catch {
    return applyHeaders(NextResponse.json({ error: 'Bad request' }, { status: 400 }), rateResult);
  }

  const { action, bet = 50, sessionId, multiplier = 1 } = body;

  // DEMO mode — return fake balance changes
  if (isDemoRequest(req)) {
    const demo = getDemoBalance();
    if (action === 'start') {
      return applyHeaders(NextResponse.json({
        success: true,
        sessionId: `demo-${Date.now()}`,
        balance: { available: demo.available - bet, reserved: 0 }
      }), rateResult);
    }
    if (action === 'cashout') {
      const payout = Math.round(bet * multiplier);
      return applyHeaders(NextResponse.json({
        success: true,
        payout,
        balance: { available: demo.available - bet + payout, reserved: 0 }
      }), rateResult);
    }
    return applyHeaders(NextResponse.json({
      success: true,
      balance: { available: demo.available - bet, reserved: 0 }
    }), rateResult);
  }

  try {
    const user = await resolveUser(req);

    const setting = await getGameSetting('CRASH', 'config');
    const config = (setting?.value ?? {}) as { baseBet?: number };
    const minBet = config.baseBet ?? 10;

    const availability = await getGameAvailability('CRASH' as any);
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Краш временно недоступен.' }, { status: 403 }),
        rateResult
      );
    }

    const normalizedBet = Math.max(minBet, Math.round(bet));

    // ── START: deduct bet ──
    if (action === 'start') {
      const result = await prisma.$transaction(async (tx) => {
        let balance = await tx.starBalance.findUnique({ where: { userId: user.userId } });
        if (!balance) throw new Error('Баланс не найден.');
        if (balance.available < normalizedBet) throw new Error('Недостаточно звёзд для ставки.');

        const updated = await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            available: { decrement: normalizedBet },
            lifetimeSpend: { increment: normalizedBet }
          }
        });

        // Create game session
        const session = await tx.gameSession.create({
          data: {
            userId: user.userId,
            gameType: 'CRASH' as any,
            wager: normalizedBet,
            payout: 0,
            metadata: { action: 'start', bet: normalizedBet, status: 'active' }
          }
        });

        await tx.transaction.create({
          data: {
            userId: user.userId,
            type: 'PURCHASE',
            amount: normalizedBet,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: { source: 'CRASH_WAGER', sessionId: session.id }
          }
        });

        return { balance: updated, sessionId: session.id };
      });

      return applyHeaders(NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        balance: { available: result.balance.available, reserved: result.balance.reserved }
      }), rateResult);
    }

    // ── CASHOUT: credit payout ──
    if (action === 'cashout') {
      if (!sessionId) {
        return applyHeaders(NextResponse.json({ error: 'sessionId required' }, { status: 400 }), rateResult);
      }
      const safeMult = Math.max(1, Math.min(1000, multiplier));
      const payout = Math.round(normalizedBet * safeMult);

      const result = await prisma.$transaction(async (tx) => {
        const session = await tx.gameSession.findUnique({ where: { id: sessionId } });
        if (!session || session.userId !== user.userId) throw new Error('Сессия не найдена.');
        if ((session.metadata as any)?.status === 'cashed') throw new Error('Уже выведено.');

        const updated = await tx.starBalance.update({
          where: { userId: user.userId },
          data: {
            available: { increment: payout },
            lifetimeEarn: { increment: payout }
          }
        });

        await tx.gameSession.update({
          where: { id: sessionId },
          data: {
            payout,
            finishedAt: new Date(),
            metadata: { ...(session.metadata as object), status: 'cashed', multiplier: safeMult, payout }
          }
        });

        await tx.transaction.create({
          data: {
            userId: user.userId,
            type: 'REWARD',
            amount: payout,
            currency: 'STARS',
            provider: 'MANUAL',
            status: 'COMPLETED',
            meta: { source: 'CRASH_CASHOUT', sessionId, multiplier: safeMult }
          }
        });

        return { balance: updated, payout };
      });

      await logSecurityEvent({
        type: 'CRASH_PLAY', severity: 'INFO',
        message: `Crash cashout: x${safeMult} = ${payout}★`,
        userId: user.userId,
        metadata: { bet: normalizedBet, payout, multiplier: safeMult }
      });

      return applyHeaders(NextResponse.json({
        success: true,
        payout: result.payout,
        balance: { available: result.balance.available, reserved: result.balance.reserved }
      }), rateResult);
    }

    // ── CRASH: record loss (bet already deducted) ──
    if (action === 'crash') {
      if (sessionId) {
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            finishedAt: new Date(),
            metadata: { status: 'crashed', bet: normalizedBet, payout: 0 }
          }
        }).catch(() => {});
      }

      await logSecurityEvent({
        type: 'CRASH_PLAY', severity: 'INFO',
        message: `Crash: lost ${normalizedBet}★`,
        userId: user.userId,
        metadata: { bet: normalizedBet, payout: 0 }
      });

      const balance = await prisma.starBalance.findUnique({ where: { userId: user.userId } });
      return applyHeaders(NextResponse.json({
        success: true,
        balance: { available: balance?.available ?? 0, reserved: balance?.reserved ?? 0 }
      }), rateResult);
    }

    return applyHeaders(NextResponse.json({ error: 'Unknown action' }, { status: 400 }), rateResult);

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка сервера';
    return applyHeaders(NextResponse.json({ error: msg }, { status: 400 }), rateResult);
  }
}
