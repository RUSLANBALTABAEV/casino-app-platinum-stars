import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyHeaders, applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import { syncTelegramUser } from '@/lib/services/user';
import { logSecurityEvent } from '@/lib/services/security';
import {
  assertInitDataIsFresh, ensureTelegramUser, getBotToken,
  getDevTelegramUser, isDevTelegramBypassEnabled,
  parseInitData, verifyInitData
} from '@/lib/telegram/init-data';

async function resolveUser(req: NextRequest) {
  const raw = req.headers.get('x-telegram-init-data');
  if (!raw) {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Missing auth header');
  }
  try {
    if (!verifyInitData(raw, getBotToken())) throw new Error('Invalid signature');
  } catch {
    if (isDevTelegramBypassEnabled()) return syncTelegramUser(getDevTelegramUser());
    throw new Error('Invalid auth');
  }
  const parsed = parseInitData(raw);
  assertInitDataIsFresh(parsed);
  return syncTelegramUser(ensureTelegramUser(parsed));
}

// POST /api/mini-app/nfts/withdraw — создать заявку на вывод NFT
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(
    `${getClientIdentifier(req)}:nft-withdraw`,
    { limit: 5, windowMs: 60_000 }
  );
  if (!rateResult.success) {
    return applyHeaders(
      NextResponse.json({ error: 'Слишком много попыток. Подождите.' }, { status: 429 }),
      rateResult
    );
  }

  let body: { userGiftId: string };
  try { body = await req.json(); } catch {
    return applyHeaders(NextResponse.json({ error: 'Неверный запрос' }, { status: 400 }), rateResult);
  }

  if (!body.userGiftId) {
    return applyHeaders(NextResponse.json({ error: 'Укажите ID подарка' }, { status: 422 }), rateResult);
  }

  try {
    const user = await resolveUser(req);

    // Check ownership
    const userGift = await prisma.userNftGift.findFirst({
      where: { id: body.userGiftId, userId: user.userId, status: 'OWNED' },
      include: { gift: true }
    });
    if (!userGift) {
      return applyHeaders(
        NextResponse.json({ error: 'NFT не найден или уже использован' }, { status: 404 }),
        rateResult
      );
    }

    // Check if telegramGiftId exists (needed for transferGift)
    const telegramGiftId = userGift.gift.telegramGiftId;
    if (!telegramGiftId) {
      return applyHeaders(
        NextResponse.json({
          error: 'Этот NFT нельзя вывести напрямую — обратитесь в поддержку'
        }, { status: 400 }),
        rateResult
      );
    }

    // Check if already has pending withdrawal
    const existing = await prisma.withdrawal.findFirst({
      where: {
        userId: user.userId,
        type: 'NFT_GIFT',
        status: { in: ['PENDING', 'APPROVED'] },
        meta: { path: ['userGiftId'], equals: body.userGiftId }
      }
    });
    if (existing) {
      return applyHeaders(
        NextResponse.json({ error: 'Заявка на этот NFT уже создана' }, { status: 409 }),
        rateResult
      );
    }

    // Mark as PENDING_SEND
    await prisma.userNftGift.update({
      where: { id: body.userGiftId },
      data: { status: 'PENDING_SEND' }
    });

    // Create withdrawal record
    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId: user.userId,
        amount: 0,
        currency: 'STARS',
        destination: String(user.telegramId),
        type: 'NFT_GIFT',
        status: 'PENDING',
        meta: {
          userGiftId: body.userGiftId,
          giftId: userGift.giftId,
          telegramGiftId,
          giftName: userGift.gift.name,
          rarity: userGift.gift.rarity,
        }
      }
    });

    // Notify bot to process transfer
    const botNotifyUrl = process.env.BOT_NOTIFY_URL;
    const internalSecret = process.env.BACKEND_INTERNAL_SECRET;
    if (botNotifyUrl && internalSecret) {
      fetch(`${botNotifyUrl}/api/bot/nft-transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret
        },
        body: JSON.stringify({
          withdrawalId: withdrawal.id,
          telegramId: Number(user.telegramId),
          telegramGiftId,
          giftName: userGift.gift.name,
        })
      }).catch(() => {});
    }

    await logSecurityEvent({
      type: 'NFT_WITHDRAW_REQUESTED',
      severity: 'INFO',
      message: `NFT вывод запрошен: ${userGift.gift.name}`,
      userId: user.userId,
      metadata: { withdrawalId: withdrawal.id, giftName: userGift.gift.name }
    });

    return applyHeaders(
      NextResponse.json({
        success: true,
        withdrawalId: withdrawal.id,
        message: 'Заявка создана. NFT будет отправлен в течение нескольких минут.'
      }),
      rateResult
    );
  } catch (err) {
    console.error('[NFT-WITHDRAW]', err);
    const msg = err instanceof Error ? err.message : 'Ошибка сервера';
    return applyHeaders(NextResponse.json({ error: msg }, { status: 500 }), rateResult);
  }
}

// GET — get withdrawal status for a userGiftId
export async function GET(req: NextRequest): Promise<NextResponse> {
  const rateResult = await applyRateLimit(
    `${getClientIdentifier(req)}:nft-withdraw-get`,
    { limit: 20, windowMs: 60_000 }
  );
  if (!rateResult.success) {
    return applyHeaders(NextResponse.json({ error: 'Rate limit' }, { status: 429 }), rateResult);
  }
  try {
    const user = await resolveUser(req);
    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId: user.userId, type: 'NFT_GIFT' },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    return applyHeaders(NextResponse.json({ withdrawals }), rateResult);
  } catch {
    return applyHeaders(NextResponse.json({ error: 'Auth error' }, { status: 401 }), rateResult);
  }
}
