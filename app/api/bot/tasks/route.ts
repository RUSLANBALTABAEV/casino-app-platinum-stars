import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { listFallbackTasks } from '@/lib/services/fallback-store';
import { ensureDatabaseReady } from '@/lib/db/ensure';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Skip during build time - complete bypass
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ tasks: [], fallback: true }, { status: 200 });
  }

  try {
    const rateResult = applyRateLimit(`${getClientIdentifier(request)}:bot-tasks`, {
      limit: 30,
      windowMs: 60_000
    });
    if (!rateResult.success) {
      return applyHeaders(
        NextResponse.json({ error: 'Too many requests' }, { status: 429 }),
        rateResult
      );
    }

    await ensureDatabaseReady();

    const tasks = await prisma.task.findMany({
      where: { isActive: true },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        reward: true,
        sponsorLink: true,
        requiredProof: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    return applyHeaders(
      NextResponse.json({ tasks }),
      rateResult
    );
  } catch (error) {
    console.error('Failed to fetch tasks:', error);
    return NextResponse.json({ error: 'Internal server error', tasks: listFallbackTasks() }, { status: 500 });
  }
}