# Database Ops Checklist

## CI/CD steps

Run these commands on each deployment (staging and prod):

```bash
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run prisma:seed    # skip if you have environment-specific seeding
npm run build
```

- `migrate deploy` applies only pending migrations; fails fast if database schema drifts.
- Keep `prisma/migrations/` under version control and generate new ones for every schema change.

## Health checks & monitoring

- Enable Neon project metrics (connections, slow queries, CPU, storage).
- Set alerts for:
  - connection saturation (pgbouncer if concurrency grows),
  - replication/backup failures,
  - long-running queries > 2s.
- Schedule automated backups (Neon PITR) and test restore quarterly.

## Security

- Store `.env` secrets in the CI secret manager (GitHub Actions secrets, etc.).
- Rotate `YOOKASSA_SECRET_KEY` and `TELEGRAM_BOT_TOKEN` periodically; never log them.
- Restrict Neon access with IP allow-lists or IAM tokens.

## Incident response

- For critical issues:
  1. Disable write-heavy features by toggling `SystemSetting` flags via admin panel.
  2. Inspect `SecurityEvent` entries (`lib/services/security.ts`) for anomaly context.
  3. Use `prisma.$queryRaw` scripts under `scripts/` (create as needed) for one-off analysis.
- After hotfix, document root cause and follow up with migration/seed updates if data corrections were needed.
