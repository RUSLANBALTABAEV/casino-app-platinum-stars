#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/restore-full.sh --bundle-dir DIR [--database-url URL]

Restores the DB dump (db.dump) from a bundle created by scripts/backup-full.sh.
This script does NOT overwrite your project files automatically.

Env:
  DATABASE_URL   Default URL for restore if --database-url not provided.
EOF
}

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

bundle_dir=""
database_url="${DATABASE_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bundle-dir)
      shift
      [[ $# -gt 0 ]] || die "--bundle-dir requires a directory"
      bundle_dir="$1"
      shift
      ;;
    --database-url)
      shift
      [[ $# -gt 0 ]] || die "--database-url requires a value"
      database_url="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1 (use --help)"
      ;;
  esac
done

[[ -n "$bundle_dir" ]] || die "--bundle-dir is required"
[[ -d "$bundle_dir" ]] || die "Bundle dir not found: $bundle_dir"

dump_file="${bundle_dir%/}/db.dump"
[[ -f "$dump_file" ]] || die "DB dump not found: $dump_file"

[[ -n "$database_url" ]] || die "DATABASE_URL is required (pass --database-url or export DATABASE_URL)"

command -v pg_restore >/dev/null 2>&1 || die "pg_restore not found (install postgresql-client)"

log "Restoring DB from $dump_file"
pg_restore --no-owner --no-acl --clean --if-exists -d "$database_url" "$dump_file"
log "DB restore complete"
