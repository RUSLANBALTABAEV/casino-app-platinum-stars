import { prisma } from '@/lib/prisma';

export async function upsertStarBalanceByUserId(userId: string, delta: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Транзакция = защита от гонок (двойных create)
      return await prisma.$transaction(async (tx) => {
        // Проверяем существование пользователя перед созданием баланса
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new Error(`User with id ${userId} does not exist`);
        }

        const row = await tx.starBalance.findUnique({ where: { userId } });
        if (!row) {
          return tx.starBalance.create({
            data: { 
              userId, 
              available: Math.max(0, delta),
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
        return tx.starBalance.update({
          where: { userId },
          data: { available: { increment: delta } },
        });
      });
    } catch (e: any) {
      if (e?.code === 'P2002') continue; // повтор при уникальном конфликте
      throw e;
    }
  }
  throw new Error('Concurrent update error for StarBalance');
}


