/**
 * POST /api/bot/nft-gift
 *
 * Принимает уведомление от Python-бота о входящем NFT-подарке.
 * Бот вызывает этот endpoint, когда пользователь передаёт (gift_transfer)
 * NFT боту в Telegram.
 *
 * Payload:
 * {
 *   senderTelegramId: number,   // кто прислал подарок
 *   telegramGiftId: string,     // идентификатор подарка в Telegram
 *   giftName?: string,          // название (опционально, для отладки)
 *   rawPayload?: unknown        // исходный апдейт (опционально)
 * }
 */

import { NextRequest, NextResponse } from 'next/server';

import { applyRateLimit, buildRateLimitHeaders } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { ensureDatabaseReady } from '@/lib/db/ensure';
import { processIncomingNftGift } from '@/lib/services/nft-gift-integration';

export const runtime = 'nodejs';

/** Проверяем, что запрос пришёл от нашего бота (по общему секрету) */
function isBotAuthorized(req: NextRequest): boolean {
  const secret = process.env.BOT_INTERNAL_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-bot-secret') ?? '';
  return header === secret;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = applyRateLimit(`${getClientIdentifier(req)}:bot-nft-gift`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateResult.success) {
    return new NextResponse(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: buildRateLimitHeaders(rateResult),
    });
  }

  if (!isBotAuthorized(req)) {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: buildRateLimitHeaders(rateResult),
    });
  }

  let body: {
    senderTelegramId?: number;
    telegramGiftId?: string;
    giftName?: string;
    rawPayload?: unknown;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new NextResponse(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: buildRateLimitHeaders(rateResult),
    });
  }

  if (!body.senderTelegramId || !body.telegramGiftId) {
    return new NextResponse(
      JSON.stringify({ error: 'senderTelegramId и telegramGiftId обязательны' }),
      { status: 422, headers: buildRateLimitHeaders(rateResult) },
    );
  }

  try {
    await ensureDatabaseReady();

    const result = await processIncomingNftGift({
      senderTelegramId: body.senderTelegramId,
      telegramGiftId: body.telegramGiftId,
      giftName: body.giftName,
      rawPayload: body.rawPayload,
    });

    return new NextResponse(JSON.stringify(result), {
      status: result.success ? 200 : 422,
      headers: buildRateLimitHeaders(rateResult),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 500,
      headers: buildRateLimitHeaders(rateResult),
    });
  }
}
