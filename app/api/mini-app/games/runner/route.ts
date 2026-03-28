import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
import { getGameAvailability } from '@/lib/services/game-settings';
import {
  finishRunnerAttempt,
  getRunnerConfig,
  getRunnerHistory,
  getRunnerStatus,
  startRunnerAttempt
} from '@/lib/services/runner-game';
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

type RunnerActionBody =
  | {
      action: 'start';
    }
  | {
      action: 'finish';
      attemptId?: string;
      score?: number;
      distance?: number;
    };

function readInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest) {
  const raw = readInitData(req);
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
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-runner:get`, {
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
      const config = await getRunnerConfig();
      return applyHeaders(
        NextResponse.json({
          config,
          status: {
            freeAttemptsRemaining: 1,
            cooldownSeconds: 0
          },
          history: [],
          balance: getDemoBalance()
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);
    const [config, status, history, balance] = await Promise.all([
      getRunnerConfig(),
      getRunnerStatus(user.userId),
      process.env.DATABASE_URL ? getRunnerHistory(user.userId, 12) : Promise.resolve([]),
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

    return applyHeaders(
      NextResponse.json({
        config,
        status,
        history,
        balance:
          balance ?? {
            available: user.balance?.available ?? 0,
            reserved: user.balance?.reserved ?? 0,
            bonusAvailable: 0,
            bonusReserved: 0
          }
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось загрузить данные раннера.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-runner:post`, {
    limit: 10,
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
      NextResponse.json({ error: 'Операции раннера недоступны без базы данных.' }, { status: 503 }),
      rateResult
    );
  }

  let body: RunnerActionBody;
  try {
    body = (await req.json()) as RunnerActionBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса.' }, { status: 400 }),
      rateResult
    );
  }

  if (!body?.action || (body.action !== 'start' && body.action !== 'finish')) {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите корректное действие (start или finish).' }, { status: 422 }),
      rateResult
    );
  }

  try {
    const availability = await getGameAvailability('RUNNER');
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
        rateResult
      );
    }

    if (isDemoRequest(req)) {
      if (body.action === 'start') {
        return applyHeaders(
          NextResponse.json({
            result: {
              attemptId: 'demo-runner',
              cost: 0,
              freeAttempt: true,
              balance: getDemoBalance(),
              status: {
                freeAttemptsRemaining: 1,
                cooldownSecondsRemaining: 0,
                attemptCost: 0
              }
            }
          }),
          rateResult
        );
      }

      return applyHeaders(
        NextResponse.json({
          result: {
            reward: 25,
            thresholdsUnlocked: [],
            balance: getDemoBalance(),
            status: {
              freeAttemptsRemaining: 0,
              cooldownSecondsRemaining: 0,
              attemptCost: 0
            }
          },
          history: []
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);

    if (body.action === 'start') {
      const result = await startRunnerAttempt({ userId: user.userId });
      return applyHeaders(NextResponse.json({ result }), rateResult);
    }

    if (!body.attemptId) {
      return applyHeaders(
        NextResponse.json({ error: 'Укажите идентификатор попытки.' }, { status: 422 }),
        rateResult
      );
    }

    const finishResult = await finishRunnerAttempt({
      userId: user.userId,
      attemptId: body.attemptId,
      score: body.score ?? 0,
      distance: body.distance ?? 0
    });

    const history = await getRunnerHistory(user.userId, 12);

    return applyHeaders(
      NextResponse.json({
        result: finishResult,
        history
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось выполнить операцию раннера.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('подождите') || message.includes('Недостаточно') ? 400 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}
