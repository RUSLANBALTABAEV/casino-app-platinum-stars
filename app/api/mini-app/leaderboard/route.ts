import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';

async function resolveUser(req: NextRequest) {
  const rawInitData = req.headers.get('x-telegram-init-data');
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const botToken = getBotToken();
    if (!verifyInitData(rawInitData, botToken)) throw new Error('Invalid Telegram signature');
  } catch {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Invalid Telegram signature');
  }
  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  return syncTelegramUser(ensureTelegramUser(initData));
}

const DEMO_LEADERBOARD = [
  { rank: 1, userId: 'demo-1', displayName: 'StarKing', telegramId: 100001, lifetimeEarn: 48200, gamesPlayed: 1240, isPremium: true },
  { rank: 2, userId: 'demo-2', displayName: '@goldfish', telegramId: 100002, lifetimeEarn: 35700, gamesPlayed: 890, isPremium: false },
  { rank: 3, userId: 'demo-3', displayName: 'LuckyAce', telegramId: 100003, lifetimeEarn: 29100, gamesPlayed: 765, isPremium: true },
  { rank: 4, userId: 'demo-4', displayName: '@player99', telegramId: 100004, lifetimeEarn: 21500, gamesPlayed: 520, isPremium: false },
  { rank: 5, userId: 'demo-5', displayName: 'NightOwl', telegramId: 100005, lifetimeEarn: 18900, gamesPlayed: 441, isPremium: false },
];

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:leaderboard`, {
    limit: 20,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  // Demo mode
  const demoHeader = req.headers.get('x-demo-mode');
  if (demoHeader === '1') {
    return applyHeaders(
      NextResponse.json({ leaderboard: DEMO_LEADERBOARD, currentUserRank: null }),
      rateResult
    );
  }

  let currentUserId: string | null = null;
  try {
    const user = await resolveUser(req);
    currentUserId = user.userId;
  } catch {
    // anonymous request - still show leaderboard
  }

  try {
    await ensureDatabaseReady();

    const top = await prisma.starBalance.findMany({
      orderBy: { lifetimeEarn: 'desc' },
      take: 50,
      include: {
        user: {
          select: {
            id: true,
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true,
            isPremium: true,
            gameSessions: {
              where: { finishedAt: { not: null } },
              select: { id: true }
            }
          }
        }
      }
    });

    const leaderboard = top.map((entry, idx) => {
      const u = entry.user;
      const displayName = u.username
        ? `@${u.username}`
        : [u.firstName, u.lastName].filter(Boolean).join(' ') || `ID ${u.telegramId}`;
      return {
        rank: idx + 1,
        userId: u.id,
        displayName,
        telegramId: Number(u.telegramId),
        lifetimeEarn: entry.lifetimeEarn,
        gamesPlayed: u.gameSessions.length,
        isPremium: u.isPremium
      };
    });

    let currentUserRank: {
      rank: number;
      lifetimeEarn: number;
      gamesPlayed: number;
    } | null = null;

    if (currentUserId) {
      const myBalance = await prisma.starBalance.findUnique({ where: { userId: currentUserId } });
      if (myBalance) {
        const rankCount = await prisma.starBalance.count({
          where: { lifetimeEarn: { gt: myBalance.lifetimeEarn } }
        });
        const myGames = await prisma.gameSession.count({
          where: { userId: currentUserId, finishedAt: { not: null } }
        });
        currentUserRank = {
          rank: rankCount + 1,
          lifetimeEarn: myBalance.lifetimeEarn,
          gamesPlayed: myGames
        };
      }
    }

    return applyHeaders(
      NextResponse.json({ leaderboard, currentUserRank }),
      rateResult
    );
  } catch (err) {
    console.error('[LEADERBOARD] Error:', err);
    return applyHeaders(
      NextResponse.json({ error: 'Ошибка загрузки рейтинга' }, { status: 500 }),
      rateResult
    );
  }
}
