'use server';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { logSecurityEvent } from '@/lib/services/security';
import { applyUserStatus } from '@/lib/services/status';

export async function adjustUserBalance(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const userId = formData.get('userId');
  const amountRaw = formData.get('amount');

  if (typeof userId !== 'string' || !userId) {
    throw new Error('Отсутствует идентификатор пользователя.');
  }

  const amount = Number.parseInt(typeof amountRaw === 'string' ? amountRaw : '', 10);
  if (Number.isNaN(amount) || amount === 0) {
    throw new Error('Введите корректную сумму (целое число).');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.$transaction(async (tx: any) => {
    // Проверяем существование баланса, создаём если нет
    const existingBalance = await tx.starBalance.findUnique({
      where: { userId }
    });

    if (!existingBalance) {
      // Создаём баланс если его нет
      await tx.starBalance.create({
        data: {
          userId,
          available: Math.max(0, amount),
          reserved: 0,
          lifetimeEarn: amount > 0 ? amount : 0,
          lifetimeSpend: amount < 0 ? Math.abs(amount) : 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0
        }
      });
    } else {
      // Обновляем существующий баланс
      await tx.starBalance.update({
        where: { userId },
        data: {
          available: { increment: amount },
          lifetimeEarn: amount > 0 ? { increment: amount } : undefined,
          lifetimeSpend: amount < 0 ? { increment: Math.abs(amount) } : undefined
        }
      });
    }

    await tx.transaction.create({
      data: {
        userId,
        amount: Math.abs(amount),
        type: amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
        status: 'COMPLETED',
        provider: 'MANUAL',
        currency: 'RUB',
        meta: {
          source: 'ADMIN_ADJUST',
          direction: amount > 0 ? 'credit' : 'debit'
        }
      }
    });
  });

  await logSecurityEvent({
    type: 'USER_BALANCE_ADJUST',
    severity: amount < 0 ? 'WARNING' : 'INFO',
    message: `Ручная корректировка баланса на ${amount} ★`,
    userId,
    metadata: {
      amount
    }
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin');
}

export async function toggleUserBan(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const db = prisma as any;
  const userId = formData.get('userId');
  const banRaw = formData.get('ban');

  if (typeof userId !== 'string' || !userId) {
    throw new Error('Отсутствует идентификатор пользователя.');
  }

  const shouldBan = banRaw === 'true';

  await db.user.update({
    where: { id: userId },
    data: {
      isBanned: shouldBan
    }
  });

  await logSecurityEvent({
    type: shouldBan ? 'USER_BANNED' : 'USER_UNBANNED',
    severity: shouldBan ? 'WARNING' : 'INFO',
    message: `${shouldBan ? 'Пользователь заблокирован' : 'Пользователь разблокирован'}`,
    userId
  });

  revalidatePath('/admin/users');
}

export async function updateUserStatus(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const userId = formData.get('userId');
  const statusRaw = formData.get('status');
  const durationRaw = formData.get('durationDays');

  if (typeof userId !== 'string' || !userId) {
    throw new Error('Отсутствует идентификатор пользователя.');
  }
  if (typeof statusRaw !== 'string' || (statusRaw !== 'STANDARD' && statusRaw !== 'PREMIUM')) {
    throw new Error('Укажите корректный статус.');
  }

  const duration =
    typeof durationRaw === 'string' && durationRaw.trim().length > 0
      ? Number.parseInt(durationRaw, 10)
      : null;
  const durationDays = duration && Number.isFinite(duration) && duration > 0 ? duration : null;

  await applyUserStatus(userId, statusRaw, {
    durationDays,
    reason: 'ADMIN_PANEL'
  });

  await logSecurityEvent({
    type: 'USER_STATUS_MANUAL',
    severity: 'INFO',
    message: `Статус изменён на ${statusRaw}`,
    userId,
    metadata: {
      durationDays
    }
  });

  revalidatePath('/admin/users');
  revalidatePath('/admin');
}
