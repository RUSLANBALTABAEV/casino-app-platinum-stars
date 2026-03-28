import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { redeemPromoForUser } from '@/lib/services/promo';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';

interface PromoRequestBody {
  telegramId?: number;
  code?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Skip during build time - complete bypass
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
  }

  try {
    const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-promo`, {
      limit: 5,
      windowMs: 60_000
    });
    if (!rateResult.success) {
      return applyHeaders(
        NextResponse.json({ error: 'Too many promo attempts. Try again later.' }, { status: 429 }),
        rateResult
      );
    }

    const body: PromoRequestBody = await req.json();
    const { telegramId, code } = body;

    if (!telegramId || !code) {
      return applyHeaders(
        NextResponse.json({ error: 'telegramId and code are required' }, { status: 400 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    const user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) }
    });

    if (!user) {
      return applyHeaders(
        NextResponse.json(
          { error: 'User not found. Ask them to open the mini-app first.' },
          { status: 404 }
        ),
        rateResult
      );
    }

    try {
      const result = await redeemPromoForUser(user.id, code);
      return applyHeaders(
        NextResponse.json({
          success: true,
          reward: result.reward,
          remainingGlobalUses: result.remainingGlobalUses
        }),
        rateResult
      );
    } catch (error) {
      return applyHeaders(
        NextResponse.json(
          { error: error instanceof Error ? error.message : 'Failed to redeem promo' },
          { status: 400 }
        ),
        rateResult
      );
    }
  } catch (error) {
    console.error('Bot promo error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}