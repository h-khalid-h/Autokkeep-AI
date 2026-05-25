# 🔮 Autokkeep

> **The end of the monthly close.** Autonomous bookkeeping for modern businesses.

Autokkeep is an AI-native autonomous bookkeeping engine that replaces reactive, manual data entry with proactive, AI-driven autonomous ledger management. It transforms bookkeeping from a historical chore into a real-time strategic asset.

---

## Architecture

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, CSS |
| **Backend** | Next.js API Routes (Edge) |
| **Database** | Supabase (PostgreSQL), Row-Level Security |
| **AI Engine** | OpenAI GPT-4o (Structured JSON Output) |
| **Banking** | Plaid (Transactions Sync) |
| **Ledger** | QuickBooks Online, Xero |
| **Channels** | Slack, Microsoft Teams, SMS, WhatsApp |
| **Billing** | Stripe (Subscriptions) |
| **Auth** | Supabase Auth (SSR Sessions) |

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

### 💳 Stripe Billing
- CPA Firm and SMB pricing tiers
- Checkout sessions + Customer Portal
- Webhook processing for subscription lifecycle

### 🔐 Security
- Supabase Row-Level Security on all 15 tables
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

### 1. Install Dependencies

```bash
cd autokkeep
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your API keys. At minimum, you need:
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY` (for AI categorization)

### 3. Set Up Database

Run the SQL migrations in your Supabase SQL Editor:

1. Execute `src/lib/supabase/schema.sql` — creates 15 tables, enums, triggers, indexes
2. Execute `src/lib/supabase/rls.sql` — enables Row-Level Security

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

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/ai/categorize` | POST | Categorize single transaction |
| `/api/ai/batch` | POST | Batch categorize transactions |
| `/api/plaid/link-token` | POST | Create Plaid Link token |
| `/api/plaid/exchange` | POST | Exchange public token |
| `/api/plaid/sync` | POST | Sync transactions |
| `/api/transactions` | GET/POST | List/create transactions |
| `/api/transactions/[id]` | GET/PUT/DELETE | Transaction CRUD |
| `/api/transactions/process` | POST | Full pipeline orchestrator |
| `/api/channels/slack/install` | GET | Slack OAuth install |
| `/api/channels/slack/events` | POST | Slack Events API |
| `/api/channels/slack/interact` | POST | Interactive messages |
| `/api/channels/teams/webhook` | POST | Teams webhook |
| `/api/channels/sms` | POST | SMS handler |
| `/api/channels/whatsapp` | POST | WhatsApp handler |
| `/api/channels/dispatch` | POST | Unified dispatch |
| `/api/ledger/quickbooks/auth` | GET/POST | QBO OAuth |
| `/api/ledger/quickbooks/sync` | GET/POST | QBO sync |
| `/api/ledger/xero/auth` | GET/POST | Xero OAuth |
| `/api/ledger/xero/sync` | GET/POST | Xero sync |
| `/api/billing/checkout` | POST | Stripe checkout |
| `/api/billing/portal` | POST | Customer portal |
| `/api/webhooks/plaid` | POST | Plaid webhooks |
| `/api/webhooks/stripe` | POST | Stripe webhooks |
| `/api/webhooks/twilio` | POST | Twilio callbacks |

---

## Database Schema

15 tables with full referential integrity:

- `organizations` — Multi-tenant org container
- `entities` — Bookkeeping entities (companies/clients)
- `bank_connections` — Plaid connections
- `bank_accounts` — Individual bank accounts
- `chart_of_accounts` — GL codes
- `transactions` — Financial transactions
- `categorization_rules` — Deterministic matching rules
- `journal_entries` — Double-entry journal headers
- `journal_lines` — Debit/credit lines (balanced constraint)
- `audit_log` — Immutable audit trail
- `channel_connections` — Slack/Teams/SMS/WhatsApp connections
- `receipt_requests` — Outstanding receipt requests
- `ledger_connections` — QBO/Xero OAuth tokens
- `subscriptions` — Stripe billing
- `team_members` — Role-based access

---

## Project Structure

```
autokkeep/
├── src/
│   ├── app/
│   │   ├── api/                    # 24 API routes
│   │   │   ├── ai/                 # AI categorization
│   │   │   ├── billing/            # Stripe billing
│   │   │   ├── channels/           # Slack/Teams/SMS/WhatsApp
│   │   │   ├── ledger/             # QuickBooks/Xero
│   │   │   ├── plaid/              # Bank integrations
│   │   │   ├── transactions/       # Transaction CRUD
│   │   │   └── webhooks/           # Plaid/Stripe/Twilio
│   │   ├── auth/                   # Login/Signup/Callback
│   │   ├── dashboard/              # Exception review dashboard
│   │   ├── settings/               # Integrations/Billing/Team
│   │   ├── globals.css             # Design system (2,300+ lines)
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Landing page
│   ├── components/
│   │   ├── dashboard/              # Dashboard components
│   │   └── landing/                # Landing page sections
│   ├── data/
│   │   └── mockTransactions.ts     # Demo data
│   └── lib/
│       ├── ai/                     # Categorization engine
│       ├── channels/               # Channel libraries
│       ├── ledger/                  # Ledger sync engine
│       ├── plaid/                   # Plaid client
│       └── supabase/               # DB, Auth, RLS, Types
├── docs/
│   ├── PRD.md                      # Product Requirements
│   ├── ARCHITECTURE.md             # System Architecture
│   ├── PRICING.md                  # Pricing Model
│   └── PITCH.md                    # Investor Pitch
├── .env.example                    # Environment template
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
