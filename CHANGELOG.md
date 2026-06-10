# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

## [1.0.0] - 2026-06-10

### Added

- **AI Categorization Engine**
  - Complete dual-engine AI categorization (deterministic rules + GPT-4o probabilistic fallback)
  - Auto-approve transactions with ≥95% confidence; flag <95% for HITL review
  - Learning loop: human corrections feed back into deterministic rules
  - Batch categorization API for bulk processing

- **Bank Integration (Plaid)**
  - One-click bank account connection via Plaid Link
  - Cursor-based transaction sync with real-time pagination
  - Automatic webhook processing for new transactions
  - Cron-based automated sync for continuous ingestion

- **Ledger Sync**
  - QuickBooks Online OAuth2 connection and journal entry sync
  - Xero OAuth2 connection and journal entry sync
  - Chart of Accounts synchronization from both platforms
  - Automatic token refresh for uninterrupted operation

- **Multi-Channel Notifications**
  - Slack interactive messages with approve/reject/categorize buttons
  - Microsoft Teams Adaptive Cards via incoming webhooks
  - SMS two-way messaging via Twilio
  - WhatsApp receipt requests via Twilio WhatsApp Business
  - Unified dispatcher with priority-based routing and fallback

- **Compliance & Localization**
  - 25+ country compliance plugins for regional tax and reporting rules

- **Transaction Management**
  - Transaction splitting across multiple categories
  - Bulk actions (approve, reject, categorize, delete)
  - Recurring transaction detection and auto-matching
  - Duplicate transaction detection and merge
  - Escrow/suspense status with 48-hour timeout processing

- **Reporting & Analytics**
  - Profit & Loss (P&L) report with comparative periods
  - Balance Sheet report with period snapshots
  - PDF export for all financial reports
  - Dashboard with real-time statistics and comparative period analysis
  - Analytics with category drill-down and trend visualization

- **Billing & Plans (Stripe)**
  - CPA Firm and SMB pricing tiers (free → enterprise)
  - Stripe Checkout sessions and Customer Portal
  - Webhook processing for full subscription lifecycle
  - Runtime plan enforcement via `checkPlanLimits()` on all billable operations

- **API**
  - OpenAPI v1 specification for all public endpoints
  - 38 API routes covering transactions, AI, banking, ledger, channels, billing, and admin
  - Zod validation on all request inputs
  - Consistent JSON error responses with proper HTTP status codes

- **Security**
  - Row-Level Security (RLS) on all 16 database tables
  - Organization-based access control (owner/admin/accountant/viewer roles)
  - Auth middleware protecting all application routes
  - Content-Security-Policy and Permissions-Policy headers
  - Rate limiting on all API route categories
  - Webhook signature verification (Stripe, Plaid, Twilio)
  - Immutable audit log for all sensitive operations
  - GDPR-compliant account deletion and cookie consent

- **Testing**
  - 2,207 unit tests (Vitest) with comprehensive coverage
  - 150 E2E tests (Playwright) covering critical user flows
  - CI/CD pipeline with lint, type check, unit tests, E2E tests, and build verification

- **Infrastructure**
  - Next.js 16 App Router with React 19
  - Supabase PostgreSQL with 16 tables and full referential integrity
  - Automated database migrations via migration script
  - Docker support with multi-stage build
  - EasyPanel deployment with post-deploy health checks
  - Automated Plaid sync and suspense timeout cron jobs
