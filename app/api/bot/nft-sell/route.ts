import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyRateLimit, buildRateLimitHeaders } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Database is not configured' }, { status: 500 });
  }

  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-nft-sell`, {
    limit: 20,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  let payload: { telegramId?: number; userGiftId?: string };
  try {
    payload = (await req.json()) as { telegramId?: number; userGiftId?: string };
  } catch {
    return new NextResponse(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  if (!payload.telegramId || !payload.userGiftId) {
    return new NextResponse(JSON.stringify({ error: 'telegramId and userGiftId are required' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }

  try {
    await ensureDatabaseReady();
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(payload.telegramId) } });
    if (!user) {
      return new NextResponse(JSON.stringify({ error: 'User not found. Ask them to open the mini-app first.' }), {
        status: 404,
        headers: buildRateLimitHeaders(rateResult)
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const ownedGift = await tx.userNftGift.findFirst({
        where: { id: payload.userGiftId, userId: user.id, status: 'OWNED' },
        include: { gift: true }
      });

      if (!ownedGift) {
        throw new Error('NFT не найден или уже использован.');
      }

      const priceStars = ownedGift.gift.priceStars ?? 0;
      if (priceStars <= 0) {
        throw new Error('Этот NFT нельзя продать за звёзды.');
      }

      await tx.userNftGift.update({
        where: { id: ownedGift.id },
        data: {
          status: 'SOLD',
          metadata: {
            ...(ownedGift.metadata as Record<string, unknown> | null),
            soldAt: new Date().toISOString(),
            soldPrice: priceStars
          }
        }
      });

      const balance = await tx.starBalance.upsert({
        where: { userId: user.id },
        update: {
          available: { increment: priceStars },
          lifetimeEarn: { increment: priceStars }
        },
        create: {
          userId: user.id,
          available: priceStars,
          reserved: 0,
          lifetimeEarn: priceStars,
          lifetimeSpend: 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0
        }
      });

      await tx.transaction.create({
        data: {
          userId: user.id,
          type: 'DEPOSIT',
          amount: priceStars,
          currency: 'STARS',
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'NFT_TOPUP',
            userGiftId: ownedGift.id,
            giftId: ownedGift.giftId,
            giftName: ownedGift.gift.name
          }
        }
      });

      return { balance, gift: ownedGift };
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
        gift: {
          id: result.gift.id,
          name: result.gift.gift.name,
          rarity: result.gift.gift.rarity,
          priceStars: result.gift.gift.priceStars
        }
      }),
      {
        status: 200,
        headers: buildRateLimitHeaders(rateResult)
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось продать NFT.';
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult)
    });
  }
}
