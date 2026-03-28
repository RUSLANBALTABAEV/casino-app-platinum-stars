import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { ensureDatabaseReady } from '@/lib/db/ensure';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-online:get`, {
    limit: 60,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), rateResult);
  }

  try {
    await ensureDatabaseReady();

    const windowSecondsRaw = req.nextUrl.searchParams.get('windowSeconds');
    const windowSeconds = windowSecondsRaw ? Number.parseInt(windowSecondsRaw, 10) : 90;
    const effectiveWindowSeconds =
      Number.isFinite(windowSeconds) && windowSeconds > 10 && windowSeconds <= 600
        ? windowSeconds
        : 90;

    const since = new Date(Date.now() - effectiveWindowSeconds * 1000);
    const online = await prisma.onlinePresence.count({
      where: { lastSeenAt: { gte: since } }
    });

    return applyHeaders(
      NextResponse.json({ online, windowSeconds: effectiveWindowSeconds }),
      rateResult
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return applyHeaders(NextResponse.json({ error: message }, { status: 500 }), rateResult);
  }
}

