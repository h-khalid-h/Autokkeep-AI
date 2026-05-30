#!/bin/sh
# ============================================
# Autokkeep — Cron Job Runner
# Triggers the app's cron API endpoints
# ============================================

ENDPOINT=$1
APP_URL="${APP_URL:-http://autokkeep-app:3000}"

echo "[$(date)] Triggering ${ENDPOINT}..."

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/cron/${ENDPOINT}")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  echo "[$(date)] ✅ ${ENDPOINT} completed (HTTP ${HTTP_CODE})"
else
  echo "[$(date)] ❌ ${ENDPOINT} failed (HTTP ${HTTP_CODE}): ${BODY}"
fi
