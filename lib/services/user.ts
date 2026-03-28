import type { TelegramUser } from '@/lib/telegram/init-data';
import { prisma } from '@/lib/prisma';
import { upsertStarBalanceByUserId } from '@/lib/db/star-balance';
import { recordFallbackUser, type FallbackProfile } from '@/lib/services/fallback-store';
import { ensureUserStatusFresh } from '@/lib/services/status';
import { ensureUserReferralCode } from '@/lib/services/referral';

export type SyncUserProfile = FallbackProfile;

export interface SyncUserResult {
  userId: string;
  balance: {
    available: number;
    reserved: number;
  };
  profile: SyncUserProfile;
  source: 'database' | 'fallback';
}

function normalizeUsername(username?: string): string | null {
  if (!username) {
    return null;
  }
  const normalized = username.trim().replace(/^@/, '');
  return normalized.length > 0 ? normalized : null;
}

function buildProfileFromDb(dbUser: {
  telegramId: bigint;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
}): SyncUserProfile {
  return {
    telegramId: Number(dbUser.telegramId),
    username: dbUser.username,
    firstName: dbUser.firstName,
    lastName: dbUser.lastName,
    languageCode: dbUser.languageCode,
    avatarUrl: dbUser.avatarUrl,
    isPremium: dbUser.isPremium
  };
}

function buildProfileFromInput(user: TelegramUser): SyncUserProfile {
  return {
    telegramId: Number(user.id),
    username: normalizeUsername(user.username),
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    languageCode: user.language_code ?? null,
    avatarUrl: user.photo_url ?? null,
    isPremium: Boolean(user.is_premium)
  };
}

export async function syncTelegramUser(user: TelegramUser): Promise<SyncUserResult> {
  const useDatabase = Boolean(process.env.DATABASE_URL);
  const devGrantBalance = process.env.NODE_ENV !== 'production'
    ? Number.parseInt(process.env.DEV_GRANT_BALANCE ?? '', 10)
    : NaN;

  if (!useDatabase) {
    const fallback = recordFallbackUser(user);
    return {
      userId: fallback.userId,
      balance: {
        available: fallback.balance.available,
        reserved: fallback.balance.reserved
      },
      profile: fallback.profile,
      source: 'fallback'
    };
  }

  try {
    const telegramId = BigInt(user.id);

    const dbUser = await prisma.user.upsert({
      where: { telegramId },
      update: {
        username: normalizeUsername(user.username),
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        avatarUrl: user.photo_url ?? undefined,
        isPremium: Boolean(user.is_premium)
      },
      create: {
        telegramId,
        username: normalizeUsername(user.username),
        firstName: user.first_name,
        lastName: user.last_name,
        languageCode: user.language_code,
        avatarUrl: user.photo_url ?? undefined,
        isPremium: Boolean(user.is_premium)
      }
    });

    if (!dbUser.referralCode) {
      await ensureUserReferralCode(dbUser.id);
    }

    await ensureUserStatusFresh(dbUser.id);

    // Создание/обновление StarBalance через безопасную функцию
    const balance = await upsertStarBalanceByUserId(dbUser.id, 0);
    if (Number.isFinite(devGrantBalance) && devGrantBalance > 0 && balance.available < devGrantBalance) {
      const patched = await prisma.starBalance.update({
        where: { userId: dbUser.id },
        data: { available: { set: devGrantBalance } }
      });
      return {
        userId: dbUser.id,
        balance: {
          available: patched.available,
          reserved: patched.reserved
        },
        profile: buildProfileFromDb(dbUser),
        source: 'database'
      };
    }

    return {
      userId: dbUser.id,
      balance: {
        available: balance.available,
        reserved: balance.reserved
      },
      profile: buildProfileFromDb(dbUser),
      source: 'database'
    };
  } catch (error) {
    console.error('Failed to sync user in database. Falling back to in-memory store.', error);
    const fallback = recordFallbackUser(user);
    return {
      userId: fallback.userId,
      balance: {
        available: fallback.balance.available,
        reserved: fallback.balance.reserved
      },
      profile: fallback.profile ?? buildProfileFromInput(user),
      source: 'fallback'
    };
  }
}
