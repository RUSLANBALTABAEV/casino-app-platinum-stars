import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyRateLimit, buildRateLimitHeaders } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { getFallbackBalance } from '@/lib/services/fallback-store';

type TimedOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

async function runWithTimeout<T>(factory: () => Promise<T>, timeoutMs: number): Promise<T> {
  const attempt = factory()
    .then<TimedOutcome<T>>((value) => ({ kind: 'success', value }))
    .catch<TimedOutcome<T>>((error) => ({ kind: 'error', error }));

  const timeoutPromise = new Promise<TimedOutcome<T>>((resolve) => {
    setTimeout(() => resolve({ kind: 'timeout' }), timeoutMs);
  });

  const outcome = await Promise.race([attempt, timeoutPromise]);

  if (outcome.kind === 'success') {
    return outcome.value;
  }

  if (outcome.kind === 'error') {
    throw outcome.error;
  }

  throw new Error('timeout');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Skip during build time - complete bypass
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      balance: { available: 0, reserved: 0 },
      fallback: true
    }, { status: 200 });
  }

  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-balance`, {
    limit: 60,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  const telegramIdParam = req.nextUrl.searchParams.get('telegramId');
  if (!telegramIdParam) {
    return new NextResponse(JSON.stringify({ error: 'telegramId is required' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  const telegramId = BigInt(telegramIdParam);
  const telegramIdNumber = Number(telegramId);

  try {
    try {
      await ensureDatabaseReady();
    } catch (readyError) {
      console.error('Database not ready for bot balance, trying fallback.', readyError);
      const fallback = Number.isFinite(telegramIdNumber) ? getFallbackBalance(telegramIdNumber) : null;
      if (fallback) {
        return new NextResponse(JSON.stringify({
          balance: {
            available: fallback.available,
            reserved: fallback.reserved
          },
          fallback: true
        }), {
          status: 200,
          headers: buildRateLimitHeaders(rateResult)
        });
      }
      return new NextResponse(JSON.stringify({
        error: 'Balance service temporarily unavailable',
        details: 'Database not ready'
      }), {
        status: 503,
        headers: buildRateLimitHeaders(rateResult)
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = (await runWithTimeout(
      () =>
        prisma.user.findUnique({
          where: { telegramId: telegramId },
          include: { balances: true }
        }),
      10_000
    )) as any;

    if (!user) {
      const fallback = Number.isFinite(telegramIdNumber) ? getFallbackBalance(telegramIdNumber) : null;
      if (fallback) {
        return new NextResponse(JSON.stringify({
          balance: {
            available: fallback.available,
            reserved: fallback.reserved
          },
          fallback: true
        }), {
          status: 200,
          headers: buildRateLimitHeaders(rateResult)
        });
      }
      return new NextResponse(JSON.stringify({ error: 'User not found. Ask them to open the mini-app first.' }), {
        status: 404,
        headers: buildRateLimitHeaders(rateResult)
      });
    }

    // Если баланса нет - создаем его
    if (!user.balances) {
      const { upsertStarBalanceByUserId } = await import('@/lib/db/star-balance');
      await upsertStarBalanceByUserId(user.id, 0);
      
      // Получаем созданный баланс
      const updatedUser = await prisma.user.findUnique({
        where: { telegramId: telegramId },
        include: { balances: true }
      });

      if (!updatedUser || !updatedUser.balances) {
        return new NextResponse(JSON.stringify({ error: 'Failed to create balance' }), {
          status: 500,
          headers: buildRateLimitHeaders(rateResult)
        });
      }

      return new NextResponse(JSON.stringify({
        balance: {
          available: updatedUser.balances.available,
          reserved: updatedUser.balances.reserved
        }
      }), {
        status: 200,
        headers: buildRateLimitHeaders(rateResult)
      });
    }

    return new NextResponse(JSON.stringify({
      balance: {
        available: user.balances.available,
        reserved: user.balances.reserved
      }
    }), {
      status: 200,
      headers: buildRateLimitHeaders(rateResult)
    });
  } catch (error) {
    console.error('Failed to fetch balance via Prisma:', error);
    return new NextResponse(JSON.stringify({ 
      error: 'Balance service temporarily unavailable',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 503,
      headers: buildRateLimitHeaders(rateResult)
    });
  }
}
