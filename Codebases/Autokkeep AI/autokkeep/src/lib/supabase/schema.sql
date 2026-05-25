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
  'removed'
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
  'expired'
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
  'cpa_foundation',
  'cpa_scale',
  'cpa_enterprise',
  'smb_basic',
  'smb_growth',
  'smb_premium'
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
  created_at         timestamptz DEFAULT now()
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
CREATE INDEX idx_audit_log_entity_id ON audit_log(entity_id);

-- channel_connections
CREATE INDEX idx_channel_connections_entity_id ON channel_connections(entity_id);

-- receipt_requests
CREATE INDEX idx_receipt_requests_transaction_id ON receipt_requests(transaction_id);

-- ledger_connections
CREATE INDEX idx_ledger_connections_entity_id ON ledger_connections(entity_id);

-- subscriptions
CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);

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
