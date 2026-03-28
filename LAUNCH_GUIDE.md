# 🚀 Руководство по запуску Platinum Stars Casino

---

## ⚠️ ПЕРВЫМ ДЕЛОМ — Сброс токена бота

Вы опубликовали токен бота публично. Сделайте это **прямо сейчас**:

1. Напишите боту [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/mybots` → выберите своего бота → `API Token` → `Revoke current token`
3. Скопируйте **новый** токен
4. Вставьте новый токен в `.env` файлы вместо `ВАШ_НОВЫЙ_ТОКЕН_ПОСЛЕ_СБРОСА`

---

## Вариант 1: Локально на ПК (Windows / macOS / Linux)

### Что понадобится
- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (для PostgreSQL)
- [Python 3.11+](https://python.org/) (для бота)
- [Git](https://git-scm.com/)

---

### Шаг 1 — Распакуйте проект

```bash
# Распакуйте casino-app-patched.zip в удобную папку
# Например: C:\Projects\casino или ~/projects/casino
```

---

### Шаг 2 — Запустите PostgreSQL через Docker

```bash
# Откройте терминал в папке проекта (там где docker-compose.yml)
docker compose up postgres -d

# Проверьте что база запустилась:
docker compose ps
# Должно быть: casino_postgres ... healthy
```

---

### Шаг 3 — Настройте .env для Next.js

```bash
# Скопируйте пример:
cp .env.example .env

# Откройте .env в любом редакторе (VS Code, Notepad++ и т.д.)
# Заполните обязательные поля:
```

**.env** (корень проекта):
```env
DATABASE_URL=postgresql://casino:casino@localhost:5432/casino?schema=public
DATABASE_URL_UNPOOLED=postgresql://casino:casino@localhost:5432/casino?schema=public

TELEGRAM_BOT_TOKEN=ВАШ_НОВЫЙ_ТОКЕН
TELEGRAM_MINI_APP_URL=https://astrogam-prod-scripter0123.amvera.io
NEXT_PUBLIC_MINI_APP_URL=https://astrogam-prod-scripter0123.amvera.io

NEXTAUTH_SECRET=любая-длинная-строка-минимум-32-символа
ADMIN_SECRET=ваш-пароль-для-входа-в-панель-администратора

AUTO_WITHDRAWAL_ENABLED=false
CRON_SECRET=любой-случайный-секрет
BOT_INTERNAL_SECRET=любой-случайный-секрет

NODE_ENV=development
```

---

### Шаг 4 — Установите зависимости и запустите миграции

```bash
# В терминале, папка проекта (там где package.json):
npm install

# Создайте таблицы в базе данных:
npx prisma migrate deploy

# (Опционально) Заполните тестовыми данными:
npx prisma db seed
```

---

### Шаг 5 — Запустите Next.js бэкенд

```bash
npm run dev
# Откроется на http://localhost:3000
```

Проверьте:
- Откройте http://localhost:3000 — должна быть страница приложения
- Откройте http://localhost:3000/admin — панель администратора

---

### Шаг 6 — Настройте .env для Python-бота

```bash
# Перейдите в папку ASTROBOT:
cd ASTROBOT

# Скопируйте пример:
cp .env.example .env

# Откройте .env и заполните:
```

**ASTROBOT/.env**:
```env
TELEGRAM_BOT_TOKEN=ВАШ_НОВЫЙ_ТОКЕН
BACKEND_BASE_URL=http://localhost:3000
TELEGRAM_MINI_APP_URL=https://astrogam-prod-scripter0123.amvera.io
SUPPORT_CHAT_URL=https://t.me/
SUPPORT_USERNAME=platinumstar_manager
ADMIN_USERNAME=platinis
RECEIPTS_CHANNEL_ID=3250676900
TOPUP_URL=
WITHDRAW_URL=
BOT_INTERNAL_SECRET=тот-же-секрет-что-в-бэкенде
```

---

### Шаг 7 — Запустите Python-бота

```bash
# В папке ASTROBOT (новый терминал):
pip install -r requirements.txt
python bot.py
```

Вы увидите:
```
INFO: Bot started. Listening for updates...
```

---

### Шаг 8 — Первый вход в панель администратора

1. Откройте http://localhost:3000/admin
2. Войдите с логином `admin` и паролем из `ADMIN_SECRET`

> Если не работает — запустите: `npx ts-node scripts/setup-admin.ts`

---

### 📋 Итог: что должно работать локально

| Сервис | Адрес |
|--------|-------|
| Next.js (приложение) | http://localhost:3000 |
| Admin панель | http://localhost:3000/admin |
| PostgreSQL | localhost:5432 |
| Python бот | работает в фоне, слушает Telegram |

---

## Вариант 2: Хостинг Amvera (как в вашем проекте)

### Структура деплоя

```
Amvera App 1: Next.js бэкенд  ← ваш casino-app
Amvera App 2: Python бот      ← ASTROBOT/
Amvera DB:    PostgreSQL       ← управляемая БД
```

---

### Шаг 1 — Next.js на Amvera

1. Создайте новое приложение на [amvera.io](https://amvera.io)
2. Выберите: **Node.js** → тип **Dockerfile** (в проекте уже есть `Dockerfile`)
3. Загрузите файлы проекта (кроме `node_modules`, `.git`)
4. В настройках приложения → **Переменные окружения** добавьте:

```
DATABASE_URL          = postgresql://USER:PASS@HOST:5432/casino?schema=public
DATABASE_URL_UNPOOLED = postgresql://USER:PASS@HOST:5432/casino?schema=public
TELEGRAM_BOT_TOKEN    = ВАШ_НОВЫЙ_ТОКЕН
TELEGRAM_MINI_APP_URL = https://ваш-домен.amvera.io
NEXT_PUBLIC_MINI_APP_URL = https://ваш-домен.amvera.io
NEXTAUTH_SECRET       = длинная-случайная-строка
ADMIN_SECRET          = пароль-для-панели
AUTO_WITHDRAWAL_ENABLED = false
CRON_SECRET           = случайный-секрет
BOT_INTERNAL_SECRET   = случайный-секрет
NODE_ENV              = production
```

5. **Запустите деплой** → после сборки выполните в консоли Amvera:
```bash
npx prisma migrate deploy
```

---

### Шаг 2 — Python бот на Amvera

1. Создайте второе приложение на Amvera
2. Выберите: **Python 3.11**, тип **pip**
3. Загрузите содержимое папки **ASTROBOT/** (bot.py, requirements.txt, amvera.yml)
4. В настройках → **Переменные окружения**:

```
TELEGRAM_BOT_TOKEN  = ВАШ_НОВЫЙ_ТОКЕН
BACKEND_BASE_URL    = https://ваш-nextjs.amvera.io
TELEGRAM_MINI_APP_URL = https://ваш-nextjs.amvera.io
SUPPORT_CHAT_URL    = https://t.me/
SUPPORT_USERNAME    = platinumstar_manager
ADMIN_USERNAME      = platinis
RECEIPTS_CHANNEL_ID = 3250676900
BOT_INTERNAL_SECRET = тот-же-что-в-nextjs
```

5. **Запустите деплой**

---

### Шаг 3 — PostgreSQL на Amvera

1. В Amvera: **Сервисы** → **PostgreSQL** → создать
2. Скопируйте строку подключения
3. Вставьте в `DATABASE_URL` у Next.js приложения

---

## 🔑 Генерация случайных секретов

Выполните одну из команд, чтобы сгенерировать безопасные секреты:

**Linux / macOS / Git Bash:**
```bash
openssl rand -hex 32
```

**Node.js (любая платформа):**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**PowerShell (Windows):**
```powershell
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

---

## ❓ Частые проблемы

### «Cannot connect to database»
```bash
# Убедитесь что Docker запущен и PostgreSQL работает:
docker compose ps
# Если нет — запустите:
docker compose up postgres -d
```

### «prisma migrate deploy» падает
```bash
# Сначала сгенерируйте клиент:
npx prisma generate
# Потом миграции:
npx prisma migrate deploy
```

### Бот не отвечает
- Проверьте что `TELEGRAM_BOT_TOKEN` правильный (после сброса!)
- Проверьте что `BACKEND_BASE_URL` доступен из интернета (локально бот работает, но Telegram не может слать обновления на localhost — нужен ngrok или хостинг)

### Telegram Mini App не открывается локально
Telegram WebApp требует HTTPS. Для локальной разработки используйте [ngrok](https://ngrok.com/):
```bash
ngrok http 3000
# Скопируйте https://xxxx.ngrok-free.app
# Вставьте в TELEGRAM_MINI_APP_URL и NEXT_PUBLIC_MINI_APP_URL
```
