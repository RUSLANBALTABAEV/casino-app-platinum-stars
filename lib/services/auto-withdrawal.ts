/**
 * Сервис автоматического вывода звёзд (Раздел 6 ТЗ).
 *
 * Логика:
 *  - Заявки до AUTO_WITHDRAWAL_THRESHOLD звёзд обрабатываются автоматически
 *    через Telegram Stars API (refundStarPayment / sendMessage с invoice).
 *  - Заявки выше порога остаются в статусе PENDING и ожидают ручной модерации.
 *  - Планировщик (processAutoWithdrawals) вызывается из /api/cron/withdrawals.
 */

import { prisma } from '@/lib/prisma';
import { markWithdrawalSent, rejectWithdrawal } from '@/lib/services/withdrawal';
import { logSecurityEvent } from '@/lib/services/security';

// ─── Конфигурация ──────────────────────────────────────────────────────────
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

/** Максимальная сумма (звёзд) для авто-вывода. Выше — ручная модерация. */
export const AUTO_WITHDRAWAL_THRESHOLD =
  Number(process.env.AUTO_WITHDRAWAL_THRESHOLD ?? 100);

/** Включён ли авто-вывод */
export const isAutoWithdrawalEnabled = (): boolean =>
  process.env.AUTO_WITHDRAWAL_ENABLED === 'true' && BOT_TOKEN.length > 0;

// ─── Telegram Stars API ────────────────────────────────────────────────────

interface TelegramApiResult {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
}

/**
 * Отправляет refund звёзд пользователю через Telegram Bot API.
 * Telegram refundStarPayment — официальный способ вернуть Stars пользователю.
 * Используем его для «вывода»: пользователь получает Stars обратно в Telegram.
 *
 * @param telegramId  числовой ID пользователя в Telegram
 * @param telegramPaymentChargeId  charge_id исходного платежа (из транзакции)
 */
async function refundStars(
  telegramId: number,
  telegramPaymentChargeId: string,
): Promise<TelegramApiResult> {
  const res = await fetch(`${TELEGRAM_API}/refundStarPayment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: telegramId,
      telegram_payment_charge_id: telegramPaymentChargeId,
    }),
  });
  return res.json() as Promise<TelegramApiResult>;
}

/**
 * Отправляет пользователю уведомление о статусе вывода.
 */
async function notifyUser(
  telegramId: number,
  text: string,
): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch {
    // Уведомление — некритичная операция
  }
}

// ─── Логика обработки одной заявки ────────────────────────────────────────

interface ProcessResult {
  withdrawalId: string;
  status: 'auto_sent' | 'skipped_threshold' | 'failed';
  reason?: string;
}

async function processSingleWithdrawal(
  withdrawalId: string,
): Promise<ProcessResult> {
  // Загружаем заявку с данными пользователя
  const withdrawal = await prisma.withdrawal.findUnique({
    where: { id: withdrawalId },
    include: {
      user: {
        select: { telegramId: true, firstName: true },
      },
    },
  });

  if (!withdrawal) {
    return { withdrawalId, status: 'failed', reason: 'Заявка не найдена' };
  }
  if (withdrawal.status !== 'PENDING') {
    return { withdrawalId, status: 'skipped_threshold', reason: `Статус: ${withdrawal.status}` };
  }
  if (withdrawal.type !== 'STARS') {
    return { withdrawalId, status: 'skipped_threshold', reason: 'Не STARS вывод' };
  }

  // Ручная модерация для крупных выводов
  if (withdrawal.amount > AUTO_WITHDRAWAL_THRESHOLD) {
    return {
      withdrawalId,
      status: 'skipped_threshold',
      reason: `Сумма ${withdrawal.amount} > порог ${AUTO_WITHDRAWAL_THRESHOLD}`,
    };
  }

  const telegramId = Number(withdrawal.user.telegramId);
  const meta = (withdrawal.meta ?? {}) as Record<string, unknown>;

  // Пытаемся сделать refund через Telegram Stars API
  // charge_id хранится в meta.telegramPaymentChargeId (проставляется при пополнении)
  const chargeId = typeof meta.telegramPaymentChargeId === 'string'
    ? meta.telegramPaymentChargeId
    : null;

  let apiSuccess = false;
  let apiError: string | undefined;

  if (chargeId) {
    try {
      const result = await refundStars(telegramId, chargeId);
      if (result.ok) {
        apiSuccess = true;
      } else {
        apiError = result.description ?? 'Telegram API error';
      }
    } catch (err) {
      apiError = err instanceof Error ? err.message : 'Network error';
    }
  } else {
    // Нет charge_id — отмечаем как ручной вывод (admin отправит вручную)
    apiError = 'telegramPaymentChargeId отсутствует — требуется ручная отправка';
  }

  if (!apiSuccess && chargeId) {
    // Refund провалился — оставляем PENDING, логируем
    await logSecurityEvent({
      type: 'WITHDRAWAL_REQUESTED',
      severity: 'WARNING',
      message: `Авто-вывод не удался: ${apiError}`,
      userId: withdrawal.userId,
      metadata: { withdrawalId, telegramId, apiError },
    });
    return { withdrawalId, status: 'failed', reason: apiError };
  }

  // Отмечаем как отправлено
  await markWithdrawalSent(withdrawalId, null, {
    auto: true,
    telegramRefunded: apiSuccess,
    ...(chargeId ? { chargeId } : {}),
    ...(apiError ? { note: apiError } : {}),
  });

  // Уведомляем пользователя
  const userName = withdrawal.user.firstName ?? 'Пользователь';
  await notifyUser(
    telegramId,
    `✅ <b>${userName}</b>, ваша заявка на вывод <b>${withdrawal.amount} ★</b> выполнена!\n\nЗвёзды поступят на ваш аккаунт Telegram в течение нескольких секунд.`,
  );

  return { withdrawalId, status: 'auto_sent' };
}

// ─── Планировщик ──────────────────────────────────────────────────────────

export interface ProcessBatchResult {
  processed: number;
  autoSent: number;
  skipped: number;
  failed: number;
  details: ProcessResult[];
}

/**
 * Обрабатывает пакет PENDING-заявок на вывод.
 * Вызывается из /api/cron/withdrawals.
 */
export async function processAutoWithdrawals(
  limit = 20,
): Promise<ProcessBatchResult> {
  if (!isAutoWithdrawalEnabled()) {
    return { processed: 0, autoSent: 0, skipped: 0, failed: 0, details: [] };
  }

  // Берём самые старые PENDING заявки типа STARS в пределах авто-порога
  const pending = await prisma.withdrawal.findMany({
    where: {
      status: 'PENDING',
      type: 'STARS',
      amount: { lte: AUTO_WITHDRAWAL_THRESHOLD },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  const details: ProcessResult[] = [];

  for (const { id } of pending) {
    const result = await processSingleWithdrawal(id);
    details.push(result);
  }

  return {
    processed: details.length,
    autoSent: details.filter((d) => d.status === 'auto_sent').length,
    skipped: details.filter((d) => d.status === 'skipped_threshold').length,
    failed: details.filter((d) => d.status === 'failed').length,
    details,
  };
}

/**
 * Вызывается сразу после создания заявки в submitWithdrawal
 * (замена текущей заглушки AUTO_WITHDRAWAL_ENABLED).
 */
export async function maybeAutoProcess(withdrawalId: string): Promise<void> {
  if (!isAutoWithdrawalEnabled()) return;
  try {
    await processSingleWithdrawal(withdrawalId);
  } catch {
    // Не блокируем основной флоу при ошибке авто-вывода
  }
}
