import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface TOTPSetupResult {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

/**
 * Генерирует секрет для TOTP и QR-код для настройки Google Authenticator
 */
export async function setupTOTP(userId: string, issuer: string = 'Casino Admin'): Promise<TOTPSetupResult> {
  // Генерируем секрет
  const secret = speakeasy.generateSecret({
    name: `${issuer} (${userId})`,
    length: 32
  });

  if (!secret.base32) {
    throw new Error('Failed to generate TOTP secret');
  }

  // Генерируем QR-код
  const otpauthUrl = speakeasy.otpauthURL({
    secret: secret.base32,
    label: userId,
    issuer: issuer,
    encoding: 'base32'
  });

  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

  // Генерируем резервные коды
  const backupCodes = Array.from({ length: 10 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );

  // Сохраняем в БД (но пока не активируем)
  await prisma.adminSettings.upsert({
    where: { userId },
    create: {
      userId,
      totpSecret: secret.base32,
      totpEnabled: false,
      totpBackupCodes: backupCodes
    },
    update: {
      totpSecret: secret.base32,
      totpBackupCodes: backupCodes
    }
  });

  return {
    secret: secret.base32,
    qrCodeUrl,
    backupCodes
  };
}

/**
 * Проверяет TOTP код
 */
export async function verifyTOTP(userId: string, token: string): Promise<boolean> {
  const settings = await prisma.adminSettings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.totpSecret || !settings.totpEnabled) {
    return false;
  }

  // Проверяем основной TOTP код
  const verified = speakeasy.totp.verify({
    secret: settings.totpSecret,
    encoding: 'base32',
    token: token,
    window: 2 // Разрешаем отклонение в ±2 интервала (60 секунд)
  });

  if (verified) {
    return true;
  }

  // Проверяем резервные коды
  if (settings.totpBackupCodes.includes(token)) {
    // Удаляем использованный резервный код
    await prisma.adminSettings.update({
      where: { userId },
      data: {
        totpBackupCodes: {
          set: settings.totpBackupCodes.filter(code => code !== token)
        }
      }
    });
    return true;
  }

  return false;
}

/**
 * Активирует TOTP после подтверждения
 */
export async function enableTOTP(userId: string, verificationToken: string): Promise<boolean> {
  const settings = await prisma.adminSettings.findUnique({
    where: { userId }
  });

  if (!settings || !settings.totpSecret) {
    throw new Error('TOTP not set up');
  }

  // Проверяем код перед активацией
  const verified = speakeasy.totp.verify({
    secret: settings.totpSecret,
    encoding: 'base32',
    token: verificationToken,
    window: 2
  });

  if (!verified) {
    return false;
  }

  // Активируем TOTP
  await prisma.adminSettings.update({
    where: { userId },
    data: {
      totpEnabled: true
    }
  });

  return true;
}

/**
 * Отключает TOTP
 */
export async function disableTOTP(userId: string): Promise<void> {
  await prisma.adminSettings.update({
    where: { userId },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpBackupCodes: []
    }
  });
}

/**
 * Проверяет, включен ли TOTP для пользователя
 */
export async function isTOTPEnabled(userId: string): Promise<boolean> {
  const settings = await prisma.adminSettings.findUnique({
    where: { userId },
    select: { totpEnabled: true }
  });

  return settings?.totpEnabled ?? false;
}




