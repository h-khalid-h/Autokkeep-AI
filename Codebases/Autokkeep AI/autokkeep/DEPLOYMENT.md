# Autokkeep — Production Deployment Guide

## Prerequisites
- Node.js 18+ and npm
- Supabase project (free tier works for development)
- Vercel account (free hobby or Pro)
- Plaid developer account
- Stripe account
- OpenAI API key

## Step 1: Supabase Setup

### 1.1 Create Project
1. Go to supabase.com and create a new project
2. Note your Project URL and Anon Key (Settings → API)
3. Note your Service Role Key (Settings → API → service_role)

### 1.2 Run Schema
1. Go to SQL Editor in Supabase Dashboard
2. Run `src/lib/supabase/schema.sql` — creates all 14 tables
3. Run `src/lib/supabase/rls.sql` — enables Row Level Security
4. (Optional) Run `src/lib/supabase/seed.sql` — adds sample data

### 1.3 Enable Realtime
1. Go to Database → Replication
2. Enable realtime for the `transactions` table

### 1.4 Configure Auth
1. Authentication → Settings
2. Set Site URL to your production domain
3. Add redirect URLs:
   - `https://yourdomain.com/auth/callback`
   - `http://localhost:3000/auth/callback` (for dev)
4. Enable Email/Password sign-up

## Step 2: Third-Party Services

### 2.1 Plaid
1. Sign up at plaid.com/docs
2. Create a new app
3. Note Client ID and Secret
4. Set webhook URL to `https://yourdomain.com/api/webhooks/plaid`
5. Use `sandbox` environment for testing, `production` for live

### 2.2 Stripe
1. Create a Stripe account
2. Set up Products and Prices for each plan tier
3. Note your API keys
4. Create a webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
5. Subscribe to events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

### 2.3 OpenAI
1. Get an API key from platform.openai.com
2. Recommended: Set up usage limits

### 2.4 Slack (Optional)
1. Create a Slack App at api.slack.com/apps
2. Add OAuth scopes: `chat:write`, `commands`, `files:read`
3. Set OAuth redirect URL to `https://yourdomain.com/api/channels/slack/install`
4. Set Event subscription URL to `https://yourdomain.com/api/channels/slack/events`
5. Set Interactive URL to `https://yourdomain.com/api/channels/slack/interact`

### 2.5 Twilio (Optional, for SMS/WhatsApp)
1. Create a Twilio account
2. Get a phone number with SMS capability
3. Set SMS webhook URL to `https://yourdomain.com/api/channels/sms`
4. For WhatsApp: set up WhatsApp sandbox, webhook to `https://yourdomain.com/api/channels/whatsapp`
5. Set status callback URL to `https://yourdomain.com/api/webhooks/twilio`

### 2.6 QuickBooks (Optional)
1. Create a QuickBooks Developer account
2. Create an app at developer.intuit.com
3. Set redirect URI to `https://yourdomain.com/api/ledger/quickbooks/auth`
4. Note Client ID and Client Secret

### 2.7 Xero (Optional)
1. Create a Xero Developer account
2. Create an app at developer.xero.com
3. Set redirect URI to `https://yourdomain.com/api/ledger/xero/auth`
4. Note Client ID and Client Secret

## Step 3: Deploy to Vercel

### 3.1 Connect Repository
1. Go to vercel.com and import your GitHub repo
2. Set the Root Directory to `Codebases/Autokkeep AI/autokkeep`
3. Framework: Next.js (auto-detected)

### 3.2 Environment Variables
Add ALL variables from `.env.example` in the Vercel dashboard (Settings → Environment Variables).

Required for basic functionality:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Required for payments:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Required for banking:
- `PLAID_CLIENT_ID`
- `PLAID_SECRET`
- `PLAID_ENV` (sandbox/production)

Set `CRON_SECRET` to a random string for the Plaid sync cron job.

### 3.3 Deploy
1. Click Deploy
2. Vercel will build and deploy automatically
3. The cron job (`/api/cron/plaid-sync`) runs every 4 hours automatically

## Step 4: Post-Deployment

### 4.1 Verify
- Landing page loads at your domain
- Sign up creates a user in Supabase Auth
- Onboarding flow works
- Dashboard shows (empty state or seed data)

### 4.2 Custom Domain
1. Vercel → Settings → Domains
2. Add your domain and update DNS
3. Update Supabase Site URL to match
4. Update all webhook URLs to use your domain

### 4.3 Monitoring
- Vercel: Analytics, Logs
- Supabase: Dashboard → Logs
- Stripe: Dashboard → Developers → Logs
- Plaid: Dashboard → Logs

## Troubleshooting

### Build fails with TypeScript errors
Run `npx next build` locally first to catch errors.

### Auth redirects not working
Ensure your domain is in Supabase Auth → URL Configuration → Redirect URLs.

### Webhooks not receiving
Check that your webhook URLs use HTTPS and your secrets match.

### Cron job not running
Vercel cron requires a Pro plan. Check vercel.json for the schedule.
