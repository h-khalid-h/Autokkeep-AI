# Autokkeep OS — Deployment Guide

## Prerequisites

- Node.js 20+
- A Supabase project (free tier works)
- API keys: OpenAI, Plaid, Stripe
- Docker (for EasyPanel deployment)

---

## Step 1: Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the database schema:
   ```bash
   # In Supabase SQL Editor, run in order:
   src/lib/supabase/schema.sql
   src/lib/supabase/migrations/001_rls_policies.sql
   src/lib/supabase/migrations/002_period_locking.sql
   src/lib/supabase/migrations/003_escrow_suspense.sql
   src/lib/supabase/migrations/004_enum_alignment.sql
   src/lib/supabase/migrations/005_audit_columns.sql
   src/lib/supabase/migrations/006_double_entry_invariant.sql
   src/lib/supabase/migrations/007_citation_engine.sql
   src/lib/supabase/migrations/008_performance_indexes.sql
   ```
3. Enable RLS on all tables (should be enabled by default from migration 001)
4. Configure Auth:
   - Enable email/password sign-up
   - Set redirect URLs to your production domain
   - Optional: Enable MFA via TOTP

---

## Step 2: Environment Variables

Copy `.env.example` to `.env.local` and fill in all required values:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` — Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)
- `OPENAI_API_KEY` — For AI categorization
- `PLAID_CLIENT_ID` + `PLAID_SECRET` — For bank connections
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — For billing
- `NEXT_PUBLIC_APP_URL` — Your production URL
- `CRON_SECRET` — Secret for authenticating cron job requests

Optional:
- `REDIS_URL` — For rate limiting and billing counters (strongly recommended)
- `TOKEN_ENCRYPTION_KEY` — 32-byte hex key for encrypting OAuth tokens
- `NEXT_PUBLIC_SENTRY_DSN` — For error tracking
- `RESEND_API_KEY` — For email notifications

---

## Step 3: Deploy

### Option A: EasyPanel (Recommended for Self-Hosting)

EasyPanel provides a Docker-based deployment with built-in SSL, monitoring, and GitHub auto-deploy.

1. **Create an EasyPanel project** named `autokkeep-ai`
2. **Add the app service:**
   - Source: GitHub repository
   - Branch: `main`
   - Root directory: `autokkeep`
   - Build: Dockerfile (multi-stage, uses `Dockerfile` in the autokkeep directory)
   - Port: `3000`
3. **Configure environment variables** in the EasyPanel dashboard (all vars from `.env.example`)
4. **Add a Redis service** (Redis 7 Alpine):
   - Service name: `autokkeep-redis`
   - Set `REDIS_URL=redis://autokkeep-ai-autokkeep-redis:6379` in the app's env
5. **Enable HTTPS** via EasyPanel's built-in Let's Encrypt
6. **Set up health check:**
   - Path: `/api/health`
   - Interval: 30s
   - Timeout: 10s
7. **Set up cron jobs** (EasyPanel doesn't have native cron — use an external service):
   - See `docker/cron/README.md` for the full schedule
   - Recommended: [cron-job.org](https://cron-job.org) (free)

### Option B: Vercel

1. Import the repository in Vercel
2. Set root directory to `autokkeep`
3. Framework: Next.js (auto-detected)
4. Add all environment variables
5. Cron jobs are defined in `vercel.json` (requires Vercel Pro plan)
6. Deploy

---

## Step 4: Post-Deployment

### Verify

1. Visit your domain — landing page should load
2. Test signup flow: create account → onboarding → dashboard
3. Test the Shadow Audit demo (no signup required)
4. Check health endpoint: `GET /api/health`

### Configure Webhooks

- **Stripe**: Set webhook endpoint to `https://yourdomain.com/api/webhooks/stripe`
- **Plaid**: Set webhook endpoint to `https://yourdomain.com/api/webhooks/plaid`

### Set Up Monitoring

1. **Sentry** — Install `@sentry/nextjs` and configure DSN for error tracking
2. **Uptime** — Use BetterStack, UptimeRobot, or Checkly to monitor `/api/health`
3. **Logs** — Check EasyPanel container logs or Vercel function logs

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails with TypeScript errors | Run `npm run lint` locally first |
| Auth redirects not working | Check `NEXT_PUBLIC_APP_URL` matches your domain |
| Webhooks returning 401 | Verify webhook secrets match in env vars |
| Cron jobs not running | EasyPanel: Use external cron service. Vercel: Requires Pro plan. |
| Rate limiting not working | Check `REDIS_URL` is set and Redis container is running |
| AI categorization failing | Check `OPENAI_API_KEY` is valid and has credits |
| Plaid connection errors | Verify `PLAID_ENV` matches your Plaid dashboard (sandbox/development/production) |
