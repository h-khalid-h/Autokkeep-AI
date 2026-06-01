#!/bin/sh
# ============================================
# Autokkeep — Cron Job Runner
# Triggers the app's cron API endpoints
# ============================================

ENDPOINT=$1
APP_URL="${APP_URL:-http://autokkeep-app:3000}"

if [ -z "$ENDPOINT" ]; then
  echo "Usage: $0 <endpoint>"
  echo ""
  echo "Available endpoints:"
  echo "  auto-categorize   - Categorize pending transactions (every 15 min)"
  echo "  ledger-sync       - Push approved txns to QBO/Xero (every 30 min)"
  echo "  plaid-sync        - Sync bank transactions via Plaid (every 4h)"
  echo "  suspense-timeout  - Escalate stale suspense items (every 4h)"
  echo "  token-refresh     - Refresh expiring OAuth tokens (every 6h)"
  echo "  receipt-chase     - Chase missing receipts (weekdays 10am)"
  echo "  weekly-digest     - Send weekly email digest (Fridays 4pm)"
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "[$(date)] ❌ CRON_SECRET not set"
  exit 1
fi

echo "[$(date)] Triggering ${ENDPOINT}..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/${ENDPOINT}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ] 2>/dev/null; then
  echo "[$(date)] ✅ ${ENDPOINT} completed (HTTP ${HTTP_CODE})"
else
  echo "[$(date)] ❌ ${ENDPOINT} failed (HTTP ${HTTP_CODE}): ${BODY}"
fi
