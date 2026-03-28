import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAdminSession, getClientIP, getUserAgent } from './admin-session';
import { verifyTOTP } from './admin-totp';
import { applyRateLimit } from '@/lib/http/rate-limit';
import { getClientIdentifier } from '@/lib/http/request-helpers';
import crypto from 'crypto';

function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (password) {
    return password;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_PASSWORD is not set');
  }
  return 'dev-admin-password';
}

function getAdminTelegramId(): string {
  return process.env.ADMIN_TELEGRAM_ID ?? '0';
}

function timingSafeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export { getClientIP, getUserAgent } from './admin-session';

export interface AdminAuthResult {
  userId: string;
  sessionId: string;
  isAuthenticated: boolean;
  requiresTOTP?: boolean;
}

/**
 * Проверяет аутентификацию админа по токену
 */
export async function requireAdminAuth(req: NextRequest): Promise<AdminAuthResult> {
  const token = req.headers.get('X-Admin-Token');
  
  if (!token) {
    throw new Error('Admin token required');
  }

  const ipAddress = getClientIP(req);
  const session = await verifyAdminSession(token, ipAddress);

  if (!session) {
    throw new Error('Invalid or expired admin session');
  }

  // Проверяем, требуется ли TOTP для этого пользователя
  const adminSettings = await prisma.adminSettings.findUnique({
    where: { userId: session.userId },
    select: { totpEnabled: true, totpSecret: true }
  });

  const totpRequired = adminSettings?.totpEnabled === true;

  if (totpRequired) {
    // Если TOTP включен, проверяем его в заголовке
    const totpToken = req.headers.get('X-Admin-TOTP');
    
    if (!totpToken) {
      return {
        userId: session.userId,
        sessionId: session.sessionId,
        isAuthenticated: false,
        requiresTOTP: true
      };
    }

    const totpValid = await verifyTOTP(session.userId, totpToken);
    if (!totpValid) {
      throw new Error('Invalid TOTP token');
    }
  }

  return {
    userId: session.userId,
    sessionId: session.sessionId,
    isAuthenticated: true
  };
}

/**
 * Проверяет пароль и создает сессию
 */
export async function authenticateAdmin(
  password: string,
  totpToken?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ session: { token: string; expiresAt: Date }; requiresTOTP?: boolean; totpNotEnabled?: boolean }> {
  // Проверяем пароль
  const expectedPassword = getAdminPassword();
  if (!timingSafeEquals(password, expectedPassword)) {
    throw new Error('Invalid password');
  }

  // Находим админа
  let adminUser;
  const adminTelegramId = getAdminTelegramId();
  if (adminTelegramId === '0') {
    adminUser = await prisma.user.findFirst({
      where: { isAdmin: true }
    });
  } else {
    adminUser = await prisma.user.findUnique({
      where: { telegramId: BigInt(adminTelegramId) }
    });
  }

  if (!adminUser || !adminUser.isAdmin) {
    throw new Error('Admin user not found');
  }

  // Проверяем TOTP настройки
  const adminSettings = await prisma.adminSettings.findUnique({
    where: { userId: adminUser.id },
    select: { totpEnabled: true, totpSecret: true }
  });

  const totpSecret = adminSettings?.totpSecret ?? null;
  const totpConfigured = Boolean(totpSecret);
  const totpRequired = adminSettings?.totpEnabled === true;

  // Если TOTP включен - требуем код
  if (totpRequired) {
    if (!totpToken) {
      throw new Error('TOTP_REQUIRED');
    }

    const totpValid = await verifyTOTP(adminUser.id, totpToken);
    if (!totpValid) {
      throw new Error('Invalid TOTP token');
    }
  }

  // Создаем сессию
  const { createAdminSession } = await import('./admin-session');
  const session = await createAdminSession(adminUser.id, ipAddress, userAgent);

  return {
    session: {
      token: session.token,
      expiresAt: session.expiresAt
    },
    totpNotEnabled: totpConfigured && !totpRequired
  };
}

/**
 * Rate limiting для админских API
 */
export function applyAdminRateLimit(req: NextRequest, limit: number = 30, windowMs: number = 60_000) {
  const identifier = getClientIP(req) || getClientIdentifier(req);
  return applyRateLimit(`admin:${identifier}`, { limit, windowMs });
}


