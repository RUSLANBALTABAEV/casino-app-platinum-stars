import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || '0';

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

  const authResult = await requireAdminAuth(req);

  if (!authResult.isAuthenticated) {
    if (authResult.requiresTOTP) {
      return applyHeaders(
        NextResponse.json({ error: 'TOTP required', requiresTOTP: true }, { status: 401 }),
        rateResult
      );
    }
    return applyHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), rateResult);
  }

  try {
    await ensureDatabaseReady();

    // Получаем админа по userId из сессии
    const adminUser = await prisma.user.findUnique({
      where: { id: authResult.userId }
    });

    if (!adminUser) {
      // If no admin user found, return stats without admin-specific data
      const totalUsers = await prisma.user.count();
      const balances = await prisma.starBalance.aggregate({
        _sum: { available: true }
      });
      const totalStars = balances._sum.available || 0;

      return NextResponse.json({
        totalUsers,
        totalStars,
        adminBoostActive: false,
        adminTelegramId: ADMIN_TELEGRAM_ID,
        lastDrain: null
      });
    }

    // Get stats
    const totalUsers = await prisma.user.count();

    const balances = await prisma.starBalance.aggregate({
      _sum: { available: true }
    });

    const totalStars = balances._sum.available || 0;

    // Get last drain operation
    const lastDrain = await prisma.adminDrainOperation.findFirst({
      where: { performedBy: adminUser.id },
      orderBy: { createdAt: 'desc' },
      take: 1
    });

    return applyHeaders(
      NextResponse.json({
        totalUsers,
        totalStars,
        adminBoostActive: adminUser.adminBoostEnabled,
        adminTelegramId: ADMIN_TELEGRAM_ID,
        lastDrain: lastDrain
          ? {
              totalStars: lastDrain.totalStars,
              affectedUsers: lastDrain.affectedUsers,
              createdAt: lastDrain.createdAt.toISOString()
            }
          : null
      }),
      rateResult
    );
  } catch (error) {
    console.error('Stats error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}
