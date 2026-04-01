#!/usr/bin/env bash
set -euo pipefail

# PersonalFi — Database backup script
# Usage: npm run backup  OR  bash scripts/backup.sh [backup_dir]

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB_DIR="${DB_DIR:-$PROJECT_DIR}"
DB_FILE="${DB_DIR}/personalfi.db"
BACKUP_DIR="${1:-${PROJECT_DIR}/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/personalfi_${TIMESTAMP}.db"

if [ ! -f "$DB_FILE" ]; then
  echo "Error: Database not found at ${DB_FILE}"
  echo "Set DB_DIR env variable to the directory containing personalfi.db"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Use SQLite's backup API via .backup command for consistency (WAL-safe)
sqlite3 "$DB_FILE" ".backup '${BACKUP_FILE}'"

if [ -f "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "Backup created: ${BACKUP_FILE} (${SIZE})"
else
  echo "Error: Backup failed"
  exit 1
fi

# Rotate: keep last 10 backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "personalfi_*.db" -type f | wc -l)
if [ "$BACKUP_COUNT" -gt 10 ]; then
  find "$BACKUP_DIR" -name "personalfi_*.db" -type f | sort | head -n -10 | xargs rm -f
  echo "Rotated old backups (kept last 10)"
fi
