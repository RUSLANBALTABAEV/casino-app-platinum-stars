import crypto from 'crypto';

function secret(botToken: string): Buffer {
  return crypto.createHash('sha256').update(botToken).digest();
}

export function verifyInitData(initData: string, botToken: string): { ok: boolean; data: Record<string, string> | null } {
  if (!initData || !botToken) return { ok: false, data: null };

  const params = new URLSearchParams(initData);
  const hash = params.get('hash') || '';
  params.delete('hash');

  const pieces: string[] = [];
  for (const [k, v] of Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    pieces.push(`${k}=${v}`);
  }
  const dataCheckString = pieces.join('\n');
  const hmac = crypto.createHmac('sha256', secret(botToken)).update(dataCheckString).digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash))) return { ok: false, data: null };
  } catch {
    return { ok: false, data: null };
  }

  const authDate = Number(params.get('auth_date') || '0');
  if (!Number.isFinite(authDate) || Math.abs(Math.floor(Date.now() / 1000) - authDate) > 86400) {
    return { ok: false, data: null };
  }

  const data: Record<string, string> = {};
  for (const [k, v] of params.entries()) data[k] = v;
  return { ok: true, data };
}











