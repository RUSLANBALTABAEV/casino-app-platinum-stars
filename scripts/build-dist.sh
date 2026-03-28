#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"

echo "==> Очистка ${DIST_DIR}"
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}"

echo "==> Установка зависимостей (npm ci)"
cd "${PROJECT_ROOT}"
npm ci --no-audit --no-fund

echo "==> Сборка Next.js (npm run build)"
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "==> Копирование артефактов веб-приложения в ${DIST_DIR}"
# Конфиги
if [ -f "${PROJECT_ROOT}/next.config.mjs" ]; then
  cp "${PROJECT_ROOT}/next.config.mjs" "${DIST_DIR}/"
elif [ -f "${PROJECT_ROOT}/next.config.js" ]; then
  cp "${PROJECT_ROOT}/next.config.js" "${DIST_DIR}/"
fi

# Package файлы (для установки зависимостей на сервере при необходимости)
cp "${PROJECT_ROOT}/package.json" "${DIST_DIR}/"
if [ -f "${PROJECT_ROOT}/package-lock.json" ]; then
  cp "${PROJECT_ROOT}/package-lock.json" "${DIST_DIR}/"
fi

# Папки, необходимые для запуска
if [ -d "${PROJECT_ROOT}/public" ]; then
  cp -R "${PROJECT_ROOT}/public" "${DIST_DIR}/"
fi
if [ -d "${PROJECT_ROOT}/prisma" ]; then
  cp -R "${PROJECT_ROOT}/prisma" "${DIST_DIR}/"
fi
if [ -d "${PROJECT_ROOT}/.next" ]; then
  cp -R "${PROJECT_ROOT}/.next" "${DIST_DIR}/.next"
fi

echo "==> Упаковка ASTROBOT в ${DIST_DIR}/bot"
mkdir -p "${DIST_DIR}/bot"
ASTROBOT_DIR="${PROJECT_ROOT}/ASTROBOT"
if [ -d "${ASTROBOT_DIR}" ]; then
  # Минимально необходимые файлы бота
  for f in bot.py requirements.txt env.example README.md setup.sh Dockerfile amvera.yml; do
    if [ -f "${ASTROBOT_DIR}/${f}" ]; then
      cp "${ASTROBOT_DIR}/${f}" "${DIST_DIR}/bot/"
    fi
  done
fi

echo "==> Готово. Содержимое ${DIST_DIR}:"
ls -la "${DIST_DIR}"
echo
echo "Подсказка:"
echo "- Для запуска веб-приложения на сервере: (в каталоге dist) npm ci && npm start"
echo "- Для настройки бота: (в каталоге dist/bot) bash setup.sh"










