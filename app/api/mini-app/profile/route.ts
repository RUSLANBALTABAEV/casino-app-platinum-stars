/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { countAvailablePromos, getDailyWindow } from '@/lib/services/promo';
import { getReferralStats } from '@/lib/services/referral';
import { calculateStreakDays } from '@/lib/services/streak';
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(getClientIdentifier(req), {
    limit: 40,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json(
        { error: 'Слишком много запросов. Повторите позже.' },
        { status: 429 }
      ),
      rateResult
    );
  }

  try {
    if (isDemoRequest(req)) {
      const demoBalance = getDemoBalance();
      return applyHeaders(
        NextResponse.json({
          profile: {
            balance: demoBalance.available,
            streakDays: 4,
            earnedToday: 180,
            availablePromos: 2,
            status: 'STANDARD',
            statusExpiresAt: null,
            user: {
              telegramId: 0,
              username: 'demo_user',
              firstName: 'Demo',
              lastName: 'Player',
              languageCode: 'ru',
              avatarUrl: null,
              isPremium: false
            }
          },
          referral: null,
          source: 'demo',
          fallback: false
        }),
        rateResult
      );
    }
    const rawInitData = req.headers.get('x-telegram-init-data');

    let synced;
    if (!rawInitData) {
      if (isDevTelegramBypassEnabled()) {
        synced = await syncTelegramUser(getDevTelegramUser());
      } else {
        return applyHeaders(
          NextResponse.json({ error: 'Missing X-Telegram-Init-Data header' }, { status: 401 }),
          rateResult
        );
      }
    } else {
      try {
        const botToken = getBotToken();
        const isValid = verifyInitData(rawInitData, botToken);
        if (!isValid) {
          throw new Error('Invalid Telegram signature');
        }
        const initData = parseInitData(rawInitData);
        assertInitDataIsFresh(initData);
        const telegramUser = ensureTelegramUser(initData);
        synced = await syncTelegramUser(telegramUser);
      } catch (error) {
        if (isDevTelegramBypassEnabled()) {
          synced = await syncTelegramUser(getDevTelegramUser());
        } else {
          const message = error instanceof Error ? error.message : 'Unauthorized';
          return applyHeaders(NextResponse.json({ error: message }, { status: 401 }), rateResult);
        }
      }
    }
    const userId = synced.userId;

    try {
      await ensureDatabaseReady();
    } catch (dbError) {
      // Не прерываем выполнение, если БД не готова
    }

    // Get user record with status
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        statusExpiresAt: true,
        username: true,
        firstName: true,
        lastName: true,
        languageCode: true,
        avatarUrl: true,
        isPremium: true,
        telegramId: true
      }
    });

    if (!userRecord) {
      return applyHeaders(
        NextResponse.json({ error: 'User not found' }, { status: 404 }),
        rateResult
      );
    }

    // Get balance
    const balance = await prisma.starBalance.findUnique({
      where: { userId }
    });

    // Если баланса нет - создаем его
    let finalBalance = balance;
    if (!balance) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[PROFILE] Creating balance for user:', userId);
      }
      const { upsertStarBalanceByUserId } = await import('@/lib/db/star-balance');
      await upsertStarBalanceByUserId(userId, 0);
      finalBalance = await prisma.starBalance.findUnique({
        where: { userId }
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log('[PROFILE] Created balance:', finalBalance ? { available: finalBalance.available } : 'failed');
      }
    }

    // Get today's earnings from transactions and game sessions
    const { start, end } = getDailyWindow();
    
    // Заработано из транзакций (только REWARD, не DEPOSIT - депозиты это пополнения, не заработок)
    const earnedTodayTransactions = await prisma.transaction.aggregate({
      _sum: { amount: true },
      where: {
        userId,
        createdAt: {
          gte: start,
          lt: end
        },
        status: 'COMPLETED',
        type: 'REWARD' // Только награды, не депозиты
      }
    });

    // Заработано из игровых сессий за сегодня
    const earnedTodayGames = await prisma.gameSession.aggregate({
      _sum: { payout: true },
      where: {
        userId,
        finishedAt: {
          gte: start,
          lt: end
        },
        payout: { gt: 0 }
      }
    });

    // Заработано из заданий за сегодня
    const completedTasksToday = await prisma.userTask.findMany({
      where: {
        userId,
        awardedAt: {
          gte: start,
          lt: end
        },
        status: 'APPROVED'
      },
      include: {
        task: {
          select: {
            reward: true
          }
        }
      }
    });
    
    const earnedTodayTasks = completedTasksToday.reduce((sum, userTask) => {
      return sum + (userTask.task?.reward ?? 0);
    }, 0);

    const earnedToday = 
      (earnedTodayTransactions._sum.amount ?? 0) +
      (earnedTodayGames._sum.payout ?? 0) +
      earnedTodayTasks;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PROFILE] Earnings breakdown:', {
        transactions: earnedTodayTransactions._sum.amount ?? 0,
        games: earnedTodayGames._sum.payout ?? 0,
        tasks: earnedTodayTasks,
        total: earnedToday
      });
    }

    // Get streak days, promo count and referrals
    const streakDays = await calculateStreakDays(userId);
    const promoCount = await countAvailablePromos(userId);
    const referral = await getReferralStats(userId).catch(() => null);

    const balanceValue = finalBalance?.available ?? 0;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[PROFILE] Full profile data:', {
        userId,
        balance: balanceValue,
        streakDays,
        earnedToday,
        availablePromos: promoCount,
        status: userRecord.status,
        statusExpiresAt: userRecord.statusExpiresAt
      });
    }

    return applyHeaders(
      NextResponse.json({
        profile: {
          balance: balanceValue,
          streakDays,
          earnedToday,
          availablePromos: promoCount,
          status: userRecord.status,
          statusExpiresAt: userRecord.statusExpiresAt ? userRecord.statusExpiresAt.toISOString() : null,
          user: {
            telegramId: Number(userRecord.telegramId),
            username: userRecord.username,
            firstName: userRecord.firstName,
            lastName: userRecord.lastName,
            languageCode: userRecord.languageCode,
            avatarUrl: userRecord.avatarUrl,
            isPremium: userRecord.isPremium
          }
        },
        referral,
        source: 'database',
        fallback: false
      }),
      rateResult
    );

  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[PROFILE] Profile API error:', error);
      console.error('[PROFILE] Error type:', error instanceof Error ? error.constructor.name : typeof error);
      console.error('[PROFILE] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[PROFILE] Error stack:', error instanceof Error ? error.stack : 'No stack');
    } else {
      console.error('[PROFILE] Profile API error:', error instanceof Error ? error.message : String(error));
    }

    if (error instanceof Error) {
      // Проверяем различные типы ошибок аутентификации
      if (error.message === 'Authentication required' || 
          error.message.includes('Authentication') ||
          error.message.includes('Missing') ||
          error.message.includes('Invalid') ||
          error.message.includes('expired')) {
        return applyHeaders(
          NextResponse.json({ error: error.message || 'Authentication required' }, { status: 401 }),
          rateResult
        );
      }
    }

    return applyHeaders(
      NextResponse.json({
        error: 'Internal server error',
        profile: {
          balance: 0,
          streakDays: 0,
          earnedToday: 0,
          availablePromos: 0,
          status: 'STANDARD',
          statusExpiresAt: null,
          user: null
        },
        referral: null,
        source: 'error',
        fallback: true
      }, { status: 500 }),
      rateResult
    );
  }
}
