#!/usr/bin/env node
/**
 * Minimal production smoke test:
 * - checks key pages and API endpoints for non-5xx responses
 * - reports unexpected status codes and slow responses
 *
 * Usage:
 *   node scripts/prod-smoke.mjs https://astrogame-io.ru
 *   BASE_URL=https://astrogame-io.ru node scripts/prod-smoke.mjs
 */

const argv = process.argv.slice(2);
const baseUrl = (process.env.BASE_URL || argv.find((a) => !a.startsWith('-')) || 'https://astrogame-io.ru')
  .replace(/\/+$/, '');

import fs from 'node:fs';
import path from 'node:path';

const timeoutMs = Number.parseInt(process.env.TIMEOUT_MS || '8000', 10);
const slowMs = Number.parseInt(process.env.SLOW_MS || '2500', 10);

const allPages =
  process.env.ALL_PAGES === '1' ||
  argv.includes('--all-pages') ||
  argv.includes('--all');

function isDynamicPath(path) {
  return path.includes('[') || path.includes(']');
}

function isPageOkStatus(status) {
  // For pages we accept redirects (e.g., /admin -> /admin/login) as OK.
  return status >= 200 && status < 400;
}

/** @type {{name:string, path:string, expected:number[] }[]} */
const baseChecks = [
  { name: 'home', path: '/', expected: [200] },
  { name: 'gift', path: '/gift', expected: [200] },
  { name: 'games', path: '/games', expected: [200] },
  { name: 'tasks', path: '/tasks', expected: [200] },
  { name: 'promo', path: '/promocodes', expected: [200] },
  { name: 'wallet', path: '/wallet', expected: [200] },
  { name: 'admin login', path: '/admin/login', expected: [200] },

  { name: 'api test', path: '/api/test', expected: [200] },
  { name: 'api debug', path: '/api/debug', expected: [200] },

  // Bot endpoints: may return 400/401 depending on parameters/auth
  { name: 'bot online', path: '/api/bot/online', expected: [200] },
  { name: 'bot referral-info (missing telegramId)', path: '/api/bot/referral-info', expected: [400] },

  // Mini-app endpoints (no telegram header -> 400/401 is expected)
  { name: 'mini-app profile (no auth)', path: '/api/mini-app/profile', expected: [400, 401] },
  { name: 'mini-app daily-gift (no auth)', path: '/api/mini-app/daily-gift', expected: [400, 401] }
];

/** @returns {string[]} */
function loadAppRoutesFromBuild() {
  const candidates = [
    path.join(process.cwd(), '.next', 'app-path-routes-manifest.json'),
    path.join(process.cwd(), '.next', 'server', 'app-path-routes-manifest.json')
  ];

  const manifestPath = candidates.find((p) => fs.existsSync(p));
  if (!manifestPath) return [];

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const json = JSON.parse(raw);
  const routes = new Set();
  for (const route of Object.values(json)) {
    if (typeof route === 'string') routes.add(route);
  }
  return Array.from(routes).sort();
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`timeout after ${ms}ms`));
  }, ms);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { 'user-agent': 'casino-smoke/1.0' },
      redirect: 'manual',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCheck(check) {
  const url = `${baseUrl}${check.path}`;
  const started = Date.now();
  const res = await fetchWithTimeout(url, timeoutMs);
  const ms = Date.now() - started;
  const ok = check.expected.includes(res.status);
  const is5xx = res.status >= 500 && res.status <= 599;

  return {
    name: check.name,
    url,
    status: res.status,
    ok,
    is5xx,
    ms,
    slow: ms >= slowMs
  };
}

async function main() {
  console.log(`BASE_URL=${baseUrl}`);
  console.log(`timeoutMs=${timeoutMs} slowMs=${slowMs}`);
  console.log(`allPages=${allPages}`);
  console.log('');

  /** @type {{name:string, path:string, expected:number[] }[]} */
  const checks = [...baseChecks];

  if (allPages) {
    const routes = loadAppRoutesFromBuild()
      .filter((p) => typeof p === 'string')
      .filter((p) => p.startsWith('/'))
      .filter((p) => !p.startsWith('/api/'))
      .filter((p) => p !== '/_not-found')
      .filter((p) => !isDynamicPath(p));

    for (const p of routes) {
      if (checks.some((c) => c.path === p)) continue;
      checks.push({ name: `page ${p}`, path: p, expected: [200, 301, 302, 303, 307, 308] });
    }
  }

  /** @type {ReturnType<typeof fetchCheck>[]} */
  const results = [];

  for (const check of checks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fetchCheck(check);
      results.push(result);
      const statusText = result.ok ? 'OK' : 'FAIL';
      const perfText = result.slow ? ` SLOW(${result.ms}ms)` : ` ${result.ms}ms`;
      console.log(`${statusText}\t${result.status}\t${check.name}\t${perfText}\t${check.path}`);
    } catch (error) {
      results.push({
        name: check.name,
        url: `${baseUrl}${check.path}`,
        status: 0,
        ok: false,
        is5xx: false,
        ms: timeoutMs,
        slow: true,
        error: error instanceof Error ? error.message : String(error)
      });
      console.log(`FAIL\tERR\t${check.name}\t${timeoutMs}ms\t${check.path}`);
    }
  }

  const failures = results.filter((r) => !r.ok);
  const serverErrors = results.filter((r) => r.is5xx);
  const slow = results.filter((r) => r.ok && r.slow);

  console.log('');
  if (serverErrors.length) {
    console.log('5xx detected:');
    for (const r of serverErrors) {
      console.log(`- ${r.status} ${r.name} ${r.url}`);
    }
  }
  if (failures.length) {
    console.log('Failures:');
    for (const r of failures) {
      console.log(`- ${r.status || 'ERR'} ${r.name} ${r.url}${r.error ? ` (${r.error})` : ''}`);
    }
  }
  if (slow.length) {
    console.log('Slow (>= slowMs):');
    for (const r of slow) {
      console.log(`- ${r.ms}ms ${r.name} ${r.url}`);
    }
  }

  const exitCode = serverErrors.length || failures.length ? 2 : 0;
  process.exit(exitCode);
}

await main();
