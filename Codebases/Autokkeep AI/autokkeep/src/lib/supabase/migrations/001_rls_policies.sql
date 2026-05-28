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

DROP POLICY IF EXISTS "audit_log_update" ON audit_log;
CREATE POLICY "audit_log_update" ON audit_log
  FOR UPDATE USING (
    entity_id IN (SELECT auth_user_entity_ids())
    AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
  );

DROP POLICY IF EXISTS "audit_log_delete" ON audit_log;
CREATE POLICY "audit_log_delete" ON audit_log
  FOR DELETE USING (
    entity_id IN (SELECT auth_user_entity_ids())
    AND (auth_user_has_role('owner') OR auth_user_has_role('admin'))
  );


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
