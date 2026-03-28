import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { getCaseConfig, getCaseHistory, openCaseForUser } from '@/lib/services/case-game';
import { prisma } from '@/lib/prisma';
import { getDemoBalance, isDemoRequest } from '@/lib/demo-mode';
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

interface OpenCaseBody {
  caseId?: string;
}

function getInitDataHeader(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest) {
  const initDataRaw = getInitDataHeader(req);
  if (!initDataRaw) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw new Error('Missing X-Telegram-Init-Data header');
  }

  try {
    const token = getBotToken();
    if (!verifyInitData(initDataRaw, token)) {
      throw new Error('Invalid Telegram signature');
    }
  } catch (error) {
    if (isDevTelegramBypassEnabled()) {
      return syncTelegramUser(getDevTelegramUser());
    }
    throw error;
  }

  const initData = parseInitData(initDataRaw);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-case:get`, {
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
      const config = await getCaseConfig();
      return applyHeaders(
        NextResponse.json({
          config,
          history: [],
          balance: getDemoBalance()
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);

    const [config, history, balance] = await Promise.all([
      getCaseConfig(),
      process.env.DATABASE_URL ? getCaseHistory(user.userId, 20) : Promise.resolve([]),
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
    let message = 'Не удалось загрузить данные кейсов.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(`${getClientIdentifier(req)}:miniapp-case:post`, {
    limit: 12,
    windowMs: 60_000
  });

  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  if (!process.env.DATABASE_URL && !isDemoRequest(req)) {
    return applyHeaders(
      NextResponse.json({ error: 'Операции с кейсами недоступны без базы данных.' }, { status: 503 }),
      rateResult
    );
  }

  let body: OpenCaseBody;
  try {
    body = (await req.json()) as OpenCaseBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса' }, { status: 400 }),
      rateResult
    );
  }

  if (!body.caseId || typeof body.caseId !== 'string') {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите идентификатор кейса.' }, { status: 422 }),
      rateResult
    );
  }

  try {
    const availability = await getGameAvailability('CASE');
    if (!availability.enabled) {
      return applyHeaders(
        NextResponse.json({ error: availability.message ?? 'Игра временно недоступна.' }, { status: 403 }),
        rateResult
      );
    }

    if (isDemoRequest(req)) {
      const config = await getCaseConfig();
      const caseDefinition = config.cases.find((entry) => entry.id === body.caseId);
      if (!caseDefinition) {
        return applyHeaders(
          NextResponse.json({ error: 'Кейс недоступен.' }, { status: 404 }),
          rateResult
        );
      }
      const reward =
        caseDefinition.items[Math.floor(Math.random() * caseDefinition.items.length)] ??
        caseDefinition.items[0];
      return applyHeaders(
        NextResponse.json({
          success: true,
          result: {
            case: caseDefinition,
            reward,
            balance: getDemoBalance()
          },
          history: []
        }),
        rateResult
      );
    }
    const user = await resolveUser(req);
    const result = await openCaseForUser({
      userId: user.userId,
      caseId: body.caseId
    });

    const history = await getCaseHistory(user.userId, 20);

    return applyHeaders(
      NextResponse.json({
        success: true,
        result,
        history
      }),
      rateResult
    );
  } catch (error: unknown) {
    let message = 'Не удалось открыть кейс.';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('недостаточно') ? 400 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}
