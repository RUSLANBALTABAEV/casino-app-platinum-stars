# Architecture Overview

## Stack

- **Framework**: Next.js 15 App Router (React 19).
- **Database**: PostgreSQL (Neon) accessed through Prisma ORM.
- **Hosting targets**: Vercel/Node servers for the mini-app, Telegram bot (Python/aiogram) deploys separately.
- **Styling**: Tailwind CSS with custom theming.

## Modules

| Area | Location | Responsibilities |
| --- | --- | --- |
| API (mini-app) | `app/api/mini-app/*` | Authorises Telegram init data, serves wallet, tasks, games, referrals. |
| API (bot) | `app/api/bot/*` | Supports bot helpers (`/balance`, `/promo`, `/tasks`, `/sync`). |
| Payments | `app/api/payments/*`, `lib/payments/yookassa.ts` | YooKassa REST integration and Telegram Stars invoices. |
| Admin | `app/admin` + `components/admin` | Admin dashboard, actions (`/users`, `/games`, `/economy`, etc.). |
| Services | `lib/services/*` | Domain logic (users, balances, promo codes, withdrawals, referrals, settings). |
| Database | `prisma/schema.prisma`, `prisma/seed.js` | Schema + seed data for users, tasks, promo codes, settings. |
| Bot | `bot/bot.py` | Telegram bot (aiogram) calling backend endpoints. |

## Request flow

1. Telegram mini-app sends requests with `x-telegram-init-data`.
2. Middleware validates init data (signature + timestamp).
3. Service layer uses Prisma transactions for consistency (balances, withdrawals, referrals).
4. Responses include rate-limit headers (see `lib/http/rate-limit.ts`).

## Admin auth

- Guarded by middleware (`middleware.ts`) expecting `ADMIN_SECRET`.
- Login page hashes secret with Web Crypto/Node crypto fallback.
- Session stored in `ADMIN_SESSION_COOKIE`.

## Rate limiting

- Utility `lib/http/rate-limit.ts` keeps in-memory counters (per process) for low-volume endpoints.
- Applied to mini-app, bot, and payment APIs with tailored quotas.
- Headers `X-RateLimit-*` returned on every response.

## Background tasks

- No cron jobs required; all actions triggered by requests.
- Telegram bot handles sync & promo redemption from user interactions.

## Future enhancements

- External log aggregation (Datadog, Loki).
- Replace in-memory rate limiting with distributed store (Redis/Upstash) for multi-instance deployments.
- Introduce automated tests (Playwright/Integration) and health endpoints.
