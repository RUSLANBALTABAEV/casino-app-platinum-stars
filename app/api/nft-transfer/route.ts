import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

async function transferGiftViaTelegram(params: {
  telegramId: number;
  telegramGiftId: string;
  withdrawalId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: 'No bot token' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/transferGift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_connection_id: undefined,
        gift_id: params.telegramGiftId,
        new_owner_chat_id: params.telegramId,
      }),
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? 'Telegram API error' };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function notifyUser(telegramId: number, message: string) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegramId, text: message, parse_mode: 'HTML' })
  }).catch(() => {});
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.BACKEND_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    withdrawalId: string;
    telegramId: number;
    telegramGiftId: string;
    giftName: string;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { withdrawalId, telegramId, telegramGiftId, giftName } = body;
  if (!withdrawalId || !telegramId || !telegramGiftId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    // Check withdrawal still pending
    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal || withdrawal.status !== 'PENDING') {
      return NextResponse.json({ error: 'Withdrawal not found or already processed' }, { status: 404 });
    }

    // Attempt Telegram transferGift
    const result = await transferGiftViaTelegram({ telegramId, telegramGiftId, withdrawalId });

    if (result.ok) {
      // Mark withdrawal as SENT
      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'SENT', processedAt: new Date() }
      });

      // Update userGiftId status to SENT
      const meta = withdrawal.meta as Record<string, unknown> | null;
      const userGiftId = meta?.userGiftId as string | undefined;
      if (userGiftId) {
        await prisma.userNftGift.update({
          where: { id: userGiftId },
          data: { status: 'SENT' }
        }).catch(() => {});
      }

      await notifyUser(
        telegramId,
        `🎁 <b>NFT отправлен!</b>\n\n💎 <b>${giftName}</b> успешно переведён на ваш аккаунт Telegram.\n\nПроверьте раздел «Подарки» в настройках профиля.`
      );

      await logSecurityEvent({
        type: 'NFT_TRANSFER_SUCCESS',
        severity: 'INFO',
        message: `NFT ${giftName} успешно переведён: ${telegramId}`,
        metadata: { withdrawalId, telegramId, telegramGiftId }
      });

      return NextResponse.json({ ok: true, status: 'sent' });
    } else {
      // Mark as APPROVED for manual processing
      await prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'APPROVED',
          meta: {
            ...(typeof withdrawal.meta === 'object' && withdrawal.meta !== null ? withdrawal.meta as Record<string, unknown> : {}),
            transferError: result.error,
            needsManualProcessing: true
          }
        }
      });

      await notifyUser(
        telegramId,
        `🎁 <b>Заявка на вывод NFT принята</b>\n\n💎 <b>${giftName}</b>\n\nАвтоматический перевод временно недоступен. Администратор обработает заявку вручную в течение 24 часов.\n\nID заявки: <code>${withdrawalId.slice(-8).toUpperCase()}</code>`
      );

      await logSecurityEvent({
        type: 'NFT_TRANSFER_MANUAL_NEEDED',
        severity: 'WARNING',
        message: `NFT transfer failed, manual needed: ${result.error}`,
        metadata: { withdrawalId, telegramId, error: result.error }
      });

      return NextResponse.json({ ok: false, status: 'manual', error: result.error });
    }
  } catch (err) {
    console.error('[NFT-TRANSFER]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
