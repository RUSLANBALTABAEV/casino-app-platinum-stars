import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { spinRouletteForUser, getRouletteConfig, getRouletteHistory } from '@/lib/services/roulette-game';
import { syncTelegramUser } from '@/lib/services/user';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { getGameAvailability } from '@/lib/services/game-settings';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

interface SpinBody {
  variant?: 'wheel' | 'slots';
  stake?: number;
}

function takeInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveTelegramUser(req: NextRequest) {
  const raw = takeInitData(req);
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const botToken = getBotToken();
    if (!verifyInitData(raw, botToken)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }
  const parsed = parseInitData(raw);
  assertInitDataIsFresh(parsed);
  const telegramUser = ensureTelegramUser(parsed);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-roulette:get`, {
    limit: 45,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const availability = await getGameAvailability('ROULETTE');
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
        rateResult
      );
    }

    if (isDemoRequest(req)) {
      const config = await getRouletteConfig();
      return applyHeaders(
        NextResponse.json({
          config,
          history: [],
          balance: getDemoBalance()
        }),
        rateResult
      );
    }
    const user = await resolveTelegramUser(req);
    const [config, history, balance] = await Promise.all([
      getRouletteConfig(),
      process.env.DATABASE_URL ? getRouletteHistory(user.userId, 20) : Promise.resolve([]),
      process.env.DATABASE_URL
        ? (async () => {
            let balanceRecord = await prisma.starBalance.findUnique({
              where: { userId: user.userId },
              select: {
                available: true,
                reserved: true,
                bonusAvailable: true,
                bonusReserved: true
              }
            });
            
            // Если баланса нет - создаем его
            if (!balanceRecord) {
              const { upsertStarBalanceByUserId } = await import('@/lib/db/star-balance');
              await upsertStarBalanceByUserId(user.userId, 0);
              balanceRecord = await prisma.starBalance.findUnique({
                where: { userId: user.userId },
                select: {
                  available: true,
                  reserved: true
                }
              });
            }
            
            return balanceRecord;
          })()
        : Promise.resolve(null)
    ]);

    const fallbackBalance = balance ?? {
      available: user.balance?.available ?? 0,
      reserved: user.balance?.reserved ?? 0,
      bonusAvailable: 0,
      bonusReserved: 0
    };

    return applyHeaders(
      NextResponse.json({
        config,
        history,
        balance: fallbackBalance
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось получить данные рулетки.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-roulette:post`, {
    limit: 10,
    windowMs: 30_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  if (!process.env.DATABASE_URL && !isDemoRequest(req)) {
    return applyHeaders(
      NextResponse.json({ error: 'Операции рулетки недоступны без базы данных.' }, { status: 503 }),
      rateResult
    );
  }

  let body: SpinBody;
  try {
    body = (await req.json()) as SpinBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  try {
    if (isDemoRequest(req)) {
      const config = await getRouletteConfig();
      const sectors = config.sectors;
      const prize = sectors[Math.floor(Math.random() * sectors.length)] ?? sectors[0];
      return applyHeaders(
        NextResponse.json({
          success: true,
          result: {
            prize,
            prizeIndex: 0,
            balance: getDemoBalance(),
            historyEntry: {
              id: 'demo-spin',
              prizeName: prize.name,
              rewardType: prize.rewardType,
              rewardValue: prize.value,
              cost: config.spinCost,
              variant: body.variant ?? 'wheel',
              createdAt: new Date().toISOString()
            }
          },
          history: []
        }),
        rateResult
      );
    }
    const user = await resolveTelegramUser(req);
    const result = await spinRouletteForUser({
      userId: user.userId,
      variant: body.variant,
      stake: body.stake
    });

    const history = await getRouletteHistory(user.userId, 20);

    return applyHeaders(
      NextResponse.json({
        success: true,
        result,
        history
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось выполнить спин.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('Недостаточно') ? 400 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}



