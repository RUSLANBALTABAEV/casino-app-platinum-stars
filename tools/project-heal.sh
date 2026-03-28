#!/usr/bin/env bash
set -euo pipefail

# 1) Версия Node (стабильная для Next 15 и Prisma 5)
if command -v nvm >/dev/null 2>&1; then
  nvm install 20.12.2 >/dev/null
  nvm use 20.12.2
fi
echo "Node: $(node -v)  NPM: $(npm -v)"

# 2) Полная зачистка артефактов
pkill -f "next|node" >/dev/null 2>&1 || true
rm -rf node_modules .next package-lock.json

# 3) Контроль package.json версий (без ^ и ~)
# ПОМЕНЯЙ, если у тебя другие: важна согласованность!
jq '.engines={"node": ">=20.12.2"} |
  .dependencies.next="15.1.6" |
  .devDependencies.typescript="5.6.3" |
  .devDependencies["@types/node"]="20.14.12" |
  .dependencies.prisma="5.22.0" |
  .dependencies["@prisma/client"]="5.22.0"' package.json > package.json.tmp && mv package.json.tmp package.json

echo "\n--- ВНИМАНИЕ: СЛЕДУЮЩИЕ ФАЙЛЫ ТРЕБУЮТ РУЧНОГО ОБНОВЛЕНИЯ ---\n"

echo "*** tsconfig.json ***"
cat <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2023", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "strict": true,
    "resolveJsonModule": true,
    "allowJs": false,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
JSON

echo "\n*** next.config.js ***"
cat <<'JS'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true }
};
module.exports = nextConfig;
JS

echo "\n*** prisma/schema.prisma (блок generator client) ***"
cat <<'PRISMA'
generator client {
  provider = "prisma-client-js"
}
PRISMA

echo "\n--- КОНЕЦ РУЧНЫХ ОБНОВЛЕНИЙ ---\n"

# 7) Установка и генерация клиента
npm install --include=dev
npx prisma format
npx prisma validate
npx prisma generate

# 8) Sanity-чек: есть ли Withdrawal в сгенерированном клиенте
if ! grep -q "type[[:space:]]\+WithdrawalWhereInput" node_modules/@prisma/client/index.d.ts ; then
  echo "❌ В @prisma/client нет WithdrawalWhereInput — проверь модель Withdrawal и отсутствие @@ignore"
  exit 2
fi

# 9) Сборка без Turbopack для чистоты
rm -rf .next
NEXT_DISABLE_TURBOPACK=1 npm run build
echo "✅ Build OK"
