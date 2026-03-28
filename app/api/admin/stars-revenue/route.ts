import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const rateResult = applyAdminRateLimit(req, 30, 60_000);
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const authResult = await requireAdminAuth(req);
    
    if (!authResult.isAuthenticated) {
      if (authResult.requiresTOTP) {
        return applyHeaders(
          NextResponse.json({ error: 'TOTP required', requiresTOTP: true }, { status: 401 }),
          rateResult
        );
      }
      return applyHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    // Получаем все транзакции Telegram Stars
    const telegramStarsTransactions = await prisma.transaction.findMany({
      where: {
        provider: 'TELEGRAM_STARS',
        type: 'DEPOSIT',
        status: 'COMPLETED'
      },
      include: {
        user: {
          select: {
            telegramId: true,
            username: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Статистика
    const totalStars = telegramStarsTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalTransactions = telegramStarsTransactions.length;
    
    // За сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTransactions = telegramStarsTransactions.filter(
      t => new Date(t.createdAt) >= today
    );
    const todayStars = todayTransactions.reduce((sum, t) => sum + t.amount, 0);

    // За последние 7 дней
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekTransactions = telegramStarsTransactions.filter(
      t => new Date(t.createdAt) >= weekAgo
    );
    const weekStars = weekTransactions.reduce((sum, t) => sum + t.amount, 0);

    // За последние 30 дней
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthTransactions = telegramStarsTransactions.filter(
      t => new Date(t.createdAt) >= monthAgo
    );
    const monthStars = monthTransactions.reduce((sum, t) => sum + t.amount, 0);

    const revenueData = {
      totalStars,
      totalTransactions,
      today: {
        stars: todayStars,
        transactions: todayTransactions.length
      },
      week: {
        stars: weekStars,
        transactions: weekTransactions.length
      },
      month: {
        stars: monthStars,
        transactions: monthTransactions.length
      },
      recentTransactions: telegramStarsTransactions.slice(0, 50).map(t => ({
        id: t.id,
        userId: t.userId,
        user: {
          telegramId: Number(t.user.telegramId),
          username: t.user.username,
          firstName: t.user.firstName,
          lastName: t.user.lastName
        },
        stars: t.amount,
        createdAt: t.createdAt.toISOString(),
        meta: t.meta
      }))
    };

    return applyHeaders(NextResponse.json(revenueData), rateResult);
  } catch (error) {
    console.error('Stars revenue error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}
