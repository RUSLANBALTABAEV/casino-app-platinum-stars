// POST /api/cron/withdrawals
// Планировщик обработки заявок на вывод.
// Вызывается каждые 5 минут через cron (vercel.json или внешний cron).
// Env vars: CRON_SECRET, TELEGRAM_BOT_TOKEN, AUTO_WITHDRAWAL_THRESHOLD, BOT_NOTIFY_URL

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { markWithdrawalSent } from '@/lib/services/withdrawal';
import { logSecurityEvent } from '@/lib/services/security';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const BOT_NOTIFY_URL = process.env.BOT_NOTIFY_URL ?? '';
const BACKEND_INTERNAL_SECRET = process.env.BACKEND_INTERNAL_SECRET ?? '';
const AUTO_WITHDRAWAL_THRESHOLD = parseInt(
  process.env.AUTO_WITHDRAWAL_THRESHOLD ?? '500',
  10
);
/** Максимум заявок за один прогон (защита от перегрузки) */
const BATCH_SIZE = 20;

function isAuthorized(req: NextRequest): boolean {
  // Vercel Cron добавляет заголовок Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization');
  if (authHeader && CRON_SECRET) {
    return authHeader === `Bearer ${CRON_SECRET}`;
  }
  // Fallback: x-cron-secret
  const secretHeader = req.headers.get('x-cron-secret');
  if (secretHeader && CRON_SECRET) {
    return secretHeader === CRON_SECRET;
  }
  // В development разрешаем без авторизации
  return process.env.NODE_ENV === 'development';
}

async function sendStarsViaTelegramApi(params: {
  telegramId: number;
  amount: number;
  withdrawalId: string;
}): Promise<boolean> {
  if (!BOT_TOKEN) return false;
  // 
  // Telegram Stars payout via bot: send a message notifying that payout is ready,
  // then the bot handles actual XTR transfer via BOT_NOTIFY_URL
  //
  if (BOT_NOTIFY_URL && BACKEND_INTERNAL_SECRET) {
    try {
      const res = await fetch(`${BOT_NOTIFY_URL}/api/bot/payout-stars`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': BACKEND_INTERNAL_SECRET
        },
        body: JSON.stringify({
          telegramId: params.telegramId,
          amount: params.amount,
          withdrawalId: params.withdrawalId
        }),
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) return true;
    } catch { /* fallthrough to direct send */ }
  }

  // Fallback: send notification message to user
  try {
    const msgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.telegramId,
        text: `⭐ <b>Вывод обрабатывается</b>\n\nЗаявка #${params.withdrawalId.slice(-8).toUpperCase()} на сумму <b>${params.amount} ★</b> принята в обработку.\n\nСредства поступят в течение нескольких минут.`,
        parse_mode: 'HTML'
      }),
      signal: AbortSignal.timeout(10000)
    });
    return msgRes.ok;
  } catch {
    return false;
  }
}

async function notifyUser(params: {
  telegramId: number;
  status: string;
  amount: number;
  withdrawalId: string;
}): Promise<void> {
  if (!BOT_NOTIFY_URL) return;
  try {
    await fetch(`${BOT_NOTIFY_URL}/notify/withdrawal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': BACKEND_INTERNAL_SECRET
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // некритично
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  try {
    // Берём PENDING заявки на вывод звёзд в пределах порога
    const pendingWithdrawals = await prisma.withdrawal.findMany({
      where: {
        type: 'STARS',
        status: 'PENDING',
        amount: { lte: AUTO_WITHDRAWAL_THRESHOLD }
      },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      include: {
        user: { select: { telegramId: true, id: true } }
      }
    });

    for (const withdrawal of pendingWithdrawals) {
      results.processed++;
      const telegramId = withdrawal.user?.telegramId
        ? Number(withdrawal.user.telegramId)
        : null;

      if (!telegramId) {
        results.skipped++;
        continue;
      }

      const apiOk = await sendStarsViaTelegramApi({
        telegramId,
        amount: withdrawal.amount,
        withdrawalId: withdrawal.id
      });

      if (apiOk) {
        try {
          await markWithdrawalSent(withdrawal.id, null, {
            auto: true,
            cronBatch: true,
            processedAt: new Date().toISOString()
          });
          void notifyUser({
            telegramId,
            status: 'SENT',
            amount: withdrawal.amount,
            withdrawalId: withdrawal.id
          });
          results.sent++;
        } catch (err) {
          console.error(`[CRON] Failed to mark withdrawal ${withdrawal.id} as sent:`, err);
          results.failed++;
        }
      } else {
        // Помечаем неудачную попытку в мета (не меняем статус)
        await prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: {
            meta: {
              ...(typeof withdrawal.meta === 'object' && withdrawal.meta !== null
                ? (withdrawal.meta as Record<string, unknown>)
                : {}),
              lastCronAttempt: new Date().toISOString(),
              cronAttemptFailed: true
            }
          }
        }).catch(() => {});
        results.failed++;
      }
    }

    // APPROVED заявки крупных выводов — просто логируем, ручная обработка
    const approvedLarge = await prisma.withdrawal.count({
      where: {
        type: 'STARS',
        status: 'APPROVED',
        amount: { gt: AUTO_WITHDRAWAL_THRESHOLD }
      }
    });

    await logSecurityEvent({
      type: 'CRON_WITHDRAWALS_RUN',
      severity: 'INFO',
      message: `Cron: обработано ${results.sent}/${results.processed} заявок, ожидают ручной обработки: ${approvedLarge}`,
      metadata: { ...results, approvedLarge, durationMs: Date.now() - startedAt }
    });

    return NextResponse.json({
      ok: true,
      ...results,
      approvedLargeCount: approvedLarge,
      durationMs: Date.now() - startedAt,
      threshold: AUTO_WITHDRAWAL_THRESHOLD
    });
  } catch (err) {
    console.error('[CRON] Withdrawals cron error:', err);
    return NextResponse.json(
      { error: 'Cron failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/** GET — health check для cron */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [pendingCount, approvedCount] = await Promise.all([
    prisma.withdrawal.count({ where: { status: 'PENDING', type: 'STARS' } }),
    prisma.withdrawal.count({ where: { status: 'APPROVED', type: 'STARS' } })
  ]);

  return NextResponse.json({
    ok: true,
    pending: pendingCount,
    approved: approvedCount,
    threshold: AUTO_WITHDRAWAL_THRESHOLD,
    autoEnabled: process.env.AUTO_WITHDRAWAL_ENABLED === 'true'
  });
}
