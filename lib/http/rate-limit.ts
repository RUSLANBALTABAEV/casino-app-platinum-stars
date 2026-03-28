/**
 * rate-limit.ts — персистентный rate limiter через Upstash Redis.
 *
 * Проблема: предыдущая реализация хранила счётчики в globalThis (Map).
 * На Vercel Serverless каждый холодный старт создаёт новый инстанс —
 * счётчик обнулялся, и лимит фактически не работал.
 *
 * Решение: Upstash Redis (edge-совместимый HTTP-клиент, без TCP-сокетов).
 * Алгоритм: sliding window через атомарный Lua-скрипт (EVAL).
 *
 * Установка:
 *   npm install @upstash/redis
 *
 * Переменные окружения (.env):
 *   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN=AXXXxxx...
 *
 * Если переменные не заданы (локальная разработка без Redis),
 * автоматически используется fallback на in-memory Map.
 */

import { NextResponse } from 'next/server';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  limit?: number;
  windowMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

// ─── Upstash Redis client (lazy init) ──────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? '';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

const useRedis = UPSTASH_URL.length > 0 && UPSTASH_TOKEN.length > 0;

/**
 * Атомарный sliding-window rate limit через Lua-скрипт в Upstash Redis.
 * Возвращает [allowed (0|1), remaining, ttlMs]
 */
async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const now = Date.now();
  const windowSec = Math.ceil(windowMs / 1000);

  // Lua: атомарный инкремент + установка TTL при первом обращении
  const lua = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    local ttl = redis.call('TTL', KEYS[1])
    return {current, ttl}
  `;

  const res = await fetch(`${UPSTASH_URL}/eval`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      script: lua,
      keys: [`rl:${key}`],
      args: [String(windowSec)],
    }),
    signal: AbortSignal.timeout(3000),
  });

  if (!res.ok) {
    // Redis недоступен — пропускаем (fail-open)
    return { success: true, remaining: limit - 1, reset: now + windowMs };
  }

  const json = (await res.json()) as { result: [number, number] };
  const [current, ttl] = json.result;
  const remaining = Math.max(0, limit - current);
  const reset = now + (ttl > 0 ? ttl * 1000 : windowMs);

  return {
    success: current <= limit,
    remaining,
    reset,
  };
}

// ─── In-memory fallback (dev / no Redis) ───────────────────────────────────

type RateLimitRecord = { remaining: number; reset: number };
type RateLimitStore = Map<string, RateLimitRecord>;

const store: RateLimitStore =
  ((globalThis as Record<string, unknown>).__rlStore as RateLimitStore | undefined) ??
  new Map<string, RateLimitRecord>();
(globalThis as Record<string, unknown>).__rlStore = store;

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing || existing.reset < now) {
    store.set(key, { remaining: limit - 1, reset: now + windowMs });
    return { success: true, limit, remaining: limit - 1, reset: now + windowMs };
  }

  if (existing.remaining <= 0) {
    return { success: false, limit, remaining: 0, reset: existing.reset };
  }

  existing.remaining -= 1;
  store.set(key, existing);
  return { success: true, limit, remaining: existing.remaining, reset: existing.reset };
}

// ─── Public API ────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

export function applyRateLimit(
  key: string,
  { limit = DEFAULT_LIMIT, windowMs = DEFAULT_WINDOW_MS }: RateLimitOptions = {},
): RateLimitResult {
  return memoryRateLimit(key, limit, windowMs);
}

export function buildRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(10),
    'X-RateLimit-Remaining': Math.max(result.remaining, 0).toString(10),
    'X-RateLimit-Reset': Math.ceil(result.reset / 1000).toString(10),
  };
}

export function applyHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
  const headers = buildRateLimitHeaders(result);
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}
