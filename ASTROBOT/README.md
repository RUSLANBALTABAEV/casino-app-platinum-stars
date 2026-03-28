# Telegram Bot Setup

This folder contains the standalone Telegram bot that powers sync and support features for the mini-app.

## 1. Quick setup (optional)

```bash
cd bot
chmod +x setup.sh  # first run only
./setup.sh
```

This creates `.venv` and installs dependencies automatically. Continue with step 3 to configure environment variables.

## 2. Manual setup (alternative)

```bash
cd bot
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

You can re-run this command every time `requirements.txt` changes.

## 3. Configure environment variables

Copy `env.example` to `.env` and fill in the values for your infrastructure:

```bash
cp env.example .env
```

The bot reads the following variables:

- `TELEGRAM_BOT_TOKEN` — token issued by @BotFather.
- `BACKEND_BASE_URL` — URL of the Next.js backend (default `http://localhost:3000`).
- `TELEGRAM_MINI_APP_URL` — launch URL of the mini-app (used in keyboards).
- `SUPPORT_CHAT_URL` — optional Telegram support chat link.
- `SUPPORT_USERNAME` — username of the support chat (default: `platinumstar_manager`).
- `ADMIN_USERNAME` — username of the admin (default: `platinis`).
- `RECEIPTS_CHANNEL_ID` — ID канала или invite link для отправки чеков (default: `+uB5YHKlAOBE4MDY6`).
- `TOPUP_URL`, `WITHDRAW_URL` — optional web pages for payments/withdrawals.

## Important: Bot Admin Setup

**Для проверки подписок на спонсорские каналы:**
- Бот должен быть добавлен как **администратор** в каналы/группы, на которые требуется проверка подписки
- Без прав администратора бот не сможет проверять подписки пользователей через `get_chat_member`
- При ошибке проверки подписки система считает, что пользователь подписан (чтобы не блокировать пользователей)

**Для получения чеков:**
- Все чеки о переводах автоматически отправляются в канал, указанный в `RECEIPTS_CHANNEL_ID`
- Бот должен быть добавлен как **администратор** в канал для отправки сообщений
- Чеки отправляются с информацией о пользователе (имя, username, телефон, ID запроса)

**Как получить chat_id канала:**
1. Добавьте бота как администратора в канал
2. Отправьте любое сообщение в канал
3. Используйте API: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. Найдите в ответе `chat.id` для вашего канала (обычно отрицательное число, например: `-1001234567890`)
5. Установите `RECEIPTS_CHANNEL_ID` в числовой формат: `-1001234567890`

**Альтернативный способ:**
- Для публичных каналов можно использовать `@channel_username`
- Для приватных каналов с invite link нужно использовать числовой chat_id

## 4. Get channel chat_id (для приватных каналов)

Если вы используете приватный канал для получения чеков, нужно получить его chat_id:

```bash
cd ASTROBOT
python get_channel_id.py
```

Скрипт покажет chat_id канала (обычно отрицательное число, например: `-1001234567890`).
Установите это значение в переменную окружения `RECEIPTS_CHANNEL_ID`.

## 5. Run the bot locally

```bash
python bot.py
```

The script automatically loads `.env`, creates an aiohttp session and starts polling Telegram.

Stop the bot with <kbd>Ctrl</kbd>+<kbd>C</kbd>.

