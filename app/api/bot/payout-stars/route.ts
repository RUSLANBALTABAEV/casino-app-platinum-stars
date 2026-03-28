import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-internal-secret');
  if (secret !== process.env.BACKEND_INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { telegramId: number; amount: number; withdrawalId: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const { telegramId, amount, withdrawalId } = body;
  if (!telegramId || !amount || !withdrawalId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  try {
    if (BOT_TOKEN) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramId,
          text: `⭐ <b>Вывод одобрен!</b>\n\nЗаявка <b>#${withdrawalId.slice(-8).toUpperCase()}</b> на сумму <b>${amount} ★</b> обработана.\n\nЗвёзды отправлены на ваш аккаунт. 🎰`,
          parse_mode: 'HTML'
        })
      }).catch(() => {});
    }
    await logSecurityEvent({
      type: 'PAYOUT_STARS_NOTIFIED', severity: 'INFO',
      message: `Payout sent: ${amount} stars to ${telegramId}`,
      metadata: { telegramId, amount, withdrawalId }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[PAYOUT-STARS]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
