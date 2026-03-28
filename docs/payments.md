# YooKassa Integration

The mini-app now creates payments through YooKassa directly from the wallet screen. To activate the flow in your environment, supply the credentials issued in the YooKassa dashboard.

## 1. Environment variables

Create (or update) `.env.local` in the project root:

```bash
# YooKassa REST credentials
YOOKASSA_SHOP_ID=your_shop_id_here
YOOKASSA_SECRET_KEY=your_secret_key_here

# Exposed to the client for the native SDK (leave empty if you do not ship a mobile wrapper)
NEXT_PUBLIC_YOOKASSA_MOBILE_SDK_KEY=your_mobile_sdk_key_here
```

- `YOOKASSA_SHOP_ID` – numeric identifier of the store. If you only have the secret key, request the shop ID in your YooKassa profile.
- `YOOKASSA_SECRET_KEY` – REST API secret (e.g. `test_PnjqmYg3Xxa6yJAGBbU2ZMdpSQMrAik9w554S00Vs4g`).
- `NEXT_PUBLIC_YOOKASSA_MOBILE_SDK_KEY` – mobile SDK key (e.g. `test_MTE4MzQzOBmuTDA-diHFv4o48jG2lbIzLfD6ULQs-fA`). This value is sent back to the UI to help you initialise native SDK flows; omit it if you only use the web redirect confirmation.

Restart the dev server after editing the file so Next.js picks up the new variables.

## 2. How it works

- `/api/payments/create` creates a YooKassa payment using the server-side key pair.
- The handler expects a JSON payload with `amount`, optional `currency`, `description`, and `returnUrl`.
- The wallet screen (`app/wallet/page.tsx`) calls this endpoint, opens the returned `confirmationUrl`, and shows basic status/errors. If the endpoint returns the mobile SDK key it is also displayed for quick copy.

## 3. Testing

Use the `test_` credentials provided by YooKassa. The redirect page will present the sandbox confirmation UI. After switching to production, replace the variables with live values and, if required, update the return URL allow list in the YooKassa console.

## 4. Экономика и курсы

Все параметры монетизации настраиваются через админ-панель:

- **Экономика (`/admin/economy`)** — задавайте курс обмена звёзд на рубли/другие валюты, редактируйте пресеты пополнения, границы кастомных покупок и Telegram Stars. Изменения автоматически подтягиваются в кошельке мини-приложения.
- **Стоимость активностей** — использует данные из конфигураций игр (рулетка, раннер, лотереи). При изменении тарифов в `/admin/games` информация отображается на вкладке «Экономика».

## 5. Telegram Stars

В кошельке доступно пополнение через встроенные покупки Telegram Stars. Для работы достаточно настроенного `TELEGRAM_BOT_TOKEN` и активированного мини-приложения.

- Пользователь вводит количество звёзд в пределах, заданных в `/admin/economy`, и подтверждает операцию во всплывающем окне Telegram.
- На сервере создаётся счёт через метод [`createInvoiceLink`](https://core.telegram.org/bots/api#createinvoicelink) с валютой `XTR`, а в базе фиксируется транзакция со статусом `PENDING` и провайдером `TELEGRAM_STARS`.
- После оплаты Telegram возвращает пользователя в мини-приложение. Финальное зачисление обрабатывается в update-хендлере бота по `payload` вида `stars:<telegram_id>:<timestamp>`.

> ⚠️ API Telegram требует валидного `TELEGRAM_BOT_TOKEN` и внешнего доступа. В среде разработки без выхода в интернет запрос на `createInvoiceLink` завершится ошибкой.

## 6. Реферальная программа

- В разделе `/admin/economy` задаётся фиксированная награда в звёздах за каждого активированного приглашённого (поле «Награда за друга»).
- У каждого пользователя автоматически формируется уникальный реферальный код (см. профиль `GET /api/mini-app/profile` или endpoint `/api/mini-app/referral`).
- Игроки вводят код пригласившего через POST `/api/mini-app/referral` с действием `attach` и телеграм-инициализацией.
- После наступления целевого события вызовите `completeReferral(inviteeId)` из `lib/services/referral` — приглашённый зафиксируется как выполненный, а награда начислится приглашавшему на баланс.

## 7. Вывод средств

Игроки подают заявки на вывод прямо из кошелька мини‑приложения. Под капотом работает endpoint `/api/mini-app/withdrawals`:

- `GET /api/mini-app/withdrawals` — возвращает последние 20 заявок пользователя. Требуется заголовок `x-telegram-init-data` (тот же, что используется для авторизации в мини‑аппе).
- `POST /api/mini-app/withdrawals` — создаёт новую заявку. Тело запроса:
  ```jsonc
  {
    "amount": 250,
    "destination": "@username или адрес кошелька",
    "type": "STARS",          // либо "NFT_GIFT"
    "currency": "XTR",        // опционально, по умолчанию XTR для выводов звёзд
    "meta": { "note": "Комментарий для модератора" }
  }
  ```
  Для запросов `NFT_GIFT` поле `amount` опционально — если значение пропущено, система автоматически зафиксирует единицу (символизирует один подарок).
  При заявке на `NFT_GIFT` дополнительно списывается комиссия 25 ★.

На сервере заявка проходит несколько шагов: баланс пользователя резервирует запрошенные звёзды, создаётся запись `Withdrawal` и регистрируется событие безопасности. При отклонении резерв возвращается, при подтверждённой отправке добавляется транзакция со статусом `COMPLETED`.

### Админ-панель

- Раздел `/admin/withdrawals` предоставляет фильтры по типу и статусу, историю заявок и три действия: **Одобрить**, **Отклонить** (с указанием причины) и **Отметить отправку** (добавление ссылки на транзакцию или примечания).
- После отправки действия данные автоматически инвалидаются в разделах `/admin/withdrawals` и `/admin/transactions`.
- Если переменная окружения `DATABASE_URL` не задана, элементы управления блокируются: страница отображает предупреждение, а кнопки остаются неактивными, чтобы избежать ложных срабатываний.

> Не забудьте выполнить миграцию Prisma, чтобы создать таблицу `Withdrawal`, — команда `npx prisma migrate deploy` синхронизирует схему с базой данных.
