import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { registerReferral } from '@/lib/services/referral';
import type { TelegramUser } from '@/lib/telegram/init-data';
import { syncTelegramUser } from '@/lib/services/user';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot:referral`, {
    limit: 10,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    const body = (await req.json()) as {
      telegramId?: number;
      code?: string;
      user?: TelegramUser;
    };

    if (!body.telegramId || !body.code) {
      return applyHeaders(
        NextResponse.json({ error: 'Не указаны telegramId или код' }, { status: 400 }),
        rateResult
      );
    }

    // Гарантируем, что пользователь существует в БД (новый пользователь мог прийти по /start)
    const telegramId = BigInt(body.telegramId);
    const existing = await prisma.user.findUnique({ where: { telegramId } });
    const ensuredUserId = existing
      ? existing.id
      : body.user
        ? (await syncTelegramUser(body.user)).userId
        : (
          await prisma.user.create({
            data: {
              telegramId
            }
          })
        ).id;

    // Применяем реферальный код
    await registerReferral(ensuredUserId, body.code);

    return applyHeaders(
      NextResponse.json({ success: true }),
      rateResult
    );
  } catch (error) {
    console.error('Bot referral error:', error);
    const message = error instanceof Error ? error.message : 'Не удалось применить реферальный код';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 400 }),
      rateResult
    );
  }
}


