import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { requireAdminAuth, applyAdminRateLimit } from '@/lib/services/admin-auth';
import { applyHeaders } from '@/lib/http/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyAdminRateLimit(req, 20, 60_000);
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
      rateResult
    );
  }

  let authResult;
  try {
    authResult = await requireAdminAuth(req);
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      rateResult
    );
  }
  
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

  try {
    const { username } = await req.json() as { username?: string };

    if (!username || !username.trim()) {
      return applyHeaders(
        NextResponse.json({ error: 'Username required' }, { status: 400 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    const normalizedUsername = username.trim().replace(/^@/, '');
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: normalizedUsername,
          mode: 'insensitive'
        }
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        telegramId: true
      }
    });

    if (!user) {
      return applyHeaders(
        NextResponse.json({ error: 'User not found' }, { status: 404 }),
        rateResult
      );
    }

    return applyHeaders(
      NextResponse.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          telegramId: user.telegramId.toString()
        }
      }),
      rateResult
    );
  } catch (error) {
    console.error('User search error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const status = errorMessage.includes('Unauthorized') || errorMessage.includes('token') ? 401 : 500;
    return applyHeaders(
      NextResponse.json({ error: errorMessage }, { status }),
      rateResult
    );
  }
}
