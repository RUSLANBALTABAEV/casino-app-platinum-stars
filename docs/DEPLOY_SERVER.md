# Деплой без Docker (сервер: 185.63.191.77, домен: astrogame-io.ru)

## 1) Подготовка сервера
```bash
sudo useradd -r -s /usr/sbin/nologin casino || true
sudo mkdir -p /opt/casino/web /opt/casino/bot /var/log/casino
sudo chown -R casino:casino /opt/casino /var/log/casino

sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs python3 python3-venv python3-pip postgresql postgresql-contrib nginx

# База данных
sudo -u postgres psql -c "CREATE USER casino WITH PASSWORD 'casino';"
sudo -u postgres psql -c "CREATE DATABASE casino OWNER casino;"
```

## 2) Загрузка артефактов
Скопируйте содержимое `dist-deploy` → `/opt/casino/web`, `dist-bot` → `/opt/casino/bot`:
```bash
rsync -avz dist-deploy/ root@185.63.191.77:/opt/casino/web/
rsync -avz dist-bot/     root@185.63.191.77:/opt/casino/bot/
sudo chown -R casino:casino /opt/casino
```

## 3) Окружение
```bash
# web
sudo -u casino bash -lc 'cp /opt/casino/web/.env.example /opt/casino/web/.env || true'
sudo -u casino bash -lc 'cat > /opt/casino/web/.env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://casino:casino@127.0.0.1:5432/casino?schema=public
DATABASE_URL_UNPOOLED=postgresql://casino:casino@127.0.0.1:5432/casino?schema=public
SHADOW_DATABASE_URL=postgresql://casino:casino@127.0.0.1:5432/casino?schema=public
TELEGRAM_MINI_APP_URL=https://astrogame-io.ru
NEXT_PUBLIC_MINI_APP_URL=https://astrogame-io.ru
NEXT_PUBLIC_API_BASE_URL=https://astrogame-io.ru/api
TELEGRAM_BOT_TOKEN=
ADMIN_SECRET=
EOF'

# bot
sudo -u casino bash -lc 'cp /opt/casino/bot/env.example /opt/casino/bot/.env || true'
sudo -u casino bash -lc 'sed -i "s|^BACKEND_BASE_URL=.*|BACKEND_BASE_URL=http://127.0.0.1:3000|" /opt/casino/bot/.env || true'
sudo -u casino bash -lc 'sed -i "s|^TELEGRAM_MINI_APP_URL=.*|TELEGRAM_MINI_APP_URL=https://astrogame-io.ru|" /opt/casino/bot/.env || true'
```

## 4) Зависимости и миграции
```bash
# web
sudo -u casino bash -lc '
  cd /opt/casino/web
  npm ci --omit=dev
  npx prisma migrate deploy
'

# bot
sudo -u casino bash -lc '
  cd /opt/casino/bot
  python3 -m venv .venv
  . .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
'
```

## 5) systemd‑службы
```bash
sudo cp scripts/systemd/casino-web.service /etc/systemd/system/casino-web.service
sudo cp scripts/systemd/casino-bot.service /etc/systemd/system/casino-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now casino-web
sudo systemctl enable --now casino-bot
```

## 6) Nginx + HTTPS
```bash
sudo mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/certbot
sudo cp scripts/nginx/astrogame-io.ru.conf /etc/nginx/sites-available/astrogame-io.ru.conf
sudo ln -sf /etc/nginx/sites-available/astrogame-io.ru.conf /etc/nginx/sites-enabled/astrogame-io.ru.conf
sudo nginx -t && sudo systemctl reload nginx

# Выдача сертификата (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d astrogame-io.ru --agree-tos -m admin@astrogame-io.ru --redirect
```

## 7) Проверка
```bash
curl -I https://astrogame-io.ru
journalctl -u casino-web -n 200 --no-pager
journalctl -u casino-bot -n 200 --no-pager
```

Открывайте мини‑приложение из Telegram (кнопка бота), чтобы передавался заголовок `X-Telegram-Init-Data` и подтягивался профиль. 


