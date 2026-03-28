/**
 * Script to setup admin user with boost capabilities
 * Usage: npx tsx scripts/setup-admin.ts
 * 
 * Make sure ADMIN_TELEGRAM_ID is set in .env before running this script
 */

import { prisma } from '@/lib/prisma';

const ADMIN_TELEGRAM_ID = BigInt(process.env.ADMIN_TELEGRAM_ID || '0');

async function setupAdmin() {
  try {
    if (ADMIN_TELEGRAM_ID === BigInt(0)) {
      console.error('❌ ADMIN_TELEGRAM_ID не установлен в .env');
      process.exit(1);
    }

    console.log(`🔧 Настройка админа с Telegram ID: ${ADMIN_TELEGRAM_ID}`);

    // Try to find existing admin
    let admin = await prisma.user.findUnique({
      where: { telegramId: ADMIN_TELEGRAM_ID }
    });

    if (admin) {
      console.log(`👤 Найден существующий пользователь: ${admin.username || admin.firstName || 'Unknown'}`);

      // Update flags
      admin = await prisma.user.update({
        where: { id: admin.id },
        data: {
          isAdmin: true,
          adminBoostEnabled: false // Keep disabled by default
        }
      });

      console.log('✅ Флаги админа обновлены:');
      console.log(`   - isAdmin: ${admin.isAdmin}`);
      console.log(`   - adminBoostEnabled: ${admin.adminBoostEnabled}`);
    } else {
      console.log('⚠️  Пользователь с этим Telegram ID не найден в БД');
      console.log('💡 Пользователь будет создан автоматически при первом входе в приложение');
    }

    console.log('\n✅ Административная настройка завершена!');
    console.log(`🌐 Админ-панель доступна по адресу: /ixc`);
    console.log(`🔑 Пароль: ${process.env.ADMIN_PASSWORD || 'ToneXXl999'}`);
  } catch (error) {
    console.error('❌ Ошибка при настройке админа:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupAdmin();







