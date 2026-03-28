import { NextRequest, NextResponse } from 'next/server';

import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { prisma } from '@/lib/prisma';
import { generateReferralLink, getReferralStats } from '@/lib/services/referral';
import { ensureDatabaseReady } from '@/lib/db/ensure';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot:referral-info`, {
    limit: 30,
    windowMs: 60_000
  });
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много запросов.' }, { status: 429 }),
      rateResult
    );
  }

  try {
    await ensureDatabaseReady();

    const telegramIdParam = req.nextUrl.searchParams.get('telegramId');
    if (!telegramIdParam) {
      return applyHeaders(
        NextResponse.json({ error: 'telegramId обязателен' }, { status: 400 }),
        rateResult
      );
    }

    const telegramId = BigInt(telegramIdParam);

    // Находим пользователя
    const user = await prisma.user.findUnique({
      where: { telegramId }
    });

    if (!user) {
      return applyHeaders(
        NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 }),
        rateResult
      );
    }

    // Получаем статистику рефералов
    const stats = await getReferralStats(user.id);

    // Генерируем ссылку
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || 'platinumstarsgamebot';
    const referralLink = generateReferralLink(botUsername, stats.referralCode);

    return applyHeaders(
      NextResponse.json({
        referralCode: stats.referralCode,
        referralLink,
        invited: stats.invited,
        completed: stats.completed,
        pending: stats.pending,
        rewardPerFriend: stats.rewardPerFriend
      }),
      rateResult
    );
  } catch (error) {
    console.error('Bot referral info error:', error);
    const message = error instanceof Error ? error.message : 'Не удалось получить информацию о рефералах';
    return applyHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
      rateResult
    );
  }
}




