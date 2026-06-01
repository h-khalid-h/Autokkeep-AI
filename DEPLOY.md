# Autokkeep — Self-Hosted Deployment Checklist

## Required Environment Variables

Set ALL of these on your VPS/EasyPanel:

### Core (Required)
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase-instance.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://autokkeep.com
CRON_SECRET=generate-a-random-64-char-string
```

### AI (Required for categorization)
```env
OPENAI_API_KEY=sk-...
```

### Bank Connection (Required for Plaid)
```env
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ENV=production    # or sandbox for testing
```

### Billing (Required for subscriptions)
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Ledger Sync (Required for QBO/Xero)
```env
QUICKBOOKS_CLIENT_ID=your-client-id
QUICKBOOKS_CLIENT_SECRET=your-secret
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-secret
TOKEN_ENCRYPTION_KEY=generate-a-32-byte-hex-string
```

### Channels (Optional — enable as needed)
```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TEAMS_WEBHOOK_URL=https://...
RESEND_API_KEY=re_...
```

### Admin Dashboard
```env
ADMIN_EMAILS=you@example.com,cto@example.com
```

### Monitoring (Optional but recommended)
```env
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
REDIS_URL=redis://...    # For production rate limiting
```

---

## Database Setup

### First-time setup
```bash
# Apply the full schema
node scripts/migrate.mjs

# Check status
node scripts/migrate.mjs --status

# (Optional) Seed with test data
# Apply seed.sql manually via Supabase SQL editor
```

### After each deploy
The CI/CD pipeline (`deploy.yml`) automatically runs `node scripts/migrate.mjs` after each push to main.

---

## Cron Setup (Self-Hosted)

Since you're not on Vercel, cron jobs must be triggered externally. Copy `scripts/cron.sh` to your VPS and add to system crontab:

```bash
# Edit crontab
crontab -e

# Add these lines (adjust path and APP_URL):
APP_URL=https://autokkeep.com
CRON_SECRET=your-cron-secret

*/15 * * * * APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh auto-categorize >> /var/log/autokkeep-cron.log 2>&1
*/30 * * * * APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh ledger-sync >> /var/log/autokkeep-cron.log 2>&1
0 */4 * * *  APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh plaid-sync >> /var/log/autokkeep-cron.log 2>&1
30 */4 * * * APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh suspense-timeout >> /var/log/autokkeep-cron.log 2>&1
0 */6 * * *  APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh token-refresh >> /var/log/autokkeep-cron.log 2>&1
0 10 * * 1-5 APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh receipt-chase >> /var/log/autokkeep-cron.log 2>&1
0 16 * * 5   APP_URL=$APP_URL CRON_SECRET=$CRON_SECRET /path/to/scripts/cron.sh weekly-digest >> /var/log/autokkeep-cron.log 2>&1
```

---

## Post-Deploy Verification

After deploying, verify the app is working:

```bash
# 1. Health check
curl https://autokkeep.com/api/health

# 2. Test cron auth
curl -X POST https://autokkeep.com/api/cron/auto-categorize \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# 3. Admin dashboard (add your email to ADMIN_EMAILS first)
# Visit: https://autokkeep.com/admin

# 4. Run migrations status
node scripts/migrate.mjs --status
```

---

## Quick Start (Minimum Viable)

To get the core product loop working, you need at minimum:
1. ✅ Supabase (URL + keys)
2. ✅ OpenAI API key
3. ✅ CRON_SECRET
4. ✅ APP_URL
5. ✅ Database migrations applied
6. ✅ Cron scheduler running

Everything else (Stripe, Plaid, channels, compliance) degrades gracefully when keys are missing.
