# Autokkeep Cron Sidecar

Lightweight Alpine container that triggers Autokkeep's cron API endpoints on schedule.

EasyPanel does **not** have a native cron feature, so this container runs as a sidecar service within the `autokkeep-ai` project.

## EasyPanel Service Configuration

| Setting | Value |
|---------|-------|
| **Service Name** | `autokkeep-cron` |
| **Source** | GitHub → `h-khalid-h/Autokkeep-AI` → `main` |
| **Source Path** | `/docker/cron` |
| **Build Method** | Dockerfile |
| **Dockerfile Path** | `Dockerfile` |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `APP_URL` | Internal URL of the main app (e.g., `http://autokkeep-ai_autokkeep-app:3000`) |
| `CRON_SECRET` | Must match the `CRON_SECRET` on the main app service |

## Cron Schedule (7 jobs)

| Job | Endpoint | Schedule | Description |
|-----|----------|----------|-------------|
| Auto-categorize | `auto-categorize` | `*/15 * * * *` | Categorize pending transactions via AI |
| Ledger sync | `ledger-sync` | `*/30 * * * *` | Push approved txns to QBO/Xero |
| Plaid sync | `plaid-sync` | `0 */4 * * *` | Sync bank transactions via Plaid |
| Suspense timeout | `suspense-timeout` | `30 */4 * * *` | Escalate stale escrow_suspense items |
| Token refresh | `token-refresh` | `0 */6 * * *` | Refresh expiring OAuth tokens |
| Receipt chase | `receipt-chase` | `0 10 * * 1-5` | Chase missing receipts (weekdays 10am UTC) |
| Weekly digest | `weekly-digest` | `0 16 * * 5` | Send weekly summary email (Fridays 4pm UTC) |

## Authentication

All cron endpoints require the `Authorization: Bearer {CRON_SECRET}` header.

## Testing

```bash
# Test a single endpoint manually
docker exec autokkeep-cron /usr/local/bin/trigger.sh plaid-sync
```

## Debugging

```bash
# View cron logs inside the container
docker exec autokkeep-cron cat /var/log/cron.log
```
