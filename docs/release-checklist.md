# Release Checklist

## Configuration
- [ ] Populate `.env` / production secrets (`DATABASE_URL`, `YOOKASSA_*`, `TELEGRAM_*`, `ADMIN_SECRET`, `BACKEND_BASE_URL`).
- [ ] Add secrets to CI (`DATABASE_URL`, optional staging DB URL).
- [ ] Update `TELEGRAM_MINI_APP_URL` with production link.

## Database
- [ ] Run `npm run prisma:generate`.
- [ ] Apply migrations: `npx prisma migrate deploy`.
- [ ] Seed baseline data: `npm run prisma:seed` (or run custom production seed).
- [ ] Verify `prisma migrate status` shows no pending steps.
- [ ] Export Neon PITR snapshot before release.

## Application
- [ ] `npm run lint` passes locally.
- [ ] Build succeeds: `npm run build`.
- [ ] Smoke-test admin panel (`/admin`) with current `ADMIN_SECRET`.
- [ ] Validate mini-app flows: wallet, tasks listing, promo activation, withdrawals.
- [ ] Test YooKassa payments (sandbox) and Telegram Stars invoice creation.
- [ ] Telegram bot commands `/start`, `/balance`, `/promo`, `/tasks` respond correctly.

## Operations
- [ ] Configure monitoring/alerts (Neon metrics, application logs, YooKassa webhook failures).
- [ ] Document rollback steps (redeploy previous release, restore DB snapshot).
- [ ] Confirm CI pipeline (`.github/workflows/ci.yml`) succeeds on main branch.
- [ ] Archive demo seed users if production should start empty (remove via Prisma).

## Security
- [ ] Rotate shared secrets after handover.
- [ ] Review audit logs (`/admin/security`) for suspicious entries.
- [ ] Ensure rate-limit headers present on API responses (curl check).
- [ ] Confirm HTTPS enforced end-to-end (reverse proxy / CDN).
