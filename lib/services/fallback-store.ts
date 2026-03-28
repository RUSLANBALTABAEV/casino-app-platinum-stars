import type { TelegramUser } from '@/lib/telegram/init-data';

export interface FallbackBalance {
  available: number;
  reserved: number;
  lifetimeEarn: number;
  lifetimeSpend: number;
}

export interface FallbackProfile {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  avatarUrl: string | null;
  isPremium: boolean;
}

interface FallbackUserRecord {
  userId: string;
  telegramId: number;
  profile: FallbackProfile;
  balance: FallbackBalance;
  updatedAt: number;
}

type FallbackStore = {
  users: Map<number, FallbackUserRecord>;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
const globalStore = (globalThis as any).__astroBotFallbackStore as FallbackStore | undefined;

function getStore(): FallbackStore {
  if (globalStore) {
    return globalStore;
  }

  const store: FallbackStore = {
    users: new Map<number, FallbackUserRecord>()
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  (globalThis as any).__astroBotFallbackStore = store;
  return store;
}

function buildDefaultBalance(): FallbackBalance {
  return {
    available: 0,
    reserved: 0,
    lifetimeEarn: 0,
    lifetimeSpend: 0
  };
}

function normalizeUsername(username?: string): string | null {
  if (!username) {
    return null;
  }
  const trimmed = username.trim().replace(/^@/, '');
  return trimmed.length > 0 ? trimmed : null;
}

function buildProfileSnapshot(user: TelegramUser, existing?: FallbackProfile): FallbackProfile {
  return {
    telegramId: Number(user.id ?? existing?.telegramId ?? 0),
    username: normalizeUsername(user.username) ?? existing?.username ?? null,
    firstName: user.first_name ?? existing?.firstName ?? null,
    lastName: user.last_name ?? existing?.lastName ?? null,
    languageCode: user.language_code ?? existing?.languageCode ?? null,
    avatarUrl: user.photo_url ?? existing?.avatarUrl ?? null,
    isPremium: typeof user.is_premium === 'boolean' ? user.is_premium : existing?.isPremium ?? false
  };
}

function buildEmptyProfile(telegramId: number): FallbackProfile {
  return {
    telegramId,
    username: null,
    firstName: null,
    lastName: null,
    languageCode: null,
    avatarUrl: null,
    isPremium: false
  };
}

export function recordFallbackUser(user: TelegramUser): {
  userId: string;
  balance: FallbackBalance;
  profile: FallbackProfile;
} {
  const store = getStore();
  const telegramId = Number(user.id);
  const existing = store.users.get(telegramId);

  if (existing) {
    existing.profile = buildProfileSnapshot(user, existing.profile);
    existing.updatedAt = Date.now();
    store.users.set(telegramId, existing);
    return { userId: existing.userId, balance: existing.balance, profile: existing.profile };
  }

  const record: FallbackUserRecord = {
    userId: `fallback-${telegramId}`,
    telegramId,
    profile: buildProfileSnapshot(user),
    balance: buildDefaultBalance(),
    updatedAt: Date.now()
  };

  store.users.set(telegramId, record);
  return { userId: record.userId, balance: record.balance, profile: record.profile };
}

export function getFallbackBalance(telegramId: number): FallbackBalance | null {
  const store = getStore();
  const existing = store.users.get(telegramId);
  return existing ? existing.balance : null;
}

export function getFallbackProfile(telegramId: number): FallbackProfile | null {
  const store = getStore();
  const existing = store.users.get(telegramId);
  return existing ? existing.profile : null;
}

export function updateFallbackBalance(
  telegramId: number,
  updater: (balance: FallbackBalance) => FallbackBalance
): FallbackBalance {
  const store = getStore();
  const current = store.users.get(telegramId);

  if (!current) {
    const balance = updater(buildDefaultBalance());
    store.users.set(telegramId, {
      userId: `fallback-${telegramId}`,
      telegramId,
      profile: buildEmptyProfile(telegramId),
      balance,
      updatedAt: Date.now()
    });
    return balance;
  }

  const merged = updater(current.balance);
  current.balance = merged;
  current.updatedAt = Date.now();
  store.users.set(telegramId, current);
  return merged;
}

export function listFallbackTasks(): Array<{
  title: string;
  description: string;
  reward: number;
  link: string | null;
}> {
  return [
    {
      title: 'Присоединяйтесь к каналу',
      description: 'Подпишитесь на наш Telegram-канал, чтобы не пропустить новые события.',
      reward: 50,
      link: null
    },
    {
      title: 'Ежедневный вход',
      description: 'Откройте мини-приложение и сыграйте одну игру сегодня.',
      reward: 25,
      link: null
    }
  ];
}

