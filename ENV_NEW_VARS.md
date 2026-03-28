# Новые переменные окружения

Добавьте в `.env` (или в конфиг деплоя) следующие переменные для новых функций.

## Раздел 6: Автоматический вывод звёзд

```env
# Включить авто-вывод (true/false)
AUTO_WITHDRAWAL_ENABLED=true

# Максимальная сумма авто-вывода (звёзды).
# Заявки выше этого порога ожидают ручной модерации в /admin/withdrawals
AUTO_WITHDRAWAL_THRESHOLD=100

# Секрет для защиты /api/cron/withdrawals
# Вызывать: curl -H "Authorization: Bearer <CRON_SECRET>" https://yourdomain.com/api/cron/withdrawals
CRON_SECRET=your-strong-random-secret-here
```

### Настройка планировщика (cron)

Вызывайте `/api/cron/withdrawals` раз в минуту:

**Systemd timer / crontab:**
```bash
* * * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/withdrawals
```

**Vercel Cron (vercel.json):**
```json
{
  "crons": [
    {
      "path": "/api/cron/withdrawals",
      "schedule": "* * * * *"
    }
  ]
}
```
> Для Vercel Cron авторизация через header недоступна — используйте `CRON_SECRET` в query string
> и адаптируйте проверку в route.ts.

---

## Раздел 10: NFT-интеграция (Telegram Gifts API)

```env
# Общий секрет между Python-ботом и Next.js бэкендом.
# Бот передаёт его в заголовке x-bot-secret при вызове /api/bot/nft-gift.
BOT_INTERNAL_SECRET=your-bot-internal-secret-here
```

### Как это работает

1. Пользователь отправляет NFT-подарок боту в Telegram.
2. aiogram-бот перехватывает событие `F.gift` → вызывает `handle_nft_gift()`.
3. Бот POST'ит на `POST /api/bot/nft-gift` с `x-bot-secret`.
4. Бэкенд ищет `NftGift` по `telegramGiftId`, начисляет `priceStars` на баланс,
   создаёт `UserNftGift` с `source='GIFT_TRANSFER'`.
5. Пользователь получает уведомление в боте.

### Настройка каталога NFT

В Admin → NFT → Управление подарками добавьте `telegramGiftId` для каждого NFT.
`telegramGiftId` — это `gift.gift.id` из Telegram Bot API (уникальный ID типа подарка).

---

## Уже существующие переменные (справка)

```env
TELEGRAM_BOT_TOKEN=          # Токен бота (обязательно)
DATABASE_URL=                 # PostgreSQL connection string
NEXTAUTH_SECRET=              # JWT секрет
BOT_SECRET=                   # Секрет для /api/bot/* (уже существует)
BACKEND_BASE_URL=             # URL бэкенда для Python-бота
AUTO_WITHDRAWAL_ENABLED=      # Новое (см. выше)
```
