import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyRateLimit, buildRateLimitHeaders } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';

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
    return NextResponse.json({ items: [], total: 0, fallback: true }, { status: 200 });
  }

  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-nfts`, {
    limit: 40,
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

  const limitParam = req.nextUrl.searchParams.get('limit');
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 20;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;

  const telegramId = BigInt(telegramIdParam);

  try {
    await ensureDatabaseReady();
    const user = (await runWithTimeout(
      () =>
        prisma.user.findUnique({
          where: { telegramId: telegramId }
        }),
      10_000
    )) as { id: string } | null;

    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'User not found. Ask them to open the mini-app first.' }), {
        status: 404,
        headers: buildRateLimitHeaders(rateResult)
      });
    }

    const [items, total] = await Promise.all([
      prisma.userNftGift.findMany({
        where: { userId: user.id, status: 'OWNED' },
        include: { gift: true },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.userNftGift.count({
        where: { userId: user.id, status: 'OWNED' }
      })
    ]);

    return new NextResponse(
      JSON.stringify({
        total,
        limit,
        items: items.map((item) => ({
          id: item.id,
          giftId: item.giftId,
          name: item.gift.name,
          rarity: item.gift.rarity,
          imageUrl: item.gift.imageUrl,
          priceStars: item.gift.priceStars,
          status: item.status,
          receivedAt: item.createdAt.toISOString()
        }))
      }),
      {
        status: 200,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  } catch (error) {
    console.error('Failed to fetch bot NFT inventory:', error);
    return new NextResponse(
      JSON.stringify({
        error: 'NFT inventory service temporarily unavailable',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 503,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  }
}
