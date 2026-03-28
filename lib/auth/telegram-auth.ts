export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { verifyTelegramInitData } from './telegram';

export interface TelegramAuthPayload {
  telegramId: number;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
}

export function getTelegramAuthFromRequest(
  req: NextRequest
): TelegramAuthPayload | null {
  const initData = req.headers.get('x-telegram-init-data');

  if (!initData) {
    console.error('Missing X-Telegram-Init-Data header');
    return null;
  }

  try {
    // Verify the signature
    verifyTelegramInitData(initData);

    // Parse the initData
    const params = new URLSearchParams(initData);
    const userJson = params.get('user');

    if (!userJson) {
      throw new Error('Missing user in initData');
    }

    const user = JSON.parse(decodeURIComponent(userJson));

    return {
      telegramId: user.id,
      user
    };
  } catch (error) {
    console.error('Telegram auth verification failed:', error);
    return null;
  }
}

export function requireTelegramAuth(req: NextRequest): TelegramAuthPayload {
  const auth = getTelegramAuthFromRequest(req);
  if (!auth) {
    throw new Error('Telegram authentication required');
  }
  return auth;
}







