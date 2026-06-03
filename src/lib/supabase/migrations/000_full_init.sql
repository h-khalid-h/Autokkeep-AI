-- =============================================================================
-- Autokkeep AI — Complete PostgreSQL Schema
-- =============================================================================
-- This schema defines the full data model for the Autokkeep AI bookkeeping
-- platform running on Supabase (PostgreSQL 15+).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------------

CREATE TYPE account_type AS ENUM (
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense'
);

CREATE TYPE transaction_status AS ENUM (
  'pending',
  'auto_categorized',
  'human_review',
  'approved',
  'synced',
  'removed',
  'escrow_suspense'
);

CREATE TYPE document_status_type AS ENUM (
  'found',
  'missing',
  'partial'
);

CREATE TYPE rule_type AS ENUM (
  'exact_match',
  'pattern',
  'mcc'
);

CREATE TYPE journal_status AS ENUM (
  'draft',
  'posted',
  'voided'
);

CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'categorize',
  'approve',
  'revoke',
  'export',
  'sync',
  'login',
  'pipeline_processed',
  'webhook_received'
);

CREATE TYPE actor_type AS ENUM (
  'ai',
  'human',
  'system'
);

CREATE TYPE channel_type AS ENUM (
  'slack',
  'teams',
  'whatsapp',
  'sms'
);

CREATE TYPE receipt_status AS ENUM (
  'sent',
  'responded',
  'expired',
  'failed'
);

CREATE TYPE ledger_provider AS ENUM (
  'quickbooks',
  'xero'
);

CREATE TYPE ledger_type_enum AS ENUM (
  'quickbooks',
  'xero',
  'none'
);

CREATE TYPE subscription_plan AS ENUM (
  'free',
  'starter',
  'smb_growth',
  'cpa_professional',
  'cpa_enterprise'
);

CREATE TYPE subscription_status AS ENUM (
  'active',
  'past_due',
  'canceled',
  'trialing'
);

CREATE TYPE team_role AS ENUM (
  'owner',
  'admin',
  'accountant',
  'viewer'
);


-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.1  organizations
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE organizations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  owner_id   uuid        REFERENCES auth.users(id)
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.2  entities
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE entities (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  legal_name      text,
  tax_id          text,
  fiscal_year_end varchar(5),
  base_currency   varchar(3)  DEFAULT 'USD',
  created_at      timestamptz DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.3  bank_connections
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE bank_connections (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  plaid_item_id      text,
  plaid_access_token text,
  institution_name   text,
  status             text        DEFAULT 'active',
  cursor             text,
  error_code         text,
  error_message      text,
  last_synced_at     timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

COMMENT ON COLUMN bank_connections.plaid_access_token
  IS 'plaid_access_token should be encrypted at rest via Supabase Vault';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.4  bank_accounts
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE bank_accounts (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id     uuid          NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
  plaid_account_id  text,
  name              text,
  type              text,
  subtype           text,
  mask              varchar(4),
  current_balance   decimal(15,2),
  available_balance decimal(15,2),
  created_at        timestamptz   DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.5  chart_of_accounts
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE chart_of_accounts (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  code       varchar(10)  NOT NULL,
  name       text         NOT NULL,
  type       account_type NOT NULL,
  parent_id  uuid         REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active  boolean      DEFAULT true,
  created_at timestamptz  DEFAULT now(),

  UNIQUE (entity_id, code)
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.6  transactions
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE transactions (
  id                   uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            uuid                 NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  bank_account_id      uuid                 REFERENCES bank_accounts(id) ON DELETE SET NULL,
  plaid_transaction_id text                 UNIQUE,
  amount               decimal(15,2)        NOT NULL,
  date                 date                 NOT NULL,
  merchant_name        text,
  merchant_raw         text,
  description          text,
  category_ai          varchar(10),          -- soft FK → chart_of_accounts.code via entity_id
  category_human       varchar(10),          -- soft FK → chart_of_accounts.code via entity_id
  confidence           decimal(5,2),
  status               transaction_status   DEFAULT 'pending',
  ai_reasoning         text,
  document_status      document_status_type DEFAULT 'missing',
  document_url         text,
  card_holder          text,
  card_last4           varchar(4),
  mcc_code             varchar(10),
  raw_bank_description text,
  currency             varchar(3)           DEFAULT 'USD',
  tags                 text[],
  aging_days           int                  DEFAULT 0,
  created_at           timestamptz          DEFAULT now(),
  updated_at           timestamptz          DEFAULT now()
);

COMMENT ON COLUMN transactions.category_ai
  IS 'Soft foreign key to chart_of_accounts.code scoped by entity_id';
COMMENT ON COLUMN transactions.category_human
  IS 'Soft foreign key to chart_of_accounts.code scoped by entity_id';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.7  categorization_rules
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE categorization_rules (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rule_type   rule_type   NOT NULL,
  match_value text        NOT NULL,
  gl_code     varchar(10) NOT NULL,
  priority    int         DEFAULT 0,
  hit_count   int         DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.8  journal_entries
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE journal_entries (
  id              uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid             NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transaction_id  uuid             REFERENCES transactions(id) ON DELETE SET NULL,
  entry_date      date             NOT NULL,
  memo            text,
  status          journal_status   DEFAULT 'draft',
  posted_at       timestamptz,
  created_by      uuid             REFERENCES auth.users(id),
  ledger_sync_id  text,
  ledger_type     ledger_type_enum DEFAULT 'none',
  created_at      timestamptz      DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.9  journal_lines
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE journal_lines (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid          NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  gl_code          varchar(10)   NOT NULL,
  debit            decimal(15,2) DEFAULT 0,
  credit           decimal(15,2) DEFAULT 0,
  description      text
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.10 audit_log
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE audit_log (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid         REFERENCES entities(id) ON DELETE CASCADE,
  action      audit_action NOT NULL,
  target_type text,
  target_id   uuid,
  actor_id    uuid,
  actor_type  actor_type   NOT NULL,
  details     jsonb,
  created_at  timestamptz  DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.11 channel_connections
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE channel_connections (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  channel_type   channel_type NOT NULL,
  channel_id     text,
  access_token   text,
  workspace_name text,
  is_active      boolean      DEFAULT true,
  created_at     timestamptz  DEFAULT now()
);

COMMENT ON COLUMN channel_connections.access_token
  IS 'access_token encrypted via Supabase Vault';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.12 receipt_requests
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE receipt_requests (
  id              uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid           NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  channel_type    channel_type,
  channel_user_id text,
  message_id      text,
  status          receipt_status DEFAULT 'sent',
  receipt_url     text,
  sent_at         timestamptz    DEFAULT now(),
  responded_at    timestamptz
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.13 ledger_connections
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE ledger_connections (
  id               uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        uuid            NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  provider         ledger_provider NOT NULL,
  access_token     text,
  refresh_token    text,
  realm_id         text,
  tenant_id        text,
  is_active        boolean         DEFAULT true,
  last_synced_at   timestamptz,
  token_expires_at timestamptz,
  created_at       timestamptz     DEFAULT now()
);

COMMENT ON COLUMN ledger_connections.access_token
  IS 'access_token encrypted via Supabase Vault';
COMMENT ON COLUMN ledger_connections.refresh_token
  IS 'refresh_token encrypted via Supabase Vault';

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.14 subscriptions
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE subscriptions (
  id                      uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  uuid                NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id      text,
  stripe_subscription_id  text                UNIQUE,
  plan                    subscription_plan   NOT NULL,
  status                  subscription_status DEFAULT 'trialing',
  current_period_end      timestamptz,
  entity_count            int                 DEFAULT 0,
  transaction_count       int                 DEFAULT 0,
  created_at              timestamptz         DEFAULT now()
);

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.15 team_members
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE team_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  role          team_role   DEFAULT 'viewer',
  invited_email text,
  accepted_at   timestamptz,
  created_at    timestamptz DEFAULT now(),

  UNIQUE (org_id, user_id)
);


-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- 2.16 categorization_history
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
CREATE TABLE categorization_history (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  merchant    text        NOT NULL,
  gl_code     varchar(10) NOT NULL,
  gl_name     text,
  frequency   int         DEFAULT 1,
  last_used   timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),

  UNIQUE (entity_id, merchant, gl_code)
);


-- ---------------------------------------------------------------------------
-- 3. INDEXES
-- ---------------------------------------------------------------------------

-- entities
CREATE INDEX idx_entities_org_id ON entities(org_id);

-- bank_connections
CREATE INDEX idx_bank_connections_entity_id ON bank_connections(entity_id);

-- bank_accounts
CREATE INDEX idx_bank_accounts_connection_id ON bank_accounts(connection_id);

-- transactions
CREATE INDEX idx_transactions_entity_id            ON transactions(entity_id);
CREATE INDEX idx_transactions_bank_account_id      ON transactions(bank_account_id);
CREATE INDEX idx_transactions_plaid_transaction_id ON transactions(plaid_transaction_id);
CREATE INDEX idx_transactions_status               ON transactions(status);
CREATE INDEX idx_transactions_date                 ON transactions(date);
CREATE INDEX idx_transactions_entity_status        ON transactions(entity_id, status);
CREATE INDEX idx_transactions_entity_date          ON transactions(entity_id, date DESC);

-- categorization_rules
CREATE INDEX idx_categorization_rules_entity_id ON categorization_rules(entity_id);

-- chart_of_accounts
CREATE INDEX idx_chart_of_accounts_entity_id ON chart_of_accounts(entity_id);

-- journal_entries
CREATE INDEX idx_journal_entries_entity_id      ON journal_entries(entity_id);
CREATE INDEX idx_journal_entries_transaction_id ON journal_entries(transaction_id);

-- journal_lines
CREATE INDEX idx_journal_lines_journal_entry_id ON journal_lines(journal_entry_id);
CREATE INDEX idx_journal_lines_gl_code          ON journal_lines(gl_code);

-- audit_log
CREATE INDEX idx_audit_log_entity_id  ON audit_log(entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- channel_connections
CREATE INDEX idx_channel_connections_entity_id ON channel_connections(entity_id);

-- receipt_requests
CREATE INDEX idx_receipt_requests_transaction_id ON receipt_requests(transaction_id);

-- ledger_connections
CREATE INDEX idx_ledger_connections_entity_id ON ledger_connections(entity_id);

-- subscriptions
CREATE INDEX idx_subscriptions_org_id                  ON subscriptions(org_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- bank_connections
CREATE INDEX idx_bank_connections_plaid_item_id ON bank_connections(plaid_item_id);

-- team_members
CREATE INDEX idx_team_members_org_id  ON team_members(org_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);


-- ---------------------------------------------------------------------------
-- 4. TRIGGER: auto-update updated_at on transactions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_bank_connections_updated_at
  BEFORE UPDATE ON bank_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ---------------------------------------------------------------------------
-- 5. DOUBLE-ENTRY VALIDATION on journal_lines
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_debit_sum  decimal(15,2);
  v_credit_sum decimal(15,2);
  v_entry_id   uuid;
BEGIN
  -- Determine which journal_entry_id to validate
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.journal_entry_id;
  ELSE
    v_entry_id := NEW.journal_entry_id;
  END IF;

  SELECT COALESCE(SUM(debit), 0),
         COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
    FROM journal_lines
   WHERE journal_entry_id = v_entry_id;

  IF v_debit_sum <> v_credit_sum THEN
    RAISE EXCEPTION 'Journal entry % is unbalanced: debits (%) ≠ credits (%)',
      v_entry_id, v_debit_sum, v_credit_sum;
  END IF;

  RETURN NULL; -- constraint triggers return NULL
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_validate_journal_balance
  AFTER INSERT OR UPDATE OR DELETE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION validate_journal_entry_balance();

-- Index for categorization_history
CREATE INDEX idx_categorization_history_entity_id ON categorization_history(entity_id);
CREATE INDEX idx_categorization_history_merchant ON categorization_history(entity_id, merchant);

-- ---------------------------------------------------------------------------
-- MIGRATIONS (run in order after initial schema)
-- ---------------------------------------------------------------------------
-- See src/lib/supabase/migrations/ for:
--   001_rls_policies.sql     — Row-Level Security for all tables
--   002_period_locking.sql   — Accounting period locking + mutation prevention
--   003_escrow_suspense.sql  — Add escrow_suspense transaction status


-- ===== MIGRATION 001: RLS POLICIES =====

-- =============================================================================
-- 001_rls_policies.sql — Row-Level Security for all Autokkeep tables
-- =============================================================================
-- Isolation model:
--   Users → team_members → organizations → entities → everything else
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER to avoid policy recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT org_id FROM team_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION auth_user_entity_ids()
RETURNS SETOF uuid AS $$
  SELECT id FROM entities WHERE org_id IN (SELECT auth_user_org_ids())
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------------------------
-- Helper: check if current user has a specific role in their org
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_user_has_role(required_role team_role)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid()
      AND role = required_role
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ===========================================================================
-- 1. organizations
-- ===========================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select" ON organizations;
CREATE POLICY "organizations_select" ON organizations
  FOR SELECT USING (
    id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "organizations_update" ON organizations;
CREATE POLICY "organizations_update" ON organizations
  FOR UPDATE USING (
    id IN (SELECT auth_user_org_ids())
  );


-- ===========================================================================
-- 2. entities
-- ===========================================================================

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entities_select" ON entities;
CREATE POLICY "entities_select" ON entities
  FOR SELECT USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "entities_insert" ON entities;
CREATE POLICY "entities_insert" ON entities
  FOR INSERT WITH CHECK (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "entities_update" ON entities;
CREATE POLICY "entities_update" ON entities
  FOR UPDATE USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "entities_delete" ON entities;
CREATE POLICY "entities_delete" ON entities
  FOR DELETE USING (
    org_id IN (SELECT auth_user_org_ids())
  );


-- ===========================================================================
-- 3. bank_connections  (chain: entity_id → entities → team_members)
-- ===========================================================================

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_connections_select" ON bank_connections;
CREATE POLICY "bank_connections_select" ON bank_connections
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "bank_connections_insert" ON bank_connections;
CREATE POLICY "bank_connections_insert" ON bank_connections
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "bank_connections_update" ON bank_connections;
CREATE POLICY "bank_connections_update" ON bank_connections
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "bank_connections_delete" ON bank_connections;
CREATE POLICY "bank_connections_delete" ON bank_connections
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 4. bank_accounts  (chain: connection_id → bank_connections → entities)
-- ===========================================================================

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_accounts_select" ON bank_accounts;
CREATE POLICY "bank_accounts_select" ON bank_accounts
  FOR SELECT USING (
    connection_id IN (
      SELECT id FROM bank_connections
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "bank_accounts_insert" ON bank_accounts;
CREATE POLICY "bank_accounts_insert" ON bank_accounts
  FOR INSERT WITH CHECK (
    connection_id IN (
      SELECT id FROM bank_connections
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "bank_accounts_update" ON bank_accounts;
CREATE POLICY "bank_accounts_update" ON bank_accounts
  FOR UPDATE USING (
    connection_id IN (
      SELECT id FROM bank_connections
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "bank_accounts_delete" ON bank_accounts;
CREATE POLICY "bank_accounts_delete" ON bank_accounts
  FOR DELETE USING (
    connection_id IN (
      SELECT id FROM bank_connections
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );


-- ===========================================================================
-- 5. chart_of_accounts  (through entity_id)
-- ===========================================================================

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chart_of_accounts_select" ON chart_of_accounts;
CREATE POLICY "chart_of_accounts_select" ON chart_of_accounts
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "chart_of_accounts_insert" ON chart_of_accounts;
CREATE POLICY "chart_of_accounts_insert" ON chart_of_accounts
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "chart_of_accounts_update" ON chart_of_accounts;
CREATE POLICY "chart_of_accounts_update" ON chart_of_accounts
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "chart_of_accounts_delete" ON chart_of_accounts;
CREATE POLICY "chart_of_accounts_delete" ON chart_of_accounts
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 6. transactions  (through entity_id)
-- ===========================================================================

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select" ON transactions;
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "transactions_insert" ON transactions;
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "transactions_update" ON transactions;
CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "transactions_delete" ON transactions;
CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 7. categorization_rules  (through entity_id)
-- ===========================================================================

ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categorization_rules_select" ON categorization_rules;
CREATE POLICY "categorization_rules_select" ON categorization_rules
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_rules_insert" ON categorization_rules;
CREATE POLICY "categorization_rules_insert" ON categorization_rules
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_rules_update" ON categorization_rules;
CREATE POLICY "categorization_rules_update" ON categorization_rules
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_rules_delete" ON categorization_rules;
CREATE POLICY "categorization_rules_delete" ON categorization_rules
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 8. journal_entries  (through entity_id)
-- ===========================================================================

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_entries_select" ON journal_entries;
CREATE POLICY "journal_entries_select" ON journal_entries
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "journal_entries_insert" ON journal_entries;
CREATE POLICY "journal_entries_insert" ON journal_entries
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "journal_entries_update" ON journal_entries;
CREATE POLICY "journal_entries_update" ON journal_entries
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "journal_entries_delete" ON journal_entries;
CREATE POLICY "journal_entries_delete" ON journal_entries
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 9. journal_lines  (chain: journal_entry_id → journal_entries → entity_id)
-- ===========================================================================

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "journal_lines_select" ON journal_lines;
CREATE POLICY "journal_lines_select" ON journal_lines
  FOR SELECT USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "journal_lines_insert" ON journal_lines;
CREATE POLICY "journal_lines_insert" ON journal_lines
  FOR INSERT WITH CHECK (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "journal_lines_update" ON journal_lines;
CREATE POLICY "journal_lines_update" ON journal_lines
  FOR UPDATE USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "journal_lines_delete" ON journal_lines;
CREATE POLICY "journal_lines_delete" ON journal_lines
  FOR DELETE USING (
    journal_entry_id IN (
      SELECT id FROM journal_entries
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );


-- ===========================================================================
-- 10. audit_log  (through entity_id)
--     SELECT for all org members; INSERT/UPDATE/DELETE for owner/admin only
-- ===========================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

-- REMOVED: audit_log UPDATE/DELETE policies. Audit logs are immutable (SOC 2/SOX).
-- See migration 001_rls_policies.sql for the authoritative policy set.
-- DROP POLICY IF EXISTS "audit_log_update" ON audit_log;
-- CREATE POLICY "audit_log_update" ON audit_log
--   FOR UPDATE USING (
--     entity_id IN (SELECT auth_user_entity_ids())
--     AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
--   );
--
-- DROP POLICY IF EXISTS "audit_log_delete" ON audit_log;
-- CREATE POLICY "audit_log_delete" ON audit_log
--   FOR DELETE USING (
--     entity_id IN (SELECT auth_user_entity_ids())
--     AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
--   );


-- ===========================================================================
-- 11. channel_connections  (through entity_id)
-- ===========================================================================

ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_connections_select" ON channel_connections;
CREATE POLICY "channel_connections_select" ON channel_connections
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "channel_connections_insert" ON channel_connections;
CREATE POLICY "channel_connections_insert" ON channel_connections
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "channel_connections_update" ON channel_connections;
CREATE POLICY "channel_connections_update" ON channel_connections
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "channel_connections_delete" ON channel_connections;
CREATE POLICY "channel_connections_delete" ON channel_connections
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 12. receipt_requests  (chain: transaction_id → transactions → entity_id)
-- ===========================================================================

ALTER TABLE receipt_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipt_requests_select" ON receipt_requests;
CREATE POLICY "receipt_requests_select" ON receipt_requests
  FOR SELECT USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "receipt_requests_insert" ON receipt_requests;
CREATE POLICY "receipt_requests_insert" ON receipt_requests
  FOR INSERT WITH CHECK (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "receipt_requests_update" ON receipt_requests;
CREATE POLICY "receipt_requests_update" ON receipt_requests
  FOR UPDATE USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );

DROP POLICY IF EXISTS "receipt_requests_delete" ON receipt_requests;
CREATE POLICY "receipt_requests_delete" ON receipt_requests
  FOR DELETE USING (
    transaction_id IN (
      SELECT id FROM transactions
      WHERE entity_id IN (SELECT auth_user_entity_ids())
    )
  );


-- ===========================================================================
-- 13. ledger_connections  (through entity_id)
-- ===========================================================================

ALTER TABLE ledger_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ledger_connections_select" ON ledger_connections;
CREATE POLICY "ledger_connections_select" ON ledger_connections
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "ledger_connections_insert" ON ledger_connections;
CREATE POLICY "ledger_connections_insert" ON ledger_connections
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "ledger_connections_update" ON ledger_connections;
CREATE POLICY "ledger_connections_update" ON ledger_connections
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "ledger_connections_delete" ON ledger_connections;
CREATE POLICY "ledger_connections_delete" ON ledger_connections
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===========================================================================
-- 14. subscriptions  (through org_id)
-- ===========================================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select" ON subscriptions;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "subscriptions_insert" ON subscriptions;
CREATE POLICY "subscriptions_insert" ON subscriptions
  FOR INSERT WITH CHECK (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "subscriptions_update" ON subscriptions;
CREATE POLICY "subscriptions_update" ON subscriptions
  FOR UPDATE USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "subscriptions_delete" ON subscriptions;
CREATE POLICY "subscriptions_delete" ON subscriptions
  FOR DELETE USING (
    org_id IN (SELECT auth_user_org_ids())
  );


-- ===========================================================================
-- 15. team_members  (through org_id — users can see their own org's members)
-- ===========================================================================

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_select" ON team_members;
CREATE POLICY "team_members_select" ON team_members
  FOR SELECT USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "team_members_insert" ON team_members;
CREATE POLICY "team_members_insert" ON team_members
  FOR INSERT WITH CHECK (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "team_members_update" ON team_members;
CREATE POLICY "team_members_update" ON team_members
  FOR UPDATE USING (
    org_id IN (SELECT auth_user_org_ids())
  );

DROP POLICY IF EXISTS "team_members_delete" ON team_members;
CREATE POLICY "team_members_delete" ON team_members
  FOR DELETE USING (
    org_id IN (SELECT auth_user_org_ids())
  );


-- ===========================================================================
-- 16. categorization_history  (through entity_id)
-- ===========================================================================

ALTER TABLE categorization_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categorization_history_select" ON categorization_history;
CREATE POLICY "categorization_history_select" ON categorization_history
  FOR SELECT USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_history_insert" ON categorization_history;
CREATE POLICY "categorization_history_insert" ON categorization_history
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_history_update" ON categorization_history;
CREATE POLICY "categorization_history_update" ON categorization_history
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );

DROP POLICY IF EXISTS "categorization_history_delete" ON categorization_history;
CREATE POLICY "categorization_history_delete" ON categorization_history
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
  );


-- ===== MIGRATION 002: PERIOD LOCKING =====

-- =============================================================================
-- 002_period_locking.sql — Accounting period locking + mutation prevention
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Accounting periods table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS accounting_periods (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period     varchar(7)  NOT NULL, -- e.g. '2025-01'
  is_locked  boolean     DEFAULT false,
  locked_at  timestamptz,
  locked_by  uuid        REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),

  UNIQUE (entity_id, period)
);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_entity ON accounting_periods(entity_id);

-- ---------------------------------------------------------------------------
-- RLS for accounting_periods
-- ---------------------------------------------------------------------------

ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accounting_periods_select" ON accounting_periods;
CREATE POLICY "accounting_periods_select" ON accounting_periods
  FOR SELECT USING (entity_id IN (SELECT auth_user_entity_ids()));

-- Restrict lock/unlock to owner/admin roles
DROP POLICY IF EXISTS "accounting_periods_all" ON accounting_periods;
DROP POLICY IF EXISTS "accounting_periods_modify" ON accounting_periods;
CREATE POLICY "accounting_periods_modify" ON accounting_periods
  FOR ALL USING (
    entity_id IN (SELECT auth_user_entity_ids())
    AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- Trigger: prevent mutation on locked periods for journal_entries
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_locked_period_mutation()
RETURNS TRIGGER AS $$
DECLARE
  v_period varchar(7);
  v_locked boolean;
BEGIN
  -- Get the period from the entry date
  IF TG_OP = 'DELETE' THEN
    v_period := to_char(OLD.entry_date, 'YYYY-MM');
  ELSE
    v_period := to_char(NEW.entry_date, 'YYYY-MM');
  END IF;

  -- Check if period is locked
  SELECT is_locked INTO v_locked
  FROM accounting_periods
  WHERE entity_id = COALESCE(NEW.entity_id, OLD.entity_id)
    AND period = v_period;

  IF v_locked IS TRUE THEN
    -- PRD §6: Allow adjusting journal entries on locked periods
    IF TG_OP = 'INSERT' AND NEW.is_adjustment IS TRUE THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Cannot modify journal entries in locked period %', v_period;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_period_je ON journal_entries;
CREATE TRIGGER trg_prevent_locked_period_je
  BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_period_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: prevent mutation on locked periods for transactions
-- (includes INSERT to prevent new imports into locked periods)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_locked_period_txn()
RETURNS TRIGGER AS $$
DECLARE
  v_period varchar(7);
  v_locked boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_period := to_char(OLD.date, 'YYYY-MM');
  ELSE
    v_period := to_char(NEW.date, 'YYYY-MM');
  END IF;

  SELECT is_locked INTO v_locked
  FROM accounting_periods
  WHERE entity_id = COALESCE(NEW.entity_id, OLD.entity_id)
    AND period = v_period;

  IF v_locked IS TRUE THEN
    RAISE EXCEPTION 'Cannot modify transactions in locked period %', v_period;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_locked_period_txn ON transactions;
CREATE TRIGGER trg_prevent_locked_period_txn
  BEFORE INSERT OR UPDATE OR DELETE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_locked_period_txn();


-- ===== MIGRATION 003: ESCROW SUSPENSE =====

-- =============================================================================
-- 003_escrow_suspense.sql — Add escrow_suspense transaction status
-- =============================================================================

-- Add escrow_suspense to transaction_status enum
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'escrow_suspense' AFTER 'human_review';


-- ===== MIGRATION 004: ENUM ALIGNMENT =====

-- =============================================================================
-- Autokkeep — Enum Fix Migration (004)
-- =============================================================================
-- Aligns database enum types with the codebase after the production readiness
-- audit. This migration:
--   1. Adds 'escrow_suspense' to transaction_status (if not exists)
--   2. Adds 'failed' to receipt_status (if not exists)
--   3. Adds new subscription_plan values: 'free', 'starter', 'cpa_professional'
--
-- Safe to run multiple times (uses IF NOT EXISTS).
-- =============================================================================

-- 1. Add escrow_suspense, categorization_failed, and syncing to transaction_status
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'escrow_suspense';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'categorization_failed';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'syncing';

-- 2. Add 'failed' to receipt_status (for Twilio failed deliveries)
ALTER TYPE receipt_status ADD VALUE IF NOT EXISTS 'failed';

-- 3. Add new subscription_plan values to match plans.ts
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'cpa_professional';


-- ===== MIGRATION 005: AUDIT COLUMNS =====

-- =============================================================================
-- Autokkeep — Audit Log Column Migration (005)
-- =============================================================================
-- Adds ip_address and user_agent columns to the audit_log table
-- for SOC 2 / SOX compliance requirements.
--
-- Safe to run multiple times (uses IF NOT EXISTS pattern via DO block).
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN ip_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN user_agent TEXT;
  END IF;
END $$;


-- ===== MIGRATION 006: DOUBLE-ENTRY INVARIANT (already in schema above) =====
-- Note: The double-entry constraint trigger (trg_validate_journal_balance) is 
-- already defined in Section 5 of this schema. Migration 006 is a no-op here.


-- ===== MIGRATION 007: CITATION & WORKPAPER ENGINE =====

-- 1. Add citation fields to audit_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'source_hash'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN source_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'citation_token'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN citation_token text;
  END IF;
END $$;

-- 2. Add confidence breakdown to categorization_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'confidence_breakdown'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN confidence_breakdown jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'source_hash'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN source_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'citation_token'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN citation_token text;
  END IF;
END $$;

-- 3. Create document_anchors table for SHA-256 document registry
CREATE TABLE IF NOT EXISTS document_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  document_type text NOT NULL DEFAULT 'transaction',
  source_hash text NOT NULL,
  citation_token text NOT NULL,
  raw_metadata jsonb DEFAULT '{}',
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_anchors_hash ON document_anchors(source_hash);
CREATE INDEX IF NOT EXISTS idx_document_anchors_entity ON document_anchors(entity_id);
CREATE INDEX IF NOT EXISTS idx_document_anchors_citation ON document_anchors(citation_token);

-- 4. Add is_adjustment flag to journal_entries for period locking exception
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'is_adjustment'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN is_adjustment boolean DEFAULT false;
  END IF;
END $$;

-- 5. RLS for document_anchors
ALTER TABLE document_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_anchors_select" ON document_anchors;
CREATE POLICY "document_anchors_select" ON document_anchors
  FOR SELECT USING (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "document_anchors_insert" ON document_anchors;
CREATE POLICY "document_anchors_insert" ON document_anchors
  FOR INSERT WITH CHECK (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "document_anchors_update" ON document_anchors;
CREATE POLICY "document_anchors_update" ON document_anchors
  FOR UPDATE USING (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "document_anchors_delete" ON document_anchors;
CREATE POLICY "document_anchors_delete" ON document_anchors
  FOR DELETE USING (entity_id IN (SELECT auth_user_entity_ids()));
