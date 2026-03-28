/**
 * Скрипт для пополнения баланса пользователя.
 * 
 * КАК ЗАПУСТИТЬ на сервере (amvera):
 *   node add-balance.mjs
 * 
 * Или через docker exec:
 *   docker exec -it <container_name> node /app/add-balance.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── НАСТРОЙКИ ───────────────────────────────────────────────
const TELEGRAM_USERNAME = 'platinis';  // ← ваш username без @
const AMOUNT_TO_ADD = 10000;           // ← сколько звёзд добавить
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Ищем пользователя @${TELEGRAM_USERNAME}...`);

  const user = await prisma.user.findFirst({
    where: {
      username: {
        equals: TELEGRAM_USERNAME,
        mode: 'insensitive'
      }
    },
    include: {
      starBalance: true
    }
  });

  if (!user) {
    console.error(`❌ Пользователь @${TELEGRAM_USERNAME} не найден в базе данных.`);
    console.log('   Убедитесь что вы уже открыли бот хотя бы один раз.');
    process.exit(1);
  }

  console.log(`✅ Найден: @${user.username} (ID: ${user.telegramId})`);
  console.log(`   Текущий баланс: ${user.starBalance?.available ?? 0} ★`);

  if (!user.starBalance) {
    // Создаём баланс если его нет
    await prisma.starBalance.create({
      data: {
        userId: user.id,
        available: AMOUNT_TO_ADD,
        reserved: 0,
        lifetimeEarn: AMOUNT_TO_ADD,
        lifetimeSpend: 0,
        bonusAvailable: 0,
        bonusReserved: 0,
        bonusLifetimeEarn: 0,
        bonusLifetimeSpend: 0
      }
    });
    console.log(`💰 Создан баланс: +${AMOUNT_TO_ADD} ★`);
  } else {
    // Обновляем существующий
    await prisma.starBalance.update({
      where: { userId: user.id },
      data: {
        available: { increment: AMOUNT_TO_ADD },
        lifetimeEarn: { increment: AMOUNT_TO_ADD }
      }
    });
    console.log(`💰 Добавлено: +${AMOUNT_TO_ADD} ★`);
  }

  // Записываем транзакцию
  await prisma.transaction.create({
    data: {
      userId: user.id,
      amount: AMOUNT_TO_ADD,
      type: 'DEPOSIT',
      status: 'COMPLETED',
      provider: 'MANUAL',
      currency: 'XTR',
      meta: {
        source: 'ADMIN_SCRIPT',
        note: 'Тестовое пополнение'
      }
    }
  });

  const updatedBalance = await prisma.starBalance.findUnique({
    where: { userId: user.id }
  });

  console.log(`\n🎉 Готово! Новый баланс: ${updatedBalance?.available} ★\n`);
}

main()
  .catch((e) => {
    console.error('Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
