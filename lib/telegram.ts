import type { TelegramUser } from '../types/telegram';

export function getTelegramDisplayName(user?: TelegramUser): string {
  if (!user) {
    return 'Загрузка…';
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (fullName) {
    return fullName;
  }

  if (user.username) {
    return `@${user.username}`;
  }

  return `ID ${user.id}`;
}

export function getTelegramAvatarFallback(user?: TelegramUser): string {
  if (!user) {
    return '★';
  }

  const initials = [user.first_name?.[0], user.last_name?.[0]]
    .filter(Boolean)
    .join('');

  if (initials) {
    return initials.toUpperCase();
  }

  if (user.username) {
    return user.username[0]?.toUpperCase() ?? '★';
  }

  return '★';
}

export function buildTelegramAuthHeaders(initDataRaw?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };

  if (initDataRaw) {
    headers['x-telegram-init-data'] = initDataRaw;
  }

  return headers;
}
