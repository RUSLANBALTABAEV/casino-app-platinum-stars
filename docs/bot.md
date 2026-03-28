## Telegram Bot (Python + aiogram)

The repository ships with a Python bot located in `bot/` that keeps the user database in sync with Telegram, works with promo codes, and provides quick entry into the mini-app.

### 1. Environment variables

Create a `.env` file inside `bot/` or export the variables before running the bot:

```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_MINI_APP_URL=https://t.me/your_bot/miniapp
BACKEND_BASE_URL=https://your-domain.com
TOPUP_URL=https://payments.your-domain.com/topup
WITHDRAW_URL=https://payments.your-domain.com/withdraw
NEXT_PUBLIC_MINI_APP_URL=https://t.me/your_bot/miniapp
NEXT_PUBLIC_TOPUP_URL=https://payments.your-domain.com/topup
NEXT_PUBLIC_WITHDRAW_URL=https://payments.your-domain.com/withdraw
```

- `BACKEND_BASE_URL` should point to the deployed Next.js instance (during development use `http://localhost:3000`).
- The frontend automatically exposes `NEXT_PUBLIC_MINI_APP_URL`, `NEXT_PUBLIC_TOPUP_URL`, `NEXT_PUBLIC_WITHDRAW_URL` so that the wallet screen can render the correct external links.
- The backend must share the same database described in `docs/database.md`.

### 2. Install Python dependencies

```
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r bot/requirements.txt
```

### 3. Run database migrations

```
npx prisma migrate deploy
```

(Only required on first launch or after schema updates.)

### 4. Start the bot

```
python bot/bot.py
```

The bot uses long polling and supports:

- `/start` — syncs the Telegram profile with the backend and returns a mini-app button.
- `/balance` (and inline “Баланс”) — shows the current and reserved star balance.
- `/promo <КОД>` — redeems promo codes via the shared promo service.
- `/tasks` — lists the latest active sponsor tasks.
- `/help` — command reference.

> For production set up a process manager (systemd, Supervisor, PM2, etc.) or switch to webhooks using aiogram’s webhook utilities.
