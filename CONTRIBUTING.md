# Contributing to Autokkeep

Thank you for your interest in contributing to Autokkeep! This guide will help you get set up and ensure your contributions meet our quality standards.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Code Style](#code-style)
- [Architecture Overview](#architecture-overview)

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Runtime |
| **npm** | 10+ | Package manager |
| **Git** | 2.40+ | Version control |
| **Supabase CLI** | Latest | Local database development |
| **Playwright** | Bundled | E2E testing |

### 1. Clone & Install

```bash
git clone <repo-url>
cd autokkeep
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Open `.env.local` and configure the **minimum required** variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `OPENAI_API_KEY` | OpenAI API key for AI categorization |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for local dev |

See [`.env.example`](.env.example) for the full list of variables, organized by integration (Plaid, Stripe, Slack, Teams, Twilio, QuickBooks, Xero).

### 3. Set Up the Database

Run the SQL migrations in your Supabase SQL Editor, **in order**:

1. `src/lib/supabase/schema.sql` — Creates 16 tables, enums, triggers, indexes
2. `src/lib/supabase/migrations/001_rls_policies.sql` — Row-Level Security for all tables
3. `src/lib/supabase/migrations/002_period_locking.sql` — Accounting period locking
4. `src/lib/supabase/migrations/003_escrow_suspense.sql` — Escrow/suspense transaction status

Or use the migration script:

```bash
npm run migrate
npm run migrate:status   # verify migration state
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to verify everything is running.

---

## Branch Naming Convention

Use the following prefixes for all branches:

| Prefix | Use Case | Example |
|--------|----------|---------|
| `feat/` | New features | `feat/receipt-ocr` |
| `fix/` | Bug fixes | `fix/plaid-sync-cursor` |
| `chore/` | Maintenance, deps, CI | `chore/upgrade-next-16` |
| `docs/` | Documentation only | `docs/api-reference` |
| `refactor/` | Code refactoring (no behavior change) | `refactor/categorization-engine` |
| `test/` | Adding or updating tests | `test/billing-edge-cases` |
| `hotfix/` | Critical production fixes | `hotfix/auth-session-leak` |

**Rules:**
- Branch from `main` only
- Use lowercase with hyphens (kebab-case)
- Keep names short but descriptive

---

## Commit Message Format

We follow **[Conventional Commits](https://www.conventionalcommits.org/)** strictly.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `chore` | Maintenance (deps, config, CI) |
| `docs` | Documentation changes |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or correcting tests |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `style` | Formatting, whitespace (no logic change) |

### Scopes (optional but encouraged)

`ai`, `plaid`, `billing`, `ledger`, `channels`, `auth`, `dashboard`, `api`, `db`, `ci`, `docs`

### Examples

```
feat(plaid): add cursor-based transaction pagination
fix(billing): prevent double checkout session creation
chore(deps): upgrade supabase-js to 2.106.2
test(ai): add edge cases for dual-engine categorization
ci: add Playwright E2E tests to deploy pipeline
docs: update API route table in README
```

### Breaking Changes

Append `!` after the type/scope and include a `BREAKING CHANGE:` footer:

```
feat(api)!: change transaction endpoint response format

BREAKING CHANGE: /api/transactions now returns paginated results instead of a flat array.
```

---

## Pull Request Process

1. **Create a branch** following the [naming convention](#branch-naming-convention)
2. **Make your changes** with well-formatted commits
3. **Run all checks locally** before pushing (see [Testing Requirements](#testing-requirements))
4. **Open a PR** against `main` with:
   - A clear title following commit message format
   - Description of **what** changed and **why**
   - Screenshots or recordings for UI changes
   - Link to related issue(s) if applicable
5. **CI must pass** — lint, type check, unit tests, E2E tests, and build
6. **Request review** from at least one maintainer
7. **Address feedback** — push fixup commits, then squash before merge
8. **Merge** via **Squash and Merge** to keep `main` history clean

### PR Checklist

- [ ] All CI checks pass
- [ ] No `any` types introduced (TypeScript strict mode)
- [ ] New features include tests
- [ ] API changes include updated documentation
- [ ] No `console.log` left in production code
- [ ] CSS Modules used for all component styles (no inline styles or Tailwind)

---

## Testing Requirements

All PRs must pass the full test suite. Run these commands locally before pushing:

### 1. TypeScript Compilation

```bash
npx tsc --noEmit
```

Zero errors required. We use TypeScript strict mode.

### 2. Linting

```bash
npm run lint
```

Zero warnings and errors. ESLint is configured via `eslint.config.mjs`.

### 3. Unit Tests (Vitest)

```bash
npm test                  # single run
npm run test:watch        # watch mode during development
npm run test:coverage     # with coverage report
```

All tests must pass. New features should include unit tests.

### 4. E2E Tests (Playwright)

```bash
npm run test:e2e
```

Runs Playwright against Chromium. E2E tests live in the `e2e/` directory.

### 5. Build Verification

```bash
npx next build
```

Ensures the production build succeeds with no errors.

---

## Code Style

### TypeScript

- **Strict mode** — No `any` types, no implicit returns, no unused variables
- **Zod validation** — All API inputs validated with Zod schemas
- **Named exports** — Prefer named exports over default exports for utilities and libraries
- **Async/await** — Preferred over `.then()` chains

### CSS

- **CSS Modules** — All component styles use `.module.css` files
- **No Tailwind** — This project uses vanilla CSS exclusively
- **Design tokens** — Use CSS custom properties defined in `globals.css`
- **Mobile-first** — Write base styles for mobile, use `min-width` media queries for larger screens

### File Organization

- **Colocation** — Keep component, styles, and tests close together
- **Barrel exports** — Use `index.ts` files for clean imports
- **Path aliases** — Use `@/` prefix for imports from `src/`

### API Routes

- **Edge Runtime** — API routes use the Edge runtime where possible
- **Error handling** — Return proper HTTP status codes with JSON error bodies
- **Rate limiting** — All public routes include rate limiting
- **Auth guards** — Protected routes verify session via middleware

---

## Architecture Overview

Autokkeep follows a **Next.js App Router** architecture with Supabase as the backend:

```
Bank (Plaid) → Sync → AI Categorize → Auto-Approve / HITL Review → Journal Entry → Ledger Sync
```

For the full architecture documentation, see the [README](README.md) and the [Architecture Guide](docs/ARCHITECTURE.md).

Key architectural decisions:
- **Dual-engine AI**: Deterministic rules first, GPT-4o fallback for uncategorized transactions
- **Multi-tenant**: Organization-based isolation with Supabase RLS
- **Event-driven**: Webhooks from Plaid, Stripe, and Twilio drive async processing
- **Plan enforcement**: Runtime billing checks on all billable operations

---

## Questions?

If you have questions about contributing, open a [Discussion](../../discussions) or reach out to the maintainers.

Thank you for helping make Autokkeep better! 🚀
