import { PrismaClient, Prisma } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });
}

const prismaClient = globalThis.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prismaClient;
}

export const prisma = prismaClient;

/**
 * Выполняет транзакцию с увеличенным таймаутом для длительных операций
 * @param callback Функция транзакции
 * @param timeoutMs Таймаут в миллисекундах (по умолчанию 30000 = 30 секунд)
 */
export async function transactionWithTimeout<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  return prisma.$transaction(callback, {
    maxWait: timeoutMs,
    timeout: timeoutMs,
  });
}
