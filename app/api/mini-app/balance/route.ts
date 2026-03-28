// app/api/mini-app/balance/route.ts

import { NextRequest, NextResponse } from "next/server";
import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { syncTelegramUser } from '@/lib/services/user';
import { changeStarBalance, getOrCreateStarBalance } from '@/lib/services/starBalanceService';
import {
  assertInitDataIsFresh,
  getDevTelegramUser,
  ensureTelegramUser,
  getBotToken,
  isDevTelegramBypassEnabled,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

function getInitDataHeader(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest) {
  const rawInitData = getInitDataHeader(req);
  if (!rawInitData) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }

  try {
    const botToken = getBotToken();
    if (!verifyInitData(rawInitData, botToken)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }

  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function GET(request: NextRequest) {
  const rateResult = applyRateLimit(`${getClientIdentifier(request)}:miniapp-balance:get`, {
    limit: 60,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: "Слишком много запросов. Попробуйте позже.",
        },
        { status: 429 }
      ),
      rateResult
    );
  }

  try {
    if (isDemoRequest(request)) {
      const demoBalance = getDemoBalance();
      return applyHeaders(
        NextResponse.json(
          {
            success: true,
            userId: 'demo-user',
            available: demoBalance.available,
            reserved: demoBalance.reserved,
            lifetimeEarn: demoBalance.lifetimeEarn,
            lifetimeSpend: demoBalance.lifetimeSpend,
            bonusAvailable: demoBalance.bonusAvailable,
            bonusReserved: demoBalance.bonusReserved
          },
          { status: 200 }
        ),
        rateResult
      );
    }
    const user = await resolveUser(request);
    const balance = await getOrCreateStarBalance(user.userId);

    return applyHeaders(
      NextResponse.json(
        {
          success: true,
          userId: balance.userId,
          available: balance.available,
          reserved: balance.reserved,
          lifetimeEarn: balance.lifetimeEarn,
          lifetimeSpend: balance.lifetimeSpend,
          bonusAvailable: balance.bonusAvailable,
          bonusReserved: balance.bonusReserved
        },
        { status: 200 }
      ),
      rateResult
    );
  } catch (error: unknown) {
    console.error("Ошибка при получении баланса:", error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера при получении баланса";
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status }
      ),
      rateResult
    );
  }
}

type PostBody = {
  delta: number;
};

export async function POST(request: NextRequest) {
  const rateResult = applyRateLimit(`${getClientIdentifier(request)}:miniapp-balance:post`, {
    limit: 30,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: "Слишком много запросов. Попробуйте позже.",
        },
        { status: 429 }
      ),
      rateResult
    );
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch (error) {
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: "Некорректный JSON в теле запроса",
        },
        { status: 400 }
      ),
      rateResult
    );
  }

  if (typeof body.delta !== "number" || Number.isNaN(body.delta)) {
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: "Поле delta должно быть числом",
        },
        { status: 400 }
      ),
      rateResult
    );
  }

  try {
    if (isDemoRequest(request)) {
      const demoBalance = getDemoBalance();
      return applyHeaders(
        NextResponse.json(
          {
            success: true,
            userId: 'demo-user',
            available: demoBalance.available,
            reserved: demoBalance.reserved,
            lifetimeEarn: demoBalance.lifetimeEarn,
            lifetimeSpend: demoBalance.lifetimeSpend,
            bonusAvailable: demoBalance.bonusAvailable,
            bonusReserved: demoBalance.bonusReserved
          },
          { status: 200 }
        ),
        rateResult
      );
    }
    const user = await resolveUser(request);
    const balance = await changeStarBalance(user.userId, body.delta);

    return applyHeaders(
      NextResponse.json(
        {
          success: true,
          userId: balance.userId,
          available: balance.available,
          reserved: balance.reserved,
          lifetimeEarn: balance.lifetimeEarn,
          lifetimeSpend: balance.lifetimeSpend,
          bonusAvailable: balance.bonusAvailable,
          bonusReserved: balance.bonusReserved
        },
        { status: 200 }
      ),
      rateResult
    );
  } catch (error: unknown) {
    console.error("Ошибка при изменении баланса:", error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера при изменении баланса";
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    
    return applyHeaders(
      NextResponse.json(
        {
          success: false,
          error: message,
        },
        { status }
      ),
      rateResult
    );
  }
}
