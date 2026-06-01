# Autokkeep — Deployment Guide

## Architecture

Autokkeep runs as a **self-hosted Next.js app** on **EasyPanel** (`host.datac.com`).

```
┌─────────────────────────────────────┐
│  EasyPanel (host.datac.com)         │
│                                     │
│  ┌─────────────────────────┐        │
│  │  autokkeep-app          │        │
│  │  (Next.js standalone)   │ :3000  │
│  │  Docker container       │        │
│  └──────────┬──────────────┘        │
│             │                       │
│  ┌──────────┴──────────────┐        │
│  │  autokkeep-supabase     │        │
│  │  (Self-hosted Supabase) │        │
│  │  PostgreSQL + Auth +    │        │
│  │  REST + Realtime        │        │
│  └─────────────────────────┘        │
└─────────────────────────────────────┘
```

## EasyPanel Setup

### 1. Create App Service

In EasyPanel dashboard:
- **Service Type**: App
- **Source**: GitHub → `h-khalid-h/Autokkeep-AI` → `main` branch
- **Build Method**: Dockerfile
- **Port**: 3000

### 2. Build Arguments (NEXT_PUBLIC_ vars)

These must be set as **build arguments** because Next.js inlines them at build time:

| Build Arg | Value |
|-----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://autokkeep-ai-autokkeep-supabase.host.datac.com` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_APP_URL` | `https://autokkeep.com` |
| `NEXT_PUBLIC_SENTRY_DSN` | Your Sentry DSN (optional) |

### 3. Runtime Environment Variables

Set these as **environment variables** in EasyPanel:

#### Core (Required)
```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CRON_SECRET=<generate with: openssl rand -hex 32>
OPENAI_API_KEY=sk-...
```

#### Bank Connection (Plaid)
```
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=production
PLAID_WEBHOOK_URL=https://autokkeep.com/api/webhooks/plaid
```

#### Billing (Stripe)
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_GROWTH_MONTHLY=price_...
STRIPE_PRICE_PRO_MONTHLY=price_...
```

#### Ledger Sync (QuickBooks/Xero)
```
QBO_CLIENT_ID=...
QBO_CLIENT_SECRET=...
QBO_REDIRECT_URI=https://autokkeep.com/api/ledger/quickbooks/callback
QBO_ENVIRONMENT=production
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_REDIRECT_URI=https://autokkeep.com/api/ledger/xero/callback
TOKEN_ENCRYPTION_KEY=<generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

#### Messaging Channels (Optional)
```
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_WHATSAPP_NUMBER=whatsapp:+1...
TEAMS_WEBHOOK_URL=https://...
TEAMS_WEBHOOK_SECRET=...
```

#### Email (Resend)
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Autokkeep <noreply@autokkeep.com>
```

#### Admin Dashboard
```
ADMIN_EMAILS=you@example.com
```

#### Optional Services
```
REDIS_URL=redis://...
SENTRY_DSN=https://...@sentry.io/...
```

### 4. Domain Configuration

In EasyPanel → Domains:
- **Domain**: `autokkeep.com`
- **Port**: 3000
- **HTTPS**: Enable (Let's Encrypt)

### 5. Health Check

The Dockerfile includes a `HEALTHCHECK` instruction that EasyPanel will use:
```
curl -sf http://localhost:3000/api/health
```

EasyPanel will show the container as healthy/unhealthy based on this.

---

## Cron Jobs

Autokkeep has 7 automated cron jobs. On EasyPanel, configure these via **EasyPanel's Cron Jobs** feature or use the system crontab on the VPS.

### Option A: EasyPanel Cron Jobs (Recommended)

In EasyPanel → Cron Jobs, add these HTTP triggers:

| Schedule | Method | URL | Header |
|----------|--------|-----|--------|
| `*/15 * * * *` | GET | `https://autokkeep.com/api/cron/auto-categorize` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `*/30 * * * *` | GET | `https://autokkeep.com/api/cron/ledger-sync` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `0 */4 * * *` | GET | `https://autokkeep.com/api/cron/plaid-sync` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `30 */4 * * *` | GET | `https://autokkeep.com/api/cron/suspense-timeout` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `0 */6 * * *` | GET | `https://autokkeep.com/api/cron/token-refresh` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `0 10 * * 1-5` | GET | `https://autokkeep.com/api/cron/receipt-chase` | `Authorization: Bearer YOUR_CRON_SECRET` |
| `0 16 * * 5` | GET | `https://autokkeep.com/api/cron/weekly-digest` | `Authorization: Bearer YOUR_CRON_SECRET` |

### Option B: System Crontab

SSH into the VPS and add to crontab:

```bash
crontab -e
```

```cron
# Autokkeep Cron Jobs
CRON_SECRET=your-cron-secret
APP_URL=https://autokkeep.com

*/15 * * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/auto-categorize > /dev/null 2>&1
*/30 * * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/ledger-sync > /dev/null 2>&1
0 */4 * * *  curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/plaid-sync > /dev/null 2>&1
30 */4 * * * curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/suspense-timeout > /dev/null 2>&1
0 */6 * * *  curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/token-refresh > /dev/null 2>&1
0 10 * * 1-5 curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/receipt-chase > /dev/null 2>&1
0 16 * * 5   curl -sf -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/weekly-digest > /dev/null 2>&1
```

### Option C: Cron Script

Use the bundled script:
```bash
APP_URL=https://autokkeep.com CRON_SECRET=your-secret ./scripts/cron.sh auto-categorize
```

---

## Database Migrations

### Run Migrations

From the container or CI:
```bash
node scripts/migrate.mjs
```

### Check Migration Status
```bash
node scripts/migrate.mjs --status
```

### CI/CD Auto-Migration

The GitHub Actions workflow (`deploy.yml`) automatically runs migrations after each push to `main`. It needs these GitHub Secrets:
- `SUPABASE_URL` — Your Supabase REST URL
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key
- `SUPABASE_ANON_KEY` — For health check

---

## Post-Deploy Verification

```bash
# 1. Health check
curl -s https://autokkeep.com/api/health | jq .

# 2. Cron auth test
curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://autokkeep.com/api/cron/auto-categorize | jq .

# 3. Supabase connectivity
curl -s -o /dev/null -w "%{http_code}" \
  https://autokkeep-ai-autokkeep-supabase.host.datac.com/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY"
# Should return 200

# 4. Admin dashboard
# Visit: https://autokkeep.com/admin
# (requires ADMIN_EMAILS to include your email)
```

---

## Troubleshooting

### Container won't start
- Check build logs for missing build args
- Verify NEXT_PUBLIC_ vars are set as **build args**, not just env vars

### 502 Bad Gateway
- Container might be starting up (health check has 15s start period)
- Check container logs: `docker logs autokkeep-app`

### Crons not running
- Verify `CRON_SECRET` matches between env vars and cron configuration
- Test manually: `curl -H "Authorization: Bearer SECRET" https://autokkeep.com/api/cron/auto-categorize`

### Transactions not categorizing
1. Check Plaid webhook is registered: `PLAID_WEBHOOK_URL`
2. Check OpenAI key: `OPENAI_API_KEY`
3. Check auto-categorize cron is scheduled
4. Check logs for errors

### OAuth token expired
- Token refresh cron should handle this automatically
- If tokens are expired, disconnect and reconnect in Settings → Integrations
