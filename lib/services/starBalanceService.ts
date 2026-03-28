// lib/services/starBalanceService.ts

import { prisma } from "../prisma";

export type StarBalanceDto = {
  userId: string;
  available: number;
  reserved: number;
  lifetimeEarn: number;
  lifetimeSpend: number;
  bonusAvailable: number;
  bonusReserved: number;
  bonusLifetimeEarn: number;
  bonusLifetimeSpend: number;
};

export async function getOrCreateStarBalance(userId: string): Promise<StarBalanceDto> {
  // Проверяем существование пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error(`Пользователь с ID ${userId} не найден`);
  }

  // Используем транзакцию для безопасного создания баланса
  const balance = await prisma.$transaction(async (tx) => {
    const existing = await tx.starBalance.findUnique({
      where: { userId }
    });

    if (existing) {
      return existing;
    }

    return await tx.starBalance.create({
      data: {
        userId: userId,
        available: 0,
        reserved: 0,
        lifetimeEarn: 0,
        lifetimeSpend: 0,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });
  });

  return {
    userId: balance.userId,
    available: balance.available,
    reserved: balance.reserved,
    lifetimeEarn: balance.lifetimeEarn,
    lifetimeSpend: balance.lifetimeSpend,
    bonusAvailable: balance.bonusAvailable,
    bonusReserved: balance.bonusReserved,
    bonusLifetimeEarn: balance.bonusLifetimeEarn,
    bonusLifetimeSpend: balance.bonusLifetimeSpend
  };
}

export async function setStarBalance(userId: string, amount: number): Promise<StarBalanceDto> {
  // Проверяем существование пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error(`Пользователь с ID ${userId} не найден`);
  }

  const normalizedAmount = amount < 0 ? 0 : amount;
  
  // Используем транзакцию для безопасного создания/обновления баланса
  const balance = await prisma.$transaction(async (tx) => {
    const existing = await tx.starBalance.findUnique({
      where: { userId }
    });

    if (existing) {
      return await tx.starBalance.update({
        where: { userId },
        data: { available: normalizedAmount }
      });
    }

    return await tx.starBalance.create({
      data: {
        userId: userId,
        available: normalizedAmount,
        reserved: 0,
        lifetimeEarn: 0,
        lifetimeSpend: 0,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });
  });

  return {
    userId: balance.userId,
    available: balance.available,
    reserved: balance.reserved,
    lifetimeEarn: balance.lifetimeEarn,
    lifetimeSpend: balance.lifetimeSpend,
    bonusAvailable: balance.bonusAvailable,
    bonusReserved: balance.bonusReserved,
    bonusLifetimeEarn: balance.bonusLifetimeEarn,
    bonusLifetimeSpend: balance.bonusLifetimeSpend
  };
}

export async function changeStarBalance(userId: string, delta: number): Promise<StarBalanceDto> {
  // Проверяем существование пользователя
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error(`Пользователь с ID ${userId} не найден`);
  }

  // Используем транзакцию для безопасности
  const balance = await prisma.$transaction(async (tx) => {
    // Получаем или создаем баланс
    const existing = await tx.starBalance.findUnique({
      where: { userId },
    });

    if (!existing) {
      const newAmount = Math.max(0, delta);
      return await tx.starBalance.create({
        data: {
          userId,
          available: newAmount,
          reserved: 0,
          lifetimeEarn: delta > 0 ? delta : 0,
          lifetimeSpend: delta < 0 ? Math.abs(delta) : 0,
          bonusAvailable: 0,
          bonusReserved: 0,
          bonusLifetimeEarn: 0,
          bonusLifetimeSpend: 0
        },
      });
    }

    const newAmount = Math.max(0, existing.available + delta);
    const updateData: {
      available: number;
      lifetimeEarn?: { increment: number };
      lifetimeSpend?: { increment: number };
    } = {
      available: newAmount,
    };

    if (delta > 0) {
      updateData.lifetimeEarn = { increment: delta };
    } else if (delta < 0) {
      updateData.lifetimeSpend = { increment: Math.abs(delta) };
    }

    return await tx.starBalance.update({
      where: { userId },
      data: updateData,
    });
  });

  return {
    userId: balance.userId,
    available: balance.available,
    reserved: balance.reserved,
    lifetimeEarn: balance.lifetimeEarn,
    lifetimeSpend: balance.lifetimeSpend,
    bonusAvailable: balance.bonusAvailable,
    bonusReserved: balance.bonusReserved,
    bonusLifetimeEarn: balance.bonusLifetimeEarn,
    bonusLifetimeSpend: balance.bonusLifetimeSpend
  };
}

export async function changeBonusBalance(userId: string, delta: number): Promise<StarBalanceDto> {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error(`Пользователь с ID ${userId} не найден`);
  }

  const balance = await prisma.$transaction(async (tx) => {
    const existing = await tx.starBalance.findUnique({
      where: { userId }
    });

    if (!existing) {
      const newAmount = Math.max(0, delta);
      return await tx.starBalance.create({
        data: {
          userId,
          available: 0,
          reserved: 0,
          lifetimeEarn: 0,
          lifetimeSpend: 0,
          bonusAvailable: newAmount,
          bonusReserved: 0,
          bonusLifetimeEarn: delta > 0 ? delta : 0,
          bonusLifetimeSpend: delta < 0 ? Math.abs(delta) : 0
        }
      });
    }

    const newAmount = Math.max(0, existing.bonusAvailable + delta);
    const updateData: {
      bonusAvailable: number;
      bonusLifetimeEarn?: { increment: number };
      bonusLifetimeSpend?: { increment: number };
    } = {
      bonusAvailable: newAmount
    };

    if (delta > 0) {
      updateData.bonusLifetimeEarn = { increment: delta };
    } else if (delta < 0) {
      updateData.bonusLifetimeSpend = { increment: Math.abs(delta) };
    }

    return await tx.starBalance.update({
      where: { userId },
      data: updateData
    });
  });

  return {
    userId: balance.userId,
    available: balance.available,
    reserved: balance.reserved,
    lifetimeEarn: balance.lifetimeEarn,
    lifetimeSpend: balance.lifetimeSpend,
    bonusAvailable: balance.bonusAvailable,
    bonusReserved: balance.bonusReserved,
    bonusLifetimeEarn: balance.bonusLifetimeEarn,
    bonusLifetimeSpend: balance.bonusLifetimeSpend
  };
}
