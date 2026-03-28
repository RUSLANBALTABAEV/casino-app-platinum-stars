# Database Setup

The project now ships with a Prisma schema that covers the core entities of the mini-app:

- `User` – Telegram profile metadata.
- `StarBalance` – the user’s current, reserved, and lifetime star counters.
- `Transaction` – deposits/withdrawals/rewards with provider metadata.
- `PromoCode` & `PromoRedemption` – promo catalogue and redemption history.
- `Task` & `UserTask` – sponsor assignments and user progress.
- `GameSession` – stored results for runner/roulette/lottery modes.

## 1. Configure the datasource

Prisma expects a Postgres connection string via `DATABASE_URL`. Update `.env`:

```bash
DATABASE_URL="postgresql://user:password@host:5432/casino?schema=public"
```

Use any Postgres-compatible service (Supabase, Neon, Railway, etc.). For local development you can also point to a Docker container.

## 2. Install dependencies

```bash
npm install
```

This pulls `prisma` and `@prisma/client` that were added to `package.json`.

## 3. Generate the client and run migrations

```bash
npm run prisma:generate   # optional helper (see package.json scripts)
npx prisma migrate dev --name init_schema
```

After running migrations a type-safe Prisma Client is available through `lib/prisma.ts`:

```ts
import { prisma } from '@/lib/prisma';

const activePromos = await prisma.promoCode.findMany({
  where: { isActive: true }
});
```

## 4. Seed baseline data

```bash
npm run prisma:seed
```

The seed populates demo Telegram users (with balances/transactions), default status plans, promo codes, tasks, and economy settings so the admin panel and wallet work out of the box. Extend `prisma/seed.js` if you need more fixtures or partner-specific content.

## 5. Environment variables

Populate both `.env` (for CLI/production) and `.env.local` (for Next.js dev server) with the following keys:

```bash
DATABASE_URL=postgresql://...
YOOKASSA_SHOP_ID=1183438
YOOKASSA_SECRET_KEY=...
NEXT_PUBLIC_YOOKASSA_MOBILE_SDK_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_MINI_APP_URL=https://t.me/<bot>?startapp=payload
ADMIN_SECRET=...
```

Use live values before deploying to production (не держите боевые секреты в git).

> **Reminder:** keep secrets such as `DATABASE_URL`, YooKassa keys, and Telegram tokens in `.env` files and never commit them to the repository.
