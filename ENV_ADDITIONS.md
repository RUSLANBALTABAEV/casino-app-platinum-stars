# Новые переменные окружения — добавить в .env

## Автовывод звёзд
AUTO_WITHDRAWAL_ENABLED=true
AUTO_WITHDRAWAL_THRESHOLD=500
# Суммы <= 500 звёзд — автоматически, > 500 — ручная модерация

## Безопасность внутренних вызовов бот ↔ бэкенд
BACKEND_INTERNAL_SECRET=your_random_secret_here_min_32_chars

## Cron-задача (Vercel)
CRON_SECRET=your_cron_secret_here

## Внутренний сервер бота для уведомлений
BOT_INTERNAL_PORT=8081
BOT_NOTIFY_URL=http://localhost:8081
# В продакшне замените localhost на реальный адрес сервера бота
