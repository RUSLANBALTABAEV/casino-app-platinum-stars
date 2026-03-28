import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { getLotteryConfig, getLotteryState, joinLotteryPool } from '@/lib/services/lottery-game';
import { getGameAvailability } from '@/lib/services/game-settings';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

type LotteryActionBody = {
  action?: 'join';
  poolId?: string;
};

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest) {
  const raw = getInitData(req);
  if (!raw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }
  try {
    const token = getBotToken();
    if (!verifyInitData(raw, token)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }
  const initData = parseInitData(raw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-lottery:get`, {
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
    if (isDemoRequest(req)) {
      const config = await getLotteryConfig();
      return applyHeaders(
        NextResponse.json({
          config,
          pools: config.pools.map((pool) => ({
            ...pool,
            entriesCount: 0,
            entriesRemaining: pool.participantLimit,
            userEntries: 0
          })),
          balance: getDemoBalance(),
          userResults: [],
          recentResults: []
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);
    const state = await getLotteryState(user.userId);

    const balance = process.env.DATABASE_URL
      ? state.balance
      : {
          available: user.balance?.available ?? 0,
          reserved: user.balance?.reserved ?? 0,
          bonusAvailable: 0,
          bonusReserved: 0
        };

    return applyHeaders(
      NextResponse.json({
        config: state.config,
        pools: state.pools,
        balance,
        userResults: state.userResults,
        recentResults: state.recentResults
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось загрузить данные лотереи.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-lottery:post`, {
    limit: 8,
    windowMs: 20_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  if (!process.env.DATABASE_URL && !isDemoRequest(req)) {
    return applyHeaders(
      NextResponse.json({ error: 'Операции лотереи недоступны без базы данных.' }, { status: 503 }),
      rateResult
    );
  }

  let body: LotteryActionBody;
  try {
    body = (await req.json()) as LotteryActionBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  if (body.action !== 'join' || !body.poolId) {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите корректное действие и идентификатор пула.' }, { status: 422 }),
      rateResult
    );
  }

  const availability = await getGameAvailability('LOTTERY');
  if (!availability.enabled) {
    return applyHeaders(
      NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
      rateResult
    );
  }

  try {
    if (isDemoRequest(req)) {
      return applyHeaders(
        NextResponse.json({
          result: { joined: true },
          state: {
            pools: [],
            balance: getDemoBalance(),
            userResults: [],
            recentResults: []
          }
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);
    const result = await joinLotteryPool({ userId: user.userId, poolId: body.poolId });
    const state = await getLotteryState(user.userId);

    // Убеждаемся, что баланс существует
    let balance = state.balance;
    if (!balance) {
      let balanceRecord = await prisma.starBalance.findUnique({
        where: { userId: user.userId },
        select: { available: true, reserved: true, bonusAvailable: true, bonusReserved: true }
      });
      
      if (!balanceRecord) {
        const { upsertStarBalanceByUserId } = await import('@/lib/db/star-balance');
        await upsertStarBalanceByUserId(user.userId, 0);
        balanceRecord = await prisma.starBalance.findUnique({
          where: { userId: user.userId },
          select: { available: true, reserved: true, bonusAvailable: true, bonusReserved: true }
        });
      }
      
      balance =
        balanceRecord ?? {
          available: user.balance?.available ?? 0,
          reserved: user.balance?.reserved ?? 0,
          bonusAvailable: 0,
          bonusReserved: 0
        };
    }

    return applyHeaders(
      NextResponse.json({
        result,
        state: {
          pools: state.pools,
          balance,
          userResults: state.userResults,
          recentResults: state.recentResults
        }
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось присоединиться к лотерее.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('Недостаточно') ? 400 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}



