import type { NextRequest } from 'next/server';

export const DEMO_MODE_COOKIE = 'demo_mode';

function parseCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === key) {
      return rest.join('=');
    }
  }
  return null;
}

export function isDemoRequest(req: NextRequest | Request): boolean {
  const headerFlag = req.headers.get('x-demo-mode');
  if (headerFlag === '1' || headerFlag === 'true') {
    return true;
  }
  const cookieHeader = req.headers.get('cookie');
  const cookieValue = parseCookieValue(cookieHeader, DEMO_MODE_COOKIE);
  return cookieValue === '1';
}

export function isDemoModeEnabled(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.cookie.split(';').some((cookie) => cookie.trim().startsWith(`${DEMO_MODE_COOKIE}=1`));
}

export function setDemoMode(value: boolean): void {
  if (typeof document === 'undefined') {
    return;
  }
  const maxAge = value ? 60 * 60 * 24 * 30 : 0;
  document.cookie = `${DEMO_MODE_COOKIE}=${value ? '1' : '0'}; path=/; max-age=${maxAge}`;
}

export function getDemoBalance(): {
  available: number;
  reserved: number;
  lifetimeEarn: number;
  lifetimeSpend: number;
  bonusAvailable: number;
  bonusReserved: number;
} {
  return {
    available: 1250,
    reserved: 0,
    lifetimeEarn: 5200,
    lifetimeSpend: 3950,
    bonusAvailable: 180,
    bonusReserved: 0
  };
}
