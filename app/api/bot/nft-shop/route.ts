import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyRateLimit, buildRateLimitHeaders } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { NFT_SHOP_TRANSFER_FEE_STARS, createPurchaseOrder } from '@/lib/services/nft-shop';

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
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ items: [], fallback: true }, { status: 200 });
  }

  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-nft-shop:get`, {
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
  const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : 10;
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 30) : 10;

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

    const gifts = await prisma.nftGift.findMany({
      where: {
        isActive: true,
        priceStars: { gt: 0 }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
    const giftIds = gifts.map((gift) => gift.id);
    const inventoryCounts = giftIds.length
      ? await prisma.nftInventoryItem.groupBy({
          by: ['giftId'],
          where: { giftId: { in: giftIds }, status: 'IN_STOCK' },
          _count: { _all: true }
        })
      : [];
    const inventoryMap = new Map(
      inventoryCounts.map((entry) => [entry.giftId, entry._count._all])
    );

    return new NextResponse(
      JSON.stringify({
        items: gifts.map((gift) => ({
          id: gift.id,
          name: gift.name,
          rarity: gift.rarity,
          description: gift.description,
          imageUrl: gift.imageUrl,
          priceStars: gift.priceStars,
          available: inventoryMap.get(gift.id) ?? 0,
          feeStars: NFT_SHOP_TRANSFER_FEE_STARS
        }))
      }),
      {
        status: 200,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  } catch (error) {
    console.error('Failed to fetch bot NFT shop:', error);
    return new NextResponse(
      JSON.stringify({
        error: 'NFT shop temporarily unavailable',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 503,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured' }, { status: 500 });
  }

  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-nft-shop:post`, {
    limit: 20,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  let payload: { telegramId?: number; giftId?: string };
  try {
    payload = (await req.json()) as { telegramId?: number; giftId?: string };
  } catch {
    return new NextResponse(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  if (!payload.telegramId || !payload.giftId) {
    return new NextResponse(JSON.stringify({ error: 'telegramId and giftId are required' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  const telegramId = BigInt(payload.telegramId);

  try {
    await ensureDatabaseReady();
    const user = await prisma.user.findUnique({ where: { telegramId: telegramId } });
    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'User not found. Ask them to open the mini-app first.' }), {
        status: 404,
        headers: buildRateLimitHeaders(rateResult)
      });
    }

    const result = await createPurchaseOrder({
      userId: user.id,
      giftId: payload.giftId,
      source: 'BOT'
    });

    return new NextResponse(
      JSON.stringify({
        success: true,
        balance: {
          available: result.balance.available,
          reserved: result.balance.reserved,
          bonusAvailable: result.balance.bonusAvailable,
          bonusReserved: result.balance.bonusReserved
        },
        order: {
          id: result.order.id,
          status: result.order.status,
          priceStars: result.order.priceStars,
          feeStars: result.order.feeStars,
          totalStars: result.order.totalStars
        },
        gift: result.gift
          ? {
              id: result.gift.id,
              name: result.gift.name,
              rarity: result.gift.rarity,
              imageUrl: result.gift.imageUrl
            }
          : null,
        feeStars: result.feeStars
      }),
      {
        status: 200,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось купить NFT.';
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }
}
