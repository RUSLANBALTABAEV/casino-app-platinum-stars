import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { syncTelegramUser } from '@/lib/services/user';
import {
  assertInitDataIsFresh,
  ensureTelegramUser,
  getBotToken,
  parseInitData,
  verifyInitData
} from '@/lib/telegram/init-data';

function getInitData(req: NextRequest): string | null {
  return req.headers.get('x-telegram-init-data');
}

async function resolveUser(req: NextRequest): Promise<{ userId: string }> {
  const rawInitData = getInitData(req);
  if (!rawInitData) {
    throw new Error('Missing X-Telegram-Init-Data header');
  }

  const botToken = getBotToken();
  if (!verifyInitData(rawInitData, botToken)) {
    throw new Error('Invalid Telegram signature');
  }

  const initData = parseInitData(rawInitData);
  assertInitDataIsFresh(initData);
  const telegramUser = ensureTelegramUser(initData);
  return syncTelegramUser(telegramUser);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:miniapp-online:post`, {
    limit: 180,
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
    await prisma.onlinePresence.upsert({
      where: { userId: user.userId },
      update: { lastSeenAt: new Date() },
      create: { userId: user.userId, lastSeenAt: new Date() }
    });

    return applyHeaders(NextResponse.json({ success: true }), rateResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось обновить онлайн-статус.';
    const status = message.includes('signature') || message.includes('header') ? 401 : 500;
    return applyHeaders(NextResponse.json({ error: message }, { status }), rateResult);
  }
}

