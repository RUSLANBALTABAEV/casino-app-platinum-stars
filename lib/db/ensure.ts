import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

let initPromise: Promise<void> | null = null;

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const safeTableName = tableName.replace(/"/g, '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).$queryRaw(
      Prisma.sql`
        SELECT EXISTS(
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ${safeTableName}
        ) AS "exists"
      `
    ) as Array<{ exists: boolean }>;
    return Array.isArray(rows) && rows[0]?.exists === true;
  } catch {
    return false;
  }
}

export async function ensureDatabaseReady(): Promise<void> {
  // Если БД не настроена — ничего не делаем (обработчики перейдут в fallback).
  if (!process.env.DATABASE_URL) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Быстрая проверка — существует ли базовая таблица
    const hasUser = await tableExists('User');
    if (!hasUser) {
      // В проде не запускаем миграции/команды из обработчиков — это расширяет поверхность атаки.
      // Схема должна применяться на этапе деплоя.
      throw new Error('Database schema is not initialized (missing User table). Run migrations during deploy.');
    }
  })();

  return initPromise;
}
