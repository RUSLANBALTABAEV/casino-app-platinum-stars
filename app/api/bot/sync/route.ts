import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { recordFallbackUser } from '@/lib/services/fallback-store';
import { syncTelegramUser } from '@/lib/services/user';
import type { TelegramUser } from '@/lib/telegram/init-data';
import { ensureDatabaseReady } from '@/lib/db/ensure';

interface SyncRequestBody {
  user?: TelegramUser;
  from?: TelegramUser;
  telegramUser?: TelegramUser;
  telegram_id?: number | string;
  telegramId?: number | string;
  id?: number | string;
}

type TimedOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'error'; error: unknown }
  | { kind: 'timeout' };

async function parseBody(req: NextRequest): Promise<SyncRequestBody> {
  const raw = await req.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as SyncRequestBody;
  } catch {
    const params = new URLSearchParams(raw);
    const body: SyncRequestBody = {};
    const userRaw = params.get('user');
    if (userRaw) {
      try {
        body.user = JSON.parse(userRaw) as TelegramUser;
      } catch {
        // ignore malformed user payload
      }
    }
    const telegramId = params.get('telegramId') ?? params.get('telegram_id') ?? params.get('id');
    if (telegramId) {
      body.telegramId = telegramId;
    }
    return body;
  }
}

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

function toNumericId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveTelegramUser(body: SyncRequestBody): TelegramUser | null {
  const candidate =
    body.user ??
    body.telegramUser ??
    body.from ??
    (body as unknown as { telegram_user?: TelegramUser }).telegram_user ??
    null;

  if (candidate && typeof candidate === 'object' && candidate.id !== undefined) {
    const numericId = toNumericId(candidate.id);
    if (numericId !== null) {
      return {
        ...candidate,
        id: numericId
      };
    }
  }

  const fallbackId = toNumericId(body.telegramId ?? body.telegram_id ?? body.id);
  if (fallbackId !== null) {
    return {
      id: fallbackId
    };
  }

  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Skip during build time - complete bypass
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      userId: 'build-time-user',
      balance: { available: 0, reserved: 0 },
      profile: {
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User'
      },
      source: 'fallback'
    }, { status: 200 });
  }

  try {
    const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-sync`, {
      limit: 30,
      windowMs: 60_000
    });
    if (!rateResult.success) {
      return applyHeaders(
        NextResponse.json({ error: 'Too many sync attempts. Slow down.' }, { status: 429 }),
        rateResult
      );
    }

    const body: SyncRequestBody = await parseBody(req);
    const user = resolveTelegramUser(body);

    if (!user) {
      return applyHeaders(
        NextResponse.json({ error: 'User data is required' }, { status: 400 }),
        rateResult
      );
    }

    try {
      await ensureDatabaseReady();
    } catch (readyError) {
      console.error('Database not ready for bot sync, using fallback.', readyError);
      const fallback = recordFallbackUser(user);
      return applyHeaders(
        NextResponse.json({
          userId: fallback.userId,
          balance: fallback.balance,
          profile: fallback.profile,
          source: 'fallback'
        }),
        rateResult
      );
    }

    try {
      const result = await runWithTimeout(
        () => syncTelegramUser(user),
        30_000
      );

      return applyHeaders(
        NextResponse.json(result),
        rateResult
      );
    } catch (syncError) {
      console.error('Failed to sync user in database. Falling back to in-memory store.', syncError);
      const fallback = recordFallbackUser(user);
      return applyHeaders(
        NextResponse.json({
          userId: fallback.userId,
          balance: fallback.balance,
          profile: fallback.profile,
          source: 'fallback'
        }),
        rateResult
      );
    }
  } catch (error) {
    console.error('Bot sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
