# Backup / Restore

Этот проект использует PostgreSQL (Prisma). Полный бэкап обычно включает:
- файлы проекта (без `node_modules`, `.next` и прочих кешей)
- дамп базы (`pg_dump`)

## Создать полный бэкап на сервере

На сервере в папке проекта:

```bash
cd /root/casino-app
bash scripts/backup-full.sh
```

Если хотите включить `.env*` (осторожно: это секреты):

```bash
bash scripts/backup-full.sh --include-env
```

Результат появится в `./backups/casino_backup_YYYYMMDD_HHMMSS/`.

## Восстановить базу из бэкапа

1) Убедитесь, что у вас есть `DATABASE_URL` на целевую БД.
2) Запустите:

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public"
bash scripts/restore-full.sh --bundle-dir backups/casino_backup_YYYYMMDD_HHMMSS
```

## Рекомендации по доступу

Лучше использовать SSH-ключи (`ssh -i ...`) и отключить пароли для `root` по возможности.
