import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || 'change-this-secret-key-in-production';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 часа

export interface AdminSessionData {
  userId: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Создает новую сессию админа
 */
export async function createAdminSession(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AdminSessionData> {
  // Генерируем токен
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto
    .createHash('sha256')
    .update(`${token}:${SESSION_SECRET}`)
    .digest('hex');

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Сохраняем в БД
  await prisma.adminSession.create({
    data: {
      userId,
      token,
      tokenHash,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt
    }
  });

  return {
    userId,
    token,
    tokenHash,
    expiresAt
  };
}

/**
 * Проверяет токен и возвращает данные сессии
 */
export async function verifyAdminSession(
  token: string,
  ipAddress?: string
): Promise<{ userId: string; sessionId: string } | null> {
  if (!token || token.length < 32) {
    return null;
  }

  // Вычисляем хеш токена
  const tokenHash = crypto
    .createHash('sha256')
    .update(`${token}:${SESSION_SECRET}`)
    .digest('hex');

  // Ищем сессию в БД
  const session = await prisma.adminSession.findFirst({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          isAdmin: true
        }
      }
    }
  });

  if (!session) {
    return null;
  }

  // Проверяем, что пользователь все еще админ
  if (!session.user.isAdmin) {
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  // Проверяем срок действия
  if (session.expiresAt < new Date()) {
    await prisma.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  // Обновляем время последнего использования
  await prisma.adminSession.update({
    where: { id: session.id },
    data: { lastUsedAt: new Date() }
  });

  return {
    userId: session.userId,
    sessionId: session.id
  };
}

/**
 * Удаляет сессию
 */
export async function deleteAdminSession(tokenHash: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: { tokenHash }
  });
}

/**
 * Удаляет все сессии пользователя
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: { userId }
  });
}

/**
 * Очищает истекшие сессии
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });

  return result.count;
}

/**
 * Получает IP адрес из запроса
 */
export function getClientIP(req: { headers: Headers | Record<string, string | string[] | null | undefined> }): string | undefined {
  const headers = req.headers;

  const readHeader = (name: string): string | string[] | null | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }

    const lowered = name.toLowerCase();
    return headers[lowered] ?? headers[name];
  };

  // Проверяем различные заголовки для получения реального IP
  const forwardedFor = readHeader('x-forwarded-for');
  
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips?.split(',')[0]?.trim();
  }

  const realIP = readHeader('x-real-ip');
  
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  return undefined;
}

/**
 * Получает User-Agent из запроса
 */
export function getUserAgent(req: { headers: Headers | Record<string, string | string[] | null | undefined> }): string | undefined {
  const headers = req.headers;
  const readHeader = (name: string): string | string[] | null | undefined => {
    if (headers instanceof Headers) {
      return headers.get(name);
    }

    const lowered = name.toLowerCase();
    return headers[lowered] ?? headers[name];
  };

  const userAgent = readHeader('user-agent');
  return userAgent ? (Array.isArray(userAgent) ? userAgent[0] : userAgent) : undefined;
}



