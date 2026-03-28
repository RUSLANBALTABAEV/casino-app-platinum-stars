#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/backup-full.sh [--out DIR] [--include-env] [--include-postgres-volume]

Creates a full backup bundle under DIR (default: ./backups):
  - files.tar.gz (project files, with sane excludes)
  - db.dump     (PostgreSQL pg_dump in custom format, when possible)
  - manifest.txt + SHA256SUMS

Env:
  DATABASE_URL                  Used for pg_dump/pg_restore when Docker is not used.
  POSTGRES_DB/POSTGRES_USER     Optional hints for Docker pg_dump (defaults: casino/casino).
EOF
}

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out_dir="${repo_root}/backups"
include_env="0"
include_volume="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      shift
      [[ $# -gt 0 ]] || die "--out requires a directory"
      out_dir="$1"
      shift
      ;;
    --include-env)
      include_env="1"
      shift
      ;;
    --include-postgres-volume)
      include_volume="1"
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

timestamp="$(date +%Y%m%d_%H%M%S)"
bundle_dir="${out_dir%/}/casino_backup_${timestamp}"
mkdir -p "$bundle_dir"

files_archive="${bundle_dir}/files.tar.gz"
db_dump="${bundle_dir}/db.dump"
manifest="${bundle_dir}/manifest.txt"
checksums="${bundle_dir}/SHA256SUMS"

tar_excludes=(
  --exclude='*/.git/*'
  --exclude=.git
  --exclude=.git/*
  --exclude=./.git
  --exclude=./.git/*
  --exclude='*/node_modules/*'
  --exclude=node_modules
  --exclude=node_modules/*
  --exclude=./node_modules
  --exclude=./node_modules/*
  --exclude='*/.next/*'
  --exclude=.next
  --exclude=.next/*
  --exclude=./.next
  --exclude=./.next/*
  --exclude='*/builds/*'
  --exclude=builds
  --exclude=builds/*
  --exclude=./builds
  --exclude=./builds/*
  --exclude='*/dist*/*'
  --exclude=dist*
  --exclude=./dist*
  --exclude='*/.venv/*'
  --exclude=.venv
  --exclude=.venv/*
  --exclude=./.venv
  --exclude=./.venv/*
  --exclude='*/__pycache__/*'
  --exclude='*/backups/*'
  --exclude=backups
  --exclude=backups/*
  --exclude=./backups
  --exclude=./backups/*
  --exclude=*.log
  --exclude=./*.log
  --exclude=*.pid
  --exclude=./*.pid
  --exclude=.DS_Store
  --exclude=./.DS_Store
  --exclude='*/.idea/*'
  --exclude=.idea
  --exclude=.idea/*
  --exclude=./.idea
  --exclude=./.idea/*
  --exclude='*/.vscode/*'
  --exclude=.vscode
  --exclude=.vscode/*
  --exclude=./.vscode
  --exclude=./.vscode/*
  --exclude=*.tsbuildinfo
  --exclude='*/.next.bak.*/*'
  --exclude=.next.bak.*
  --exclude=.next.bak.*/*
  --exclude=.next.broken.*
  --exclude=.next.broken.*/*
  --exclude=./.next.bak.*
  --exclude=./.next.bak.*/*
  --exclude=./.next.broken.*
  --exclude=./.next.broken.*/*
)

if [[ "$include_env" != "1" ]]; then
  tar_excludes+=(--exclude=.env --exclude=.env.*)
fi

log "Archiving project files -> $files_archive"
tar --disable-copyfile --no-xattrs --no-acls -czf "$files_archive" "${tar_excludes[@]}" -C "$repo_root" .

read_env_var_from_file() {
  local key="$1"
  local env_file="$2"
  [[ -f "$env_file" ]] || return 1
  local line
  line="$(grep -E "^[[:space:]]*${key}=" "$env_file" | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  line="${line#*=}"
  line="${line%$'\r'}"
  if [[ "$line" == \"*\" && "$line" == *\" ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "$line"
}

dump_method="skipped"

try_dump_via_docker_compose() {
  command -v docker >/dev/null 2>&1 || return 1
  docker compose -f "$repo_root/docker-compose.yml" ps >/dev/null 2>&1 || return 1
  docker compose -f "$repo_root/docker-compose.yml" ps postgres >/dev/null 2>&1 || return 1

  local db="${POSTGRES_DB:-casino}"
  local user="${POSTGRES_USER:-casino}"

  log "Dumping DB via docker compose (service: postgres) -> $db_dump"
  docker compose -f "$repo_root/docker-compose.yml" exec -T postgres \
    pg_dump -U "$user" -d "$db" -Fc --no-owner --no-acl >"$db_dump"
}

try_dump_via_database_url() {
  command -v pg_dump >/dev/null 2>&1 || return 1
  local url="${DATABASE_URL:-}"
  if [[ -z "$url" ]]; then
    url="$(read_env_var_from_file "DATABASE_URL" "$repo_root/.env" || true)"
  fi
  [[ -n "$url" ]] || return 1

  log "Dumping DB via DATABASE_URL -> $db_dump"
  pg_dump "$url" -Fc --no-owner --no-acl >"$db_dump"
}

if try_dump_via_docker_compose; then
  dump_method="docker-compose postgres pg_dump"
elif try_dump_via_database_url; then
  dump_method="DATABASE_URL pg_dump"
else
  log "Skipping DB dump: no Docker postgres found and no pg_dump + DATABASE_URL available"
fi

if [[ "$include_volume" == "1" ]]; then
  if command -v docker >/dev/null 2>&1; then
    log "Attempting postgres volume backup (can be large)..."
    vol_name="$(docker inspect casino_postgres --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
    if [[ -n "$vol_name" ]]; then
      docker run --rm -v "${vol_name}:/volume:ro" -v "${bundle_dir}:/backup" alpine \
        sh -lc 'tar -czf /backup/postgres_data.tar.gz -C /volume .'
    else
      log "Could not detect postgres data volume from container 'casino_postgres' (skipping volume backup)"
    fi
  else
    log "Docker not available (skipping volume backup)"
  fi
fi

git_rev="unknown"
if command -v git >/dev/null 2>&1; then
  git_rev="$(git -C "$repo_root" rev-parse --short HEAD 2>/dev/null || true)"
  [[ -n "$git_rev" ]] || git_rev="unknown"
fi

{
  echo "created_at=${timestamp}"
  echo "repo_root=${repo_root}"
  echo "git_rev=${git_rev}"
  echo "files_archive=$(basename "$files_archive")"
  echo "db_dump=$(basename "$db_dump")"
  echo "db_dump_method=${dump_method}"
  echo "include_env=${include_env}"
  echo "include_postgres_volume=${include_volume}"
} >"$manifest"

hash_file() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f"
  else
    shasum -a 256 "$f"
  fi
}

: >"$checksums"
hash_file "$files_archive" >>"$checksums"
[[ -f "$db_dump" ]] && hash_file "$db_dump" >>"$checksums"
[[ -f "${bundle_dir}/postgres_data.tar.gz" ]] && hash_file "${bundle_dir}/postgres_data.tar.gz" >>"$checksums"

log "Backup ready: $bundle_dir"
