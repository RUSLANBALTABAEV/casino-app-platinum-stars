import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { isDemoRequest } from '@/lib/demo-mode';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh, ensureTelegramUser, getBotToken,
  getDevTelegramUser, isDevTelegramBypassEnabled,
  parseInitData, verifyInitData
} from '@/lib/telegram/init-data';

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing auth');
  }
  try {
    if (!verifyInitData(raw, getBotToken())) throw new Error('Invalid signature');
  } catch {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Invalid signature');
  }
  const parsed = parseInitData(raw);
  assertInitDataIsFresh(parsed);
  return syncTelegramUser(ensureTelegramUser(parsed));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:profile-stats`, {
    limit: 20, windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(NextResponse.json({ error: 'Rate limit' }, { status: 429 }), rateResult);
  }

  if (isDemoRequest(req)) {
    return applyHeaders(NextResponse.json({
      stats: { totalSessions: 12, totalWagered: 1500, totalPayout: 1350, winRate: 58.3, favoriteGame: 'COINFLIP' }
    }), rateResult);
  }

  try {
    const user = await resolveUser(req);

    const [sessions, winCount] = await Promise.all([
      prisma.gameSession.count({ where: { userId: user.userId } }),
      prisma.gameSession.count({ where: { userId: user.userId, payout: { gt: 0 } } }),
    ]);

    const agg = await prisma.gameSession.aggregate({
      where: { userId: user.userId },
      _sum: { wager: true, payout: true }
    });

    // Favorite game
    const byType = await prisma.gameSession.groupBy({
      by: ['gameType'],
      where: { userId: user.userId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1
    });

    const totalSessions = sessions;
    const totalWagered  = agg._sum.wager  ?? 0;
    const totalPayout   = agg._sum.payout ?? 0;
    const winRate       = totalSessions > 0 ? parseFloat(((winCount / totalSessions) * 100).toFixed(1)) : 0;
    const favoriteGame  = byType[0]?.gameType ?? null;

    return applyHeaders(NextResponse.json({
      stats: { totalSessions, totalWagered, totalPayout, winRate, favoriteGame }
    }), rateResult);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error';
    return applyHeaders(NextResponse.json({ error: msg }, { status: 400 }), rateResult);
  }
}
