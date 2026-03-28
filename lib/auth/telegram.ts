export const runtime = 'nodejs';

import { createHmac, createHash, timingSafeEqual } from 'crypto';

function getBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return t;
}

export function verifyTelegramInitData(rawInitData: string, maxAgeSec = 600) {
  const params = new URLSearchParams(rawInitData);
  const hash = params.get('hash') || '';
  params.delete('hash');

  // canonical data
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  // secret_key = HMAC-SHA256("WebAppData", bot_token)
  const secretKey = createHmac('sha256', 'WebAppData').update(getBotToken()).digest();
  const hmac = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(hmac, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('Invalid initData hash');
  }

  const authDate = Number(params.get('auth_date') || '0');
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > maxAgeSec) {
    throw new Error('Auth data expired');
  }
}



