import type { NextRequest } from 'next/server';

/**
 * Возвращает первый реальный IP из типовых заголовков прокси/CDN.
 * Работает и в Edge, и в Node runtime.
 */
export function getClientIp(req: NextRequest): string | null {
  // Порядок важен: сначала стандартные/де-факто заголовки
  const candidates: Array<string | null> = [
    req.headers.get('x-forwarded-for'),   // "ip1, ip2, ip3"
    req.headers.get('cf-connecting-ip'),
    req.headers.get('true-client-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-client-ip'),
    req.headers.get('fastly-client-ip'),
    req.headers.get('x-cluster-client-ip')
  ];

  for (const raw of candidates) {
    if (!raw) continue;

    // x-forwarded-for может содержать список — берём первый
    const first = raw.split(',')[0]?.trim();
    if (first && first.length > 0) {
      const ip = stripIpv6Brackets(first);
      if (isValidIp(ip)) return ip;
    }
  }

  // Если совсем пусто — возвращаем null.
  // В NextRequest нет req.socket/connection.address, так что без заголовков достать IP нельзя.
  return null;
}

/**
 * Хелпер: получить Host (домен:порт), пригодится для абсолютных URL.
 */
export function getHost(req: NextRequest): string | null {
  const h = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  return h ? h.trim() : null;
}

/**
 * Хелпер: собрать origin (протокол + хост)
 */
export function getOrigin(req: NextRequest): string | null {
  const proto =
    req.headers.get('x-forwarded-proto') ??
    req.headers.get('cf-visitor') ?? // иногда содержит {"scheme":"https"}
    (req.nextUrl.protocol || null);

  const host = getHost(req);
  if (!host) return null;

  const scheme = extractScheme(proto) ?? 'https';
  return `${scheme}://${host}`;
}

/* ==================== Вспомогательные утилиты ==================== */

function stripIpv6Brackets(ip: string): string {
  // Некоторые прокси присылают IPv6 как "[2001:db8::1]"
  if (ip.startsWith('[') && ip.endsWith(']')) {
    return ip.slice(1, -1);
  }
  return ip;
}

function isValidIp(ip: string): boolean {
  // Быстрая проверка на IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every((n) => n >= 0 && n <= 255);
  }
  // Грубая проверка на IPv6 (допускает сжатие ::)
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(':')) {
    // минимальная фильтрация — не пустая, содержит допустимые символы и двоеточия
    return true;
  }
  return false;
}

function extractScheme(input: string | null): string | null {
  if (!input) return null;
  // x-forwarded-proto: "https" | "http"
  if (input === 'https' || input === 'http') return input;

  // cf-visitor: {"scheme":"https"}
  try {
    const parsed = JSON.parse(input) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'scheme' in parsed &&
      typeof (parsed as { scheme: unknown }).scheme === 'string'
    ) {
      const { scheme } = parsed as { scheme: string };
      if (scheme === 'https' || scheme === 'http') {
        return scheme;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function getClientIdentifier(req: NextRequest): string {
  const clientIp = getClientIp(req);
  if (clientIp) {
    return clientIp;
  }
  const userAgent = req.headers.get('user-agent') ?? 'unknown';
  return `${userAgent}:unknown`;
}
