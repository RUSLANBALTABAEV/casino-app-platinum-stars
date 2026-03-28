import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { ADMIN_SESSION_COOKIE, getAdminSecret, hashAdminSecret } from './lib/auth/admin';

function looksSuspiciousRequest(request: NextRequest): boolean {
  const { pathname, search } = request.nextUrl;
  const target = `${pathname}${search}`.toLowerCase();

  // Block common exploit probes / command-injection payloads (URL-only).
  // Note: We intentionally keep this conservative to avoid breaking legitimate traffic.
  const suspiciousPatterns = [
    '/.git',
    '/.env',
    '/.ssh',
    '/.config',
    '..%2f',
    '../',
    'wp-admin',
    'cgi-bin',
    'phpmyadmin',
    'adminer',
    'base64',
    'mkfifo',
    '|sh',
    '|bash',
    '%0a',
    '%0d',
    '%3b', // ;
    '%7c', // |
    ';',
    '|',
    'wget',
    'curl',
    'nc ',
    'netcat',
    'python -c',
    'perl -e',
    'eval(',
    'exec(',
    'system(',
    'union select',
    'drop table',
    'delete from',
    'insert into',
    'update set',
    'script>',
    '<iframe',
    'javascript:',
    'onerror=',
    'onload='
  ];

  for (const pattern of suspiciousPatterns) {
    if (target.includes(pattern)) {
      return true;
    }
  }

  const ua = request.headers.get('user-agent')?.toLowerCase() ?? '';
  const suspiciousUAs = [
    'masscan',
    'zgrab',
    'sqlmap',
    'nikto',
    'nmap',
    'nessus',
    'openvas',
    'acunetix',
    'burp',
    'w3af',
    'havij',
    'pangolin'
  ];

  for (const susUA of suspiciousUAs) {
    if (ua.includes(susUA)) {
      return true;
    }
  }

  // Block requests with suspicious headers
  const suspiciousHeaders = [
    'x-forwarded-host',
    'x-original-url',
    'x-rewrite-url'
  ];

  for (const header of suspiciousHeaders) {
    const headerValue = request.headers.get(header);
    if (headerValue && (headerValue.includes('..') || headerValue.includes('//'))) {
      return true;
    }
  }

  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Lightweight WAF for URL-level probes.
  if (looksSuspiciousRequest(request)) {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown';
    const ua = request.headers.get('user-agent') ?? 'unknown';
    console.error('[WAF] blocked request', {
      ip,
      method: request.method,
      path: request.nextUrl.pathname,
      search: request.nextUrl.search,
      ua
    });
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Admin routes protection
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login' || pathname === '/admin/login/') {
      return NextResponse.next();
    }

    const adminSecret = getAdminSecret();
    if (!adminSecret) {
      // In production, do not expose admin if it's not configured.
      if (process.env.NODE_ENV === 'production') {
        return new NextResponse('Not Found', { status: 404 });
      }
      return NextResponse.next();
    }

    const cookie = request.cookies.get(ADMIN_SESSION_COOKIE);
    const expected = await hashAdminSecret(adminSecret);

    if (!cookie || cookie.value !== expected) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  }

  // API routes - аутентификация проверяется в самих роутах (не в middleware из-за Edge runtime)

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude Next internals and static assets.
    '/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)'
  ]
};
