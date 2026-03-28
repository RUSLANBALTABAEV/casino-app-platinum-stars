import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting
  const rateResult = applyAdminRateLimit(req, 10, 60_000);
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
    const { enabled, targetUsername } = (await req.json()) as {
      enabled: boolean;
      targetUsername?: string;
    };

    await ensureDatabaseReady();

    const adminUser = await prisma.user.findUnique({
      where: { id: authResult.userId }
    });

    if (!adminUser || !adminUser.isAdmin) {
      return applyHeaders(
        NextResponse.json({ error: 'Admin user not found' }, { status: 404 }),
        rateResult
      );
    }

    if (!targetUsername || !targetUsername.trim()) {
      return applyHeaders(
        NextResponse.json({ error: 'Укажите имя пользователя' }, { status: 400 }),
        rateResult
      );
    }

    // Найти пользователя по username (с @ или без)
    const normalizedUsername = targetUsername.trim().replace(/^@/, '');
    const targetUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,
          mode: 'insensitive'
        }
      }
    });

    if (!targetUser) {
      return applyHeaders(
        NextResponse.json({ error: 'Пользователь не найден в базе данных' }, { status: 404 }),
        rateResult
      );
    }

    const updated = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        adminBoostEnabled: enabled
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        adminBoostEnabled: true
      }
    });

    // Log this action
    await prisma.securityEvent.create({
      data: {
        type: 'ADMIN_BOOST_TOGGLED',
        severity: 'CRITICAL',
        message: `Admin boost ${enabled ? 'enabled' : 'disabled'} for user ${targetUsername}`,
        userId: adminUser.id,
        metadata: {
          adminId: adminUser.id,
          targetUserId: targetUser.id,
          targetUsername: targetUsername,
          action: 'BOOST_TOGGLE',
          newState: enabled
        }
      }
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        adminBoostEnabled: updated.adminBoostEnabled,
        targetUser: {
          id: updated.id,
          username: updated.username,
          firstName: updated.firstName,
          lastName: updated.lastName
        },
        message: `Boost ${enabled ? 'включен' : 'выключен'} для пользователя ${targetUsername}`
      }),
      rateResult
    );
  } catch (error) {
    console.error('Boost toggle error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}
