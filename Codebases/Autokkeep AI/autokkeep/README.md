# 🔮 Autokkeep

> **The end of the monthly close.** Autonomous bookkeeping for modern businesses.

Autokkeep is an AI-native autonomous bookkeeping engine that replaces reactive, manual data entry with proactive, AI-driven autonomous ledger management. It transforms bookkeeping from a historical chore into a real-time strategic asset.

---

## Architecture

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, CSS |
| **Backend** | Next.js API Routes (Edge) |
| **Database** | Supabase (PostgreSQL), Row-Level Security |
| **AI Engine** | OpenAI GPT-4o (Structured JSON Output) |
| **Banking** | Plaid (Transactions Sync) |
| **Ledger** | QuickBooks Online, Xero |
| **Channels** | Slack, Microsoft Teams, SMS, WhatsApp |
| **Billing** | Stripe (Subscriptions + Plan Enforcement) |
| **Auth** | Supabase Auth (SSR Sessions) |

### Transaction Pipeline

```
Bank (Plaid) → Sync → AI Categorize → Auto-Approve / HITL Review → Journal Entry → Ledger Sync (QBO/Xero)
                                              ↓
                                   Receipt Chase (Slack/Teams/SMS/WhatsApp)
```

1. **Sync** — Plaid pulls transactions via cursor-based pagination
2. **Categorize** — Dual-engine AI: deterministic rules first, then GPT-4o probabilistic fallback
3. **Auto-Approve** — Transactions ≥95% confidence are auto-approved; <95% flagged for HITL review
4. **Receipt Chase** — Multi-channel dispatch requests missing receipts from cardholders
5. **Journal Entry** — Double-entry validated journal entries created automatically
6. **Ledger Sync** — Posted to QuickBooks Online or Xero via OAuth2

## Features

### 🤖 Dual-Engine AI Categorization
- **Deterministic Engine**: Exact-match rules, vendor patterns, MCC codes → 100% confidence
- **Probabilistic Engine**: OpenAI GPT-4o with structured output → confidence scoring
- Auto-approve ≥95% confidence, flag <95% for human review
- Learning loop: human corrections feed back into rules

### 🏦 Bank Integrations (Plaid)
- One-click bank account connection via Plaid Link
- Real-time transaction sync with cursor-based pagination
- Automatic webhook processing for new transactions

### 📗 Ledger Sync (QuickBooks + Xero)
- OAuth2 connection flow for both platforms
- Chart of Accounts sync
- Journal entry creation (double-entry validated)
- Automatic token refresh

### 💬 Multi-Channel Receipt Chase
- **Slack**: Interactive messages with approve/reject/categorize buttons
- **Microsoft Teams**: Adaptive Cards via incoming webhooks
- **SMS**: Two-way text messaging via Twilio
- **WhatsApp**: Receipt requests via Twilio WhatsApp Business
- **Unified Dispatcher**: Priority-based routing with fallback

### 💳 Stripe Billing & Plan Enforcement
- CPA Firm and SMB pricing tiers (free → enterprise)
- Checkout sessions + Customer Portal
- Webhook processing for subscription lifecycle
- **Runtime plan enforcement** via `checkPlanLimits()` on all billable operations:
  - Transaction processing, bank connections, ledger sync, channel dispatch

### 🔐 Security
- Supabase Row-Level Security on all 16 tables
- Org-based access control (owner/admin/accountant/viewer)
- Auth middleware protecting all routes
- Immutable audit log

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- A [Supabase](https://supabase.com) project
- API keys for integrations you want to enable

### 1. Clone & Install

```bash
git clone <repo-url>
cd autokkeep
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys. See [`.env.example`](.env.example) for the full list with documentation.

**Minimum required:**
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for AI categorization)

### 3. Set Up Database

Run the SQL migrations in your Supabase SQL Editor (in order):

1. Execute `src/lib/supabase/schema.sql` — creates 16 tables, enums, triggers, indexes
2. Execute `src/lib/supabase/migrations/001_rls_policies.sql` — Row-Level Security for all 16 tables
3. Execute `src/lib/supabase/migrations/002_period_locking.sql` — accounting period locking
4. Execute `src/lib/supabase/migrations/003_escrow_suspense.sql` — escrow_suspense transaction status

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel

```bash
npx vercel
```

Set all environment variables in the Vercel dashboard. Update webhook URLs for:
- Plaid: `https://yourdomain.com/api/webhooks/plaid`
- Stripe: `https://yourdomain.com/api/webhooks/stripe`
- Twilio: `https://yourdomain.com/api/webhooks/twilio`
- Slack: `https://yourdomain.com/api/channels/slack/events`

---

## Environment Variables

All environment variables are documented in [`.env.example`](.env.example), organized by integration:

| Section | Variables | Required |
|---------|-----------|----------|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ |
| **OpenAI** | `OPENAI_API_KEY`, `OPENAI_MODEL` | ✅ |
| **Plaid** | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | For banking |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_*` | For billing |
| **Slack** | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` | Optional |
| **Teams** | `TEAMS_WEBHOOK_URL` | Optional |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER` | Optional |
| **QuickBooks** | `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENVIRONMENT` | Optional |
| **Xero** | `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` | Optional |
| **App** | `NEXT_PUBLIC_APP_URL` | ✅ |

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ai/categorize` | POST | Categorize single transaction (dual-engine) |
| `/api/ai/batch` | POST | Batch categorize transactions |
| `/api/plaid/link-token` | POST | Create Plaid Link token |
| `/api/plaid/exchange` | POST | Exchange public token + setup connection ⛔ |
| `/api/plaid/sync` | POST | Sync transactions from Plaid |
| `/api/transactions` | GET/POST | List/create transactions |
| `/api/transactions/[id]` | GET/PUT/DELETE | Transaction CRUD |
| `/api/transactions/process` | POST | Full pipeline orchestrator ⛔ |
| `/api/channels/slack/install` | GET | Slack OAuth install |
| `/api/channels/slack/events` | POST | Slack Events API |
| `/api/channels/slack/interact` | POST | Interactive messages |
| `/api/channels/teams/webhook` | POST | Teams webhook |
| `/api/channels/sms` | POST | SMS handler |
| `/api/channels/whatsapp` | POST | WhatsApp handler |
| `/api/channels/dispatch` | POST | Unified dispatch ⛔ |
| `/api/ledger/quickbooks/auth` | GET/POST | QBO OAuth flow |
| `/api/ledger/quickbooks/sync` | GET/POST | QBO sync ⛔ |
| `/api/ledger/xero/auth` | GET/POST | Xero OAuth flow |
| `/api/ledger/xero/sync` | GET/POST | Xero sync ⛔ |
| `/api/billing/checkout` | POST | Stripe checkout session |
| `/api/billing/portal` | POST | Customer portal |
| `/api/transactions/[id]/receipt` | POST | Receipt image upload |
| `/api/transactions/export` | GET | CSV export |
| `/api/account/delete` | POST | Account deletion (GDPR) |
| `/api/audit` | GET | Audit log |
| `/api/contact` | POST | Contact form |
| `/api/dashboard/stats` | GET | Dashboard statistics |
| `/api/chart-of-accounts` | GET/POST | Chart of accounts CRUD |
| `/api/cron/plaid-sync` | GET | Automated Plaid sync (cron) |
| `/api/cron/suspense-timeout` | GET | 48h suspense timeout (cron) |
| `/api/webhooks/plaid` | POST | Plaid webhooks |
| `/api/webhooks/stripe` | POST | Stripe webhooks |
| `/api/webhooks/twilio` | POST | Twilio callbacks |

> ⛔ = Plan-enforced route (uses `checkPlanLimits`)

---

## Database Schema

16 tables with full referential integrity:

| Table | Description |
|-------|-------------|
| `organizations` | Multi-tenant org container |
| `entities` | Bookkeeping entities (companies/clients) |
| `bank_connections` | Plaid connections |
| `bank_accounts` | Individual bank accounts |
| `chart_of_accounts` | GL codes |
| `transactions` | Financial transactions |
| `categorization_rules` | Deterministic matching rules |
| `journal_entries` | Double-entry journal headers |
| `journal_lines` | Debit/credit lines (balanced constraint) |
| `audit_log` | Immutable audit trail |
| `channel_connections` | Slack/Teams/SMS/WhatsApp connections |
| `receipt_requests` | Outstanding receipt requests |
| `ledger_connections` | QBO/Xero OAuth tokens |
| `subscriptions` | Stripe billing |
| `team_members` | Role-based access |
| `categorization_history` | Merchant → GL code learning data |
| `accounting_periods` | Period locking for immutability |

Full schema: [`src/lib/supabase/schema.sql`](src/lib/supabase/schema.sql)

---

## Project Structure

```
autokkeep/
├── src/
│   ├── app/
│   │   ├── api/                    # 37 API routes
│   │   │   ├── ai/                 # AI categorization
│   │   │   ├── billing/            # Stripe billing
│   │   │   ├── channels/           # Slack/Teams/SMS/WhatsApp
│   │   │   ├── contact/            # Contact form
│   │   │   ├── ledger/             # QuickBooks/Xero
│   │   │   ├── plaid/              # Bank integrations
│   │   │   ├── transactions/       # Transaction CRUD + pipeline
│   │   │   └── webhooks/           # Plaid/Stripe/Twilio
│   │   ├── auth/                   # Login/Signup/Callback
│   │   ├── dashboard/              # Exception review dashboard
│   │   ├── settings/               # Integrations/Billing/Team
│   │   ├── globals.css             # Design system
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Landing page
│   ├── components/
│   │   ├── dashboard/              # Dashboard components
│   │   └── landing/                # Landing page sections
│   ├── data/
│   │   └── mockTransactions.ts     # Demo data
│   └── lib/
│       ├── ai/                     # Categorization engine
│       ├── billing/                # Plan definitions & enforcement
│       ├── channels/               # Channel libraries
│       ├── ledger/                 # Ledger sync engine
│       ├── plaid/                  # Plaid client
│       └── supabase/               # DB, Auth, RLS, Types
├── .env.example                    # Environment template (documented)
└── package.json
```

---

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Pricing Model & Unit Economics](docs/PRICING.md)
- [Investor Pitch Narrative](docs/PITCH.md)

---

## License

Proprietary © 2026 Autokkeep. All rights reserved.
