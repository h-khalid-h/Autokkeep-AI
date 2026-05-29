# Autokkeep Cron Jobs

## Required Cron Jobs

These must be configured in your deployment platform (EasyPanel, Vercel, or external cron service):

| Job | Endpoint | Schedule | Description |
|-----|----------|----------|-------------|
| Plaid Sync | `POST /api/cron/plaid-sync` | Every 4 hours (`0 */4 * * *`) | Syncs new transactions from all connected banks |
| Suspense Timeout | `POST /api/cron/suspense-timeout` | Every 4 hours (`30 */4 * * *`) | Auto-escalates stale escrow_suspense items |
| Weekly Digest | `POST /api/cron/weekly-digest` | Monday 8am UTC (`0 8 * * 1`) | Sends weekly summary email to admins |

## Authentication

All cron endpoints require the `Authorization: Bearer {CRON_SECRET}` header.

## Example: curl

```bash
curl -X POST https://autokkeep.com/api/cron/plaid-sync \
  -H "Authorization: Bearer $CRON_SECRET"
```

## EasyPanel Setup

EasyPanel doesn't support native cron. Use one of:
1. **External cron service**: cron-job.org (free), EasyCron, or a simple VPS crontab
2. **Docker cron sidecar**: Add a lightweight cron container to the docker-compose
3. **Vercel Cron**: If using Vercel as deployment target, crons are defined in vercel.json
