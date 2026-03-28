import crypto from 'crypto';

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  auth_date?: number;
  hash: string;
  [key: string]:
    | string
    | number
    | TelegramUser
    | undefined
    | Record<string, unknown>
    | null;
}

export function isDevTelegramBypassEnabled(): boolean {
  const bypassRequested =
    process.env.DEV_BYPASS_TELEGRAM_AUTH === '1' || process.env.TELEGRAM_BYPASS_AUTH === '1';
  if (!bypassRequested) {
    return false;
  }
  return process.env.NODE_ENV !== 'production' || process.env.TELEGRAM_BYPASS_AUTH === '1';
}

export function getDevTelegramUser(params?: {
  telegramId?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): TelegramUser {
  const telegramId = params?.telegramId ?? 123456789;
  return {
    id: telegramId,
    first_name: params?.first_name ?? 'Local',
    last_name: params?.last_name ?? 'Tester',
    username: params?.username ?? 'local_tester',
    language_code: 'ru',
    is_premium: false
  };
}

export function parseInitData(raw: string): TelegramInitData {
  const params = new URLSearchParams(raw);
  const initData: TelegramInitData = { hash: '' };

  for (const [key, value] of params.entries()) {
    if (key === 'user') {
      initData.user = JSON.parse(value) as TelegramUser;
      continue;
    }

    if (key === 'hash') {
      initData.hash = value;
      continue;
    }

    if (key === 'auth_date') {
      initData.auth_date = Number.parseInt(value, 10);
      continue;
    }

    initData[key] = value;
  }

  return initData;
}

export function verifyInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) {
    return false;
  }

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) {
    return false;
  }

  urlParams.delete('hash');
  const dataCheckString = [...urlParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hmacHex = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // timingSafeEqual throws if buffer lengths differ; also hash must be hex.
  try {
    const expected = Buffer.from(hmacHex, 'hex');
    const actual = Buffer.from(hash, 'hex');
    if (expected.length !== actual.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function assertInitDataIsFresh(initData: TelegramInitData, ttlSeconds = 86400): void {
  if (!initData.auth_date) {
    throw new Error('Missing auth_date in init data');
  }

  const expiresAt = initData.auth_date + ttlSeconds;
  const now = Math.floor(Date.now() / 1000);
  if (now > expiresAt) {
    throw new Error('Telegram init data has expired');
  }
}

export function ensureTelegramUser(initData: TelegramInitData): TelegramUser {
  if (!initData.user) {
    throw new Error('Telegram init data is missing user payload');
  }

  return initData.user;
}

export function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set');
  }
  return token;
}
