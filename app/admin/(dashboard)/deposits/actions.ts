'use server';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { changeBonusBalance, changeStarBalance } from '@/lib/services/starBalanceService';

export async function approveDepositAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const depositId = formData.get('depositId');
  if (typeof depositId !== 'string' || !depositId) {
    throw new Error('Идентификатор запроса обязателен');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  await db.manualDepositRequest.update({
    where: { id: depositId },
    data: {
      status: 'APPROVED'
    }
  });

  revalidatePath('/admin/deposits');
}

export async function rejectDepositAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const depositId = formData.get('depositId');
  if (typeof depositId !== 'string' || !depositId) {
    throw new Error('Идентификатор запроса обязателен');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  await db.manualDepositRequest.update({
    where: { id: depositId },
    data: {
      status: 'REJECTED'
    }
  });

  revalidatePath('/admin/deposits');
}

export async function completeDepositAction(formData: FormData): Promise<void> {
  if (!process.env.DATABASE_URL) {
    return;
  }

  const depositId = formData.get('depositId');
  const starsInput = formData.get('stars');
  
  if (typeof depositId !== 'string' || !depositId) {
    throw new Error('Идентификатор запроса обязателен');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;

  const deposit = await db.manualDepositRequest.findUnique({
    where: { id: depositId },
    include: {
      user: true
    }
  });

  if (!deposit) {
    throw new Error('Запрос не найден');
  }

  if (deposit.status !== 'APPROVED') {
    throw new Error('Запрос должен быть одобрен перед зачислением');
  }

  // Определяем количество звёзд для зачисления
  let starsToCredit = deposit.stars;
  if (starsInput && typeof starsInput === 'string') {
    const parsed = Number.parseInt(starsInput, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      starsToCredit = parsed;
    }
  }

  if (starsToCredit <= 0) {
    throw new Error('Количество звёзд должно быть больше нуля');
  }

  // Зачисляем звёзды пользователю
  await changeStarBalance(deposit.userId, starsToCredit);

  const bonusCoins = Math.floor(starsToCredit * 0.1);
  if (bonusCoins > 0) {
    await changeBonusBalance(deposit.userId, bonusCoins);
  }
  
  // Обновляем processedById если есть сессия админа
  // TODO: Добавить получение ID админа из сессии

  // Создаём транзакцию
  await db.transaction.create({
    data: {
      userId: deposit.userId,
      type: 'DEPOSIT',
      amount: starsToCredit,
      currency: 'XTR',
      provider: 'MANUAL',
      status: 'COMPLETED',
      meta: {
        depositRequestId: deposit.id,
        rubAmount: deposit.rubAmount,
        paymentPurpose: deposit.paymentPurpose,
        originalStars: deposit.stars,
        creditedStars: starsToCredit,
        bonusCoins
      }
    }
  });

  // Обновляем статус запроса
  await db.manualDepositRequest.update({
    where: { id: depositId },
    data: {
      status: 'COMPLETED',
      processedAt: new Date()
    }
  });

  revalidatePath('/admin/deposits');
}
