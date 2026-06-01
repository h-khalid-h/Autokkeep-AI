#!/bin/sh
# ============================================
# AUTOKKEEP — Self-Hosted Cron Scheduler
# ============================================
#
# This script triggers all Autokkeep cron endpoints.
# On Vercel, crons are handled automatically via vercel.json.
# On self-hosted (VPS/Docker), add these to your system crontab:
#
# USAGE:
#   ./scripts/cron.sh <endpoint>
#
# SYSTEM CRONTAB (add via `crontab -e`):
#   */15 * * * * /path/to/scripts/cron.sh auto-categorize
#   */30 * * * * /path/to/scripts/cron.sh ledger-sync
#   0 */4 * * *  /path/to/scripts/cron.sh plaid-sync
#   30 */4 * * * /path/to/scripts/cron.sh suspense-timeout
#   0 */6 * * *  /path/to/scripts/cron.sh token-refresh
#   0 10 * * 1-5 /path/to/scripts/cron.sh receipt-chase
#   0 16 * * 5   /path/to/scripts/cron.sh weekly-digest
#
# ENVIRONMENT VARIABLES (required):
#   APP_URL    - Base URL of the app (e.g., https://autokkeep.com)
#   CRON_SECRET - Must match the CRON_SECRET env var on the server
# ============================================

set -e

ENDPOINT="$1"
APP_URL="${APP_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_SECRET:?CRON_SECRET is required}"

if [ -z "$ENDPOINT" ]; then
  echo "Usage: $0 <endpoint>"
  echo ""
  echo "Available endpoints:"
  echo "  auto-categorize  - Categorize pending transactions (every 15 min)"
  echo "  ledger-sync      - Push approved txns to QBO/Xero (every 30 min)"
  echo "  plaid-sync       - Sync bank transactions via Plaid (every 4h)"
  echo "  suspense-timeout - Move stale txns to suspense (every 4h)"
  echo "  token-refresh    - Refresh expiring OAuth tokens (every 6h)"
  echo "  receipt-chase    - Chase missing receipts (weekdays 10am)"
  echo "  weekly-digest    - Send weekly email digest (Fridays 4pm)"
  exit 1
fi

# All cron routes support GET (Vercel convention)
METHOD="GET"

URL="${APP_URL}/api/cron/${ENDPOINT}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Triggering ${ENDPOINT}..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X "$METHOD" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" \
  "$URL")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ✅ ${ENDPOINT} completed (HTTP ${HTTP_CODE})"
  echo "$BODY" | head -5
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ❌ ${ENDPOINT} failed (HTTP ${HTTP_CODE})"
  echo "$BODY" | head -10
  exit 1
fi
