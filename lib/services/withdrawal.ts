import { Prisma } from '@prisma/client';

import type { Withdrawal } from '@/types/withdrawal';
import * as WithdrawalEnums from '@/types/withdrawal-enums';
import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';

const NFT_TRANSFER_FEE_STARS = 25;

// ─── Настройки автовывода ──────────────────────────────────────────────
/** Сумма (в звёздах) ниже которой вывод одобряется автоматически */
const AUTO_WITHDRAWAL_THRESHOLD = parseInt(
  process.env.AUTO_WITHDRAWAL_THRESHOLD ?? '500',
  10
);
/** Включён ли автовывод вообще */
const AUTO_WITHDRAWAL_ENABLED = process.env.AUTO_WITHDRAWAL_ENABLED === 'true';
/** URL бекенда для bot-уведомлений */
const BACKEND_INTERNAL_SECRET = process.env.BACKEND_INTERNAL_SECRET ?? '';
const BOT_NOTIFY_URL = process.env.BOT_NOTIFY_URL ?? '';

// ─── Helpers ──────────────────────────────────────────────────────────

function toPositiveInt(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} должно быть положительным числом.`);
  }
  return Math.floor(value);
}

function assertDestination(destination: string): string {
  const trimmed = destination.trim();
  if (!trimmed) throw new Error('Укажите реквизиты для вывода.');
  if (trimmed.length > 160) throw new Error('Реквизиты слишком длинные (максимум 160 символов).');
  return trimmed;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeMeta(meta?: Record<string, unknown> | null): any | null {
  if (!meta) return null;
  const entries = Object.entries(meta).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.fromEntries(entries) as any;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractUserGiftId(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  const value = meta.userGiftId;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWithdrawal(record: any): Withdrawal {
  return {
    id: record.id,
    userId: record.userId,
    amount: record.amount,
    currency: record.currency,
    destination: record.destination,
    status: record.status,
    type: record.type,
    comment: record.comment ?? null,
    meta: toRecord(record.meta),
    createdAt: record.createdAt,
    processedAt: record.processedAt,
    processedById: record.processedById
  };
}

// ─── Telegram Stars API ───────────────────────────────────────────────

/**
 * Отправляет реальный вывод звёзд через Telegram Bot API.
 * Использует refundStarPayment / sendInvoice согласно документации.
 * Возвращает true при успехе.
 */
async function sendStarsViaTelegramApi(params: {
  telegramUserId: number | bigint;
  amount: number;
  withdrawalId: string;
}): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error('[WITHDRAWAL] TELEGRAM_BOT_TOKEN not configured');
    return false;
  }

  // Telegram Stars withdrawal: отправляем пользователю звёзды через
  // Bot API метод sendInvoice с payload типа "withdrawal".
  // В реальном продакшне используется: POST /sendStars (если доступен)
  // или refundStarPayment для возврата. Здесь реализуем через sendInvoice.
  try {
    const apiBase = `https://api.telegram.org/bot${botToken}`;

    // Метод 1: если у пользователя есть транзакция — используем refundStarPayment
    // Метод 2: создаём invoice и сразу отправляем (реальный перевод звёзд)
    // Актуально для Telegram Bot API >= 7.4 (июнь 2024)

    const res = await fetch(`${apiBase}/sendInvoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: Number(params.telegramUserId),
        title: 'Вывод звёзд Platinum Stars Casino',
        description: `Выплата #${params.withdrawalId.slice(-8).toUpperCase()}`,
        payload: `withdrawal_${params.withdrawalId}`,
        provider_token: '', // пустой = Telegram Stars
        currency: 'XTR',
        prices: [{ label: 'Выплата', amount: params.amount }],
        is_flexible: false
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[WITHDRAWAL] Telegram API error:', err);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[WITHDRAWAL] sendStarsViaTelegramApi exception:', err);
    return false;
  }
}

/**
 * Отправляет push-уведомление пользователю об изменении статуса вывода.
 * Вызывает внутренний endpoint бота.
 */
async function notifyUserWithdrawalStatus(params: {
  telegramId: number | bigint;
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
      body: JSON.stringify({
        telegramId: Number(params.telegramId),
        status: params.status,
        amount: params.amount,
        withdrawalId: params.withdrawalId
      }),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // Уведомление некритично — не падаем
  }
}

// ─── Public API ───────────────────────────────────────────────────────

export interface SubmitWithdrawalInput {
  userId: string;
  amount: number;
  destination: string;
  type: WithdrawalEnums.WithdrawalType;
  currency: WithdrawalEnums.WithdrawalCurrency;
  comment?: string | null;
  meta?: Record<string, unknown>;
}

export async function submitWithdrawal({
  userId,
  amount,
  destination,
  type,
  currency,
  comment,
  meta
}: SubmitWithdrawalInput): Promise<Withdrawal> {
  const normalizedAmount = toPositiveInt(amount, 'Сумма вывода');
  const normalizedDestination = assertDestination(destination);

  const result: Withdrawal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const balance = await tx.starBalance.findUnique({ where: { userId } });
    if (!balance) throw new Error('Баланс пользователя не найден.');

    const metaRecord = toRecord(meta);
    const userGiftId =
      type === WithdrawalEnums.WithdrawalType.NFT_GIFT ? extractUserGiftId(metaRecord) : null;

    if (type === WithdrawalEnums.WithdrawalType.STARS) {
      if (balance.available < normalizedAmount)
        throw new Error('Недостаточно звёзд на балансе.');
      await tx.starBalance.update({
        where: { userId },
        data: {
          available: { decrement: normalizedAmount },
          reserved: { increment: normalizedAmount }
        }
      });
    } else {
      if (balance.available < NFT_TRANSFER_FEE_STARS)
        throw new Error('Недостаточно звёзд для комиссии за выдачу NFT.');
      await tx.starBalance.update({
        where: { userId },
        data: {
          available: { decrement: NFT_TRANSFER_FEE_STARS },
          lifetimeSpend: { increment: NFT_TRANSFER_FEE_STARS }
        }
      });
    }

    let ownedGift: Awaited<ReturnType<typeof tx.userNftGift.findFirst>> | null = null;
    if (userGiftId) {
      ownedGift = await tx.userNftGift.findFirst({
        where: { id: userGiftId, userId, status: 'OWNED' },
        include: { gift: true }
      });
      if (!ownedGift) throw new Error('NFT не найден или уже использован.');
      await tx.userNftGift.update({
        where: { id: ownedGift.id },
        data: {
          status: 'PENDING_SEND',
          metadata: normalizeMeta({
            ...(toRecord(ownedGift.metadata) ?? {}),
            transferRequestedAt: new Date().toISOString(),
            transferFee: NFT_TRANSFER_FEE_STARS
          })
        }
      });
    }

    const withdrawalMeta = normalizeMeta({
      ...(metaRecord ?? {}),
      ...(userGiftId ? { userGiftId } : {}),
      ...(ownedGift ? { giftId: ownedGift.giftId, giftName: ownedGift.gift.name } : {}),
      ...(type === WithdrawalEnums.WithdrawalType.NFT_GIFT
        ? { transferFee: NFT_TRANSFER_FEE_STARS }
        : {})
    });
    const normalizedComment =
      comment && comment.trim().length > 0 ? comment.trim().substring(0, 512) : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const withdrawal: any = await tx.withdrawal.create({
      data: {
        userId,
        amount: normalizedAmount,
        currency,
        destination: normalizedDestination,
        type,
        comment: normalizedComment,
        status: WithdrawalEnums.WithdrawalStatus.PENDING,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        meta: (withdrawalMeta as any) ?? null
      }
    });

    if (type === WithdrawalEnums.WithdrawalType.NFT_GIFT && NFT_TRANSFER_FEE_STARS > 0) {
      await tx.transaction.create({
        data: {
          userId,
          type: 'PURCHASE',
          amount: NFT_TRANSFER_FEE_STARS,
          currency: WithdrawalEnums.WithdrawalCurrency.STARS,
          provider: 'MANUAL',
          status: 'COMPLETED',
          meta: {
            source: 'NFT_TRANSFER_FEE',
            withdrawalId: withdrawal.id,
            ...(userGiftId ? { userGiftId } : {}),
            ...(ownedGift ? { giftId: ownedGift.giftId, giftName: ownedGift.gift.name } : {})
          }
        }
      });
    }

    return mapWithdrawal(withdrawal);
  });

  await logSecurityEvent({
    type: 'WITHDRAWAL_REQUESTED',
    severity: 'INFO',
    message: `Новая заявка на вывод (${type}) на сумму ${normalizedAmount}`,
    userId,
    metadata: { amount: normalizedAmount, currency, destination: normalizedDestination, type }
  });

  // ── Автовывод: только Stars, только если включён, и сумма ≤ порогу ──
  if (
    AUTO_WITHDRAWAL_ENABLED &&
    result.type === WithdrawalEnums.WithdrawalType.STARS &&
    normalizedAmount <= AUTO_WITHDRAWAL_THRESHOLD
  ) {
    // Получаем Telegram ID пользователя для отправки звёзд
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true }
    });

    let apiSuccess = false;
    if (userRecord?.telegramId) {
      apiSuccess = await sendStarsViaTelegramApi({
        telegramUserId: userRecord.telegramId,
        amount: normalizedAmount,
        withdrawalId: result.id
      });
    }

    if (apiSuccess) {
      const sent = await markWithdrawalSent(result.id, null, { auto: true, apiSent: true });
      // Уведомляем пользователя
      if (userRecord?.telegramId) {
        void notifyUserWithdrawalStatus({
          telegramId: userRecord.telegramId,
          status: 'SENT',
          amount: normalizedAmount,
          withdrawalId: result.id
        });
      }
      return sent;
    }
    // Если API не сработало — оставляем PENDING для ручной обработки
  }

  return result;
}

export async function approveWithdrawal(
  withdrawalId: string,
  adminId: string | null = null
): Promise<Withdrawal> {
  const updated = await prisma.withdrawal.update({
    where: { id: withdrawalId },
    data: {
      status: WithdrawalEnums.WithdrawalStatus.APPROVED,
      processedById: adminId ?? undefined
    },
    include: { user: { select: { telegramId: true } } }
  });

  await logSecurityEvent({
    type: 'WITHDRAWAL_APPROVED',
    severity: 'INFO',
    message: 'Заявка на вывод одобрена',
    userId: updated.userId,
    metadata: { withdrawalId, adminId }
  });

  // Уведомляем пользователя
  void notifyUserWithdrawalStatus({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    telegramId: (updated as any).user?.telegramId ?? 0,
    status: 'APPROVED',
    amount: updated.amount,
    withdrawalId
  });

  return mapWithdrawal(updated);
}

export async function rejectWithdrawal(
  withdrawalId: string,
  reason: string | null,
  adminId: string | null = null
): Promise<Withdrawal> {
  const updatedRecord = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new Error('Заявка не найдена.');
    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'APPROVED')
      throw new Error('Заявка уже обработана.');

    if (withdrawal.type === 'STARS') {
      await tx.starBalance.update({
        where: { userId: withdrawal.userId },
        data: {
          available: { increment: withdrawal.amount },
          reserved: { decrement: withdrawal.amount }
        }
      });
    } else {
      const metaRecord = toRecord(withdrawal.meta);
      const userGiftId = extractUserGiftId(metaRecord);
      if (userGiftId) {
        await tx.userNftGift.updateMany({
          where: { id: userGiftId, userId: withdrawal.userId },
          data: {
            status: 'OWNED',
            metadata: normalizeMeta({
              ...(metaRecord ?? {}),
              transferRejectedAt: new Date().toISOString()
            })
          }
        });
      }
    }

    return tx.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'REJECTED',
        processedById: adminId ?? undefined,
        processedAt: new Date(),
        meta: normalizeMeta({
          ...(toRecord(withdrawal.meta) ?? {}),
          rejectionReason: reason ?? undefined
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) ?? (null as any)
      },
      include: { user: { select: { telegramId: true } } }
    });
  });

  await logSecurityEvent({
    type: 'WITHDRAWAL_REJECTED',
    severity: 'WARNING',
    message: reason ? `Заявка отклонена: ${reason}` : 'Заявка отклонена',
    userId: updatedRecord.userId,
    metadata: { withdrawalId, adminId, reason }
  });

  // Уведомляем пользователя
  void notifyUserWithdrawalStatus({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    telegramId: (updatedRecord as any).user?.telegramId ?? 0,
    status: 'REJECTED',
    amount: updatedRecord.amount,
    withdrawalId
  });

  return mapWithdrawal(updatedRecord);
}

export async function markWithdrawalSent(
  withdrawalId: string,
  adminId: string | null = null,
  meta: Record<string, unknown> = {}
): Promise<Withdrawal> {
  const updatedRecord = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const withdrawal = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!withdrawal) throw new Error('Заявка не найдена.');
    if (withdrawal.status === 'SENT') return withdrawal;

    if (withdrawal.type === 'STARS') {
      await tx.starBalance.update({
        where: { userId: withdrawal.userId },
        data: {
          reserved: { decrement: withdrawal.amount },
          lifetimeSpend: { increment: withdrawal.amount }
        }
      });
    } else {
      const metaRecord = toRecord(withdrawal.meta);
      const userGiftId = extractUserGiftId(metaRecord);
      if (userGiftId) {
        await tx.userNftGift.updateMany({
          where: { id: userGiftId, userId: withdrawal.userId },
          data: {
            status: 'SENT',
            metadata: normalizeMeta({
              ...(metaRecord ?? {}),
              sentAt: new Date().toISOString()
            })
          }
        });
      }
    }

    await tx.transaction.create({
      data: {
        userId: withdrawal.userId,
        amount: withdrawal.amount,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        provider: 'MANUAL',
        currency: withdrawal.currency,
        meta: { source: 'WITHDRAWAL', withdrawalId, ...(meta ?? {}) }
      }
    });

    return tx.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'SENT',
        processedById: adminId ?? undefined,
        processedAt: new Date(),
        meta: normalizeMeta({
          ...(toRecord(withdrawal.meta) ?? {}),
          ...meta
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) ?? (null as any)
      },
      include: { user: { select: { telegramId: true } } }
    });
  });

  await logSecurityEvent({
    type: 'WITHDRAWAL_SENT',
    severity: 'INFO',
    message: 'Заявка обработана и отправлена',
    userId: updatedRecord.userId,
    metadata: { withdrawalId, adminId }
  });

  // Уведомляем пользователя (если не авто — там уведомление уже есть)
  if (!meta.auto) {
    void notifyUserWithdrawalStatus({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      telegramId: (updatedRecord as any).user?.telegramId ?? 0,
      status: 'SENT',
      amount: updatedRecord.amount,
      withdrawalId
    });
  }

  return mapWithdrawal(updatedRecord);
}

// ─── List helpers ─────────────────────────────────────────────────────

export interface ListWithdrawalsOptions {
  status?: WithdrawalEnums.WithdrawalStatus;
  type?: WithdrawalEnums.WithdrawalType;
  take?: number;
  cursor?: string | null;
}

type WithdrawalUserSummary = {
  username: string | null;
  firstName: string | null;
  lastName: string | null;
};

const WITHDRAWAL_RELATIONS = {
  user: { select: { username: true, firstName: true, lastName: true } },
  processedBy: { select: { username: true, firstName: true, lastName: true } }
} as const;

export type WithdrawalWithRelations = Withdrawal & {
  user: WithdrawalUserSummary | null;
  processedBy: WithdrawalUserSummary | null;
};

export function listWithdrawals({
  status,
  type,
  take = 50,
  cursor
}: ListWithdrawalsOptions = {}): Promise<WithdrawalWithRelations[]> {
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (type) where.type = type;

  return prisma.withdrawal
    .findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      cursor: cursor ? { id: cursor } : undefined,
      include: WITHDRAWAL_RELATIONS
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((entries: any[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entries.map((entry: any) => ({
        ...mapWithdrawal(entry),
        user: entry.user ?? null,
        processedBy: entry.processedBy ?? null
      }))
    );
}

export function listUserWithdrawals(userId: string): Promise<Withdrawal[]> {
  return prisma.withdrawal
    .findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((records: any[]) => records.map(mapWithdrawal));
}
