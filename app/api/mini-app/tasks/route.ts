import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { submitTaskCompletion, getTasksForUser } from '@/lib/services/tasks';
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

interface CompleteTaskBody {
  taskId?: string;
  proofUrl?: string | null;
}

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-tasks:get`, {
    limit: 50,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const user = await resolveUser(req);
    const tasks = await getTasksForUser(user.userId);
    return applyHeaders(NextResponse.json({ tasks }), rateResult);
  } catch (error: unknown) {
    let message = 'Не удалось получить задания';
    if (error instanceof Error) {
      message = error.message;
    }
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-tasks:post`, {
    limit: 10,
    windowMs: 5 * 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Попробуйте позже.' }, { status: 429 }),
      rateResult
    );
  }

  let body: CompleteTaskBody;
  try {
    body = (await req.json()) as CompleteTaskBody;
  } catch {
    return applyHeaders(
      NextResponse.json({ error: 'Некорректный формат запроса' }, { status: 400 }),
      rateResult
    );
  }

  if (!body.taskId) {
    return applyHeaders(
      NextResponse.json({ error: 'Укажите идентификатор задания' }, { status: 422 }),
      rateResult
    );
  }

  try {
    const user = await resolveUser(req);
    await submitTaskCompletion({
      userId: user.userId,
      taskId: body.taskId,
      proofUrl: body.proofUrl
    });

    return applyHeaders(NextResponse.json({ success: true }), rateResult);
  } catch (error: unknown) {
    let message = 'Не удалось отправить выполнение';
    if (error instanceof Error) {
      message = error.message;
    }
    return applyHeaders(NextResponse.json({ error: message }, { status: 400 }), rateResult);
  }
}
