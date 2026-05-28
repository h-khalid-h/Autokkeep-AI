#!/bin/sh
# ============================================
# Autokkeep — Automated PostgreSQL Backup
# Runs daily via cron, retains 7 days
# ============================================

set -e

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/autokkeep_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

echo "[$(date)] Starting backup..."

# Run pg_dump and compress
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
  -h "${POSTGRES_HOST:-db}" \
  -p "${POSTGRES_PORT:-5432}" \
  -U "${POSTGRES_USER:-supabase_admin}" \
  -d "${POSTGRES_DB:-postgres}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip > "${BACKUP_FILE}"

# Get file size
SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
echo "[$(date)] Backup complete: ${BACKUP_FILE} (${SIZE})"

# Remove backups older than retention period
echo "[$(date)] Cleaning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "autokkeep_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -delete

# List remaining backups
echo "[$(date)] Current backups:"
ls -lh "${BACKUP_DIR}"/autokkeep_*.sql.gz 2>/dev/null || echo "  (none)"
echo "[$(date)] Done."
