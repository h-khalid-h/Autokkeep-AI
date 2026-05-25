-- =============================================================================
-- Row-Level Security (RLS) Policies for Autokkeep
-- =============================================================================
-- Enables RLS on all tables and defines granular access policies based on
-- organization membership and team roles.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable RLS on ALL tables
-- -----------------------------------------------------------------------------

ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_of_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorization_history ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Helper functions
-- -----------------------------------------------------------------------------

-- Returns all org_ids the current user belongs to.
CREATE OR REPLACE FUNCTION auth.user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT org_id FROM public.team_members WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the current user's role within a specific organization.
CREATE OR REPLACE FUNCTION auth.user_org_role(p_org_id uuid)
RETURNS team_role AS $$
  SELECT role FROM public.team_members WHERE user_id = auth.uid() AND org_id = p_org_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns the org_id for a given entity.
CREATE OR REPLACE FUNCTION auth.entity_org_id(p_entity_id uuid)
RETURNS uuid AS $$
  SELECT org_id FROM public.entities WHERE id = p_entity_id
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================================================
-- 3. Policies — organizations
-- =============================================================================

CREATE POLICY organizations_select_policy ON public.organizations
  FOR SELECT USING (
    id IN (SELECT auth.user_org_ids())
  );

CREATE POLICY organizations_insert_policy ON public.organizations
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
  );

CREATE POLICY organizations_update_policy ON public.organizations
  FOR UPDATE USING (
    auth.user_org_role(id) = 'owner'
  );

CREATE POLICY organizations_delete_policy ON public.organizations
  FOR DELETE USING (
    auth.user_org_role(id) = 'owner'
  );

-- =============================================================================
-- 4. Policies — entities
-- =============================================================================

CREATE POLICY entities_select_policy ON public.entities
  FOR SELECT USING (
    org_id IN (SELECT auth.user_org_ids())
  );

CREATE POLICY entities_insert_policy ON public.entities
  FOR INSERT WITH CHECK (
    auth.user_org_role(org_id) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY entities_update_policy ON public.entities
  FOR UPDATE USING (
    auth.user_org_role(org_id) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY entities_delete_policy ON public.entities
  FOR DELETE USING (
    auth.user_org_role(org_id) IN ('owner', 'admin')
  );

-- =============================================================================
-- 5. Policies — bank_connections
-- =============================================================================

CREATE POLICY bank_connections_select_policy ON public.bank_connections
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY bank_connections_insert_policy ON public.bank_connections
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY bank_connections_update_policy ON public.bank_connections
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY bank_connections_delete_policy ON public.bank_connections
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 6. Policies — bank_accounts (via connection_id -> bank_connections -> entities)
-- =============================================================================

CREATE POLICY bank_accounts_select_policy ON public.bank_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.bank_connections bc
        JOIN public.entities e ON e.id = bc.entity_id
      WHERE bc.id = bank_accounts.connection_id
        AND e.org_id IN (SELECT auth.user_org_ids())
    )
  );

CREATE POLICY bank_accounts_insert_policy ON public.bank_accounts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bank_connections bc
        JOIN public.entities e ON e.id = bc.entity_id
      WHERE bc.id = bank_accounts.connection_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY bank_accounts_update_policy ON public.bank_accounts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.bank_connections bc
        JOIN public.entities e ON e.id = bc.entity_id
      WHERE bc.id = bank_accounts.connection_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY bank_accounts_delete_policy ON public.bank_accounts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.bank_connections bc
        JOIN public.entities e ON e.id = bc.entity_id
      WHERE bc.id = bank_accounts.connection_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 7. Policies — chart_of_accounts
-- =============================================================================

CREATE POLICY chart_of_accounts_select_policy ON public.chart_of_accounts
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY chart_of_accounts_insert_policy ON public.chart_of_accounts
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY chart_of_accounts_update_policy ON public.chart_of_accounts
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY chart_of_accounts_delete_policy ON public.chart_of_accounts
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 8. Policies — transactions
-- =============================================================================

CREATE POLICY transactions_select_policy ON public.transactions
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY transactions_insert_policy ON public.transactions
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY transactions_update_policy ON public.transactions
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY transactions_delete_policy ON public.transactions
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 9. Policies — categorization_rules
-- =============================================================================

CREATE POLICY categorization_rules_select_policy ON public.categorization_rules
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY categorization_rules_insert_policy ON public.categorization_rules
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY categorization_rules_update_policy ON public.categorization_rules
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY categorization_rules_delete_policy ON public.categorization_rules
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 10. Policies — journal_entries
-- =============================================================================

CREATE POLICY journal_entries_select_policy ON public.journal_entries
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY journal_entries_insert_policy ON public.journal_entries
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY journal_entries_update_policy ON public.journal_entries
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY journal_entries_delete_policy ON public.journal_entries
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 11. Policies — journal_lines (via journal_entry_id -> journal_entries -> entities)
-- =============================================================================

CREATE POLICY journal_lines_select_policy ON public.journal_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
        JOIN public.entities e ON e.id = je.entity_id
      WHERE je.id = journal_lines.journal_entry_id
        AND e.org_id IN (SELECT auth.user_org_ids())
    )
  );

CREATE POLICY journal_lines_insert_policy ON public.journal_lines
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
        JOIN public.entities e ON e.id = je.entity_id
      WHERE je.id = journal_lines.journal_entry_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY journal_lines_update_policy ON public.journal_lines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
        JOIN public.entities e ON e.id = je.entity_id
      WHERE je.id = journal_lines.journal_entry_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY journal_lines_delete_policy ON public.journal_lines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je
        JOIN public.entities e ON e.id = je.entity_id
      WHERE je.id = journal_lines.journal_entry_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 12. Policies — audit_log (INSERT only for authenticated; no UPDATE/DELETE)
-- =============================================================================

CREATE POLICY audit_log_select_policy ON public.audit_log
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY audit_log_insert_policy ON public.audit_log
  FOR INSERT WITH CHECK (
    -- Entity-scoped inserts must belong to user's org; null entity_id allowed for system events
    entity_id IS NULL
    OR auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

-- No UPDATE or DELETE policies for audit_log — immutable by design.

-- =============================================================================
-- 13. Policies — channel_connections
-- =============================================================================

CREATE POLICY channel_connections_select_policy ON public.channel_connections
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY channel_connections_insert_policy ON public.channel_connections
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY channel_connections_update_policy ON public.channel_connections
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY channel_connections_delete_policy ON public.channel_connections
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 14. Policies — receipt_requests (via transaction_id -> transactions -> entities)
-- =============================================================================

CREATE POLICY receipt_requests_select_policy ON public.receipt_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
        JOIN public.entities e ON e.id = t.entity_id
      WHERE t.id = receipt_requests.transaction_id
        AND e.org_id IN (SELECT auth.user_org_ids())
    )
  );

CREATE POLICY receipt_requests_insert_policy ON public.receipt_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
        JOIN public.entities e ON e.id = t.entity_id
      WHERE t.id = receipt_requests.transaction_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY receipt_requests_update_policy ON public.receipt_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
        JOIN public.entities e ON e.id = t.entity_id
      WHERE t.id = receipt_requests.transaction_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin', 'accountant')
    )
  );

CREATE POLICY receipt_requests_delete_policy ON public.receipt_requests
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
        JOIN public.entities e ON e.id = t.entity_id
      WHERE t.id = receipt_requests.transaction_id
        AND auth.user_org_role(e.org_id) IN ('owner', 'admin')
    )
  );

-- =============================================================================
-- 15. Policies — ledger_connections
-- =============================================================================

CREATE POLICY ledger_connections_select_policy ON public.ledger_connections
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY ledger_connections_insert_policy ON public.ledger_connections
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY ledger_connections_update_policy ON public.ledger_connections
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY ledger_connections_delete_policy ON public.ledger_connections
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );

-- =============================================================================
-- 16. Policies — subscriptions
-- =============================================================================

CREATE POLICY subscriptions_select_policy ON public.subscriptions
  FOR SELECT USING (
    org_id IN (SELECT auth.user_org_ids())
  );

CREATE POLICY subscriptions_insert_policy ON public.subscriptions
  FOR INSERT WITH CHECK (
    auth.user_org_role(org_id) = 'owner'
  );

CREATE POLICY subscriptions_update_policy ON public.subscriptions
  FOR UPDATE USING (
    auth.user_org_role(org_id) = 'owner'
  );

CREATE POLICY subscriptions_delete_policy ON public.subscriptions
  FOR DELETE USING (
    auth.user_org_role(org_id) = 'owner'
  );

-- =============================================================================
-- 17. Policies — team_members
-- =============================================================================

-- Members can see all teammates in their org, plus always their own row.
CREATE POLICY team_members_select_policy ON public.team_members
  FOR SELECT USING (
    org_id IN (SELECT auth.user_org_ids())
    OR user_id = auth.uid()
  );

CREATE POLICY team_members_insert_policy ON public.team_members
  FOR INSERT WITH CHECK (
    auth.user_org_role(org_id) IN ('owner', 'admin')
  );

CREATE POLICY team_members_update_policy ON public.team_members
  FOR UPDATE USING (
    auth.user_org_role(org_id) IN ('owner', 'admin')
  );

CREATE POLICY team_members_delete_policy ON public.team_members
  FOR DELETE USING (
    auth.user_org_role(org_id) IN ('owner', 'admin')
  );

-- =============================================================================
-- 18. Policies — categorization_history
-- =============================================================================

CREATE POLICY categorization_history_select_policy ON public.categorization_history
  FOR SELECT USING (
    auth.entity_org_id(entity_id) IN (SELECT auth.user_org_ids())
  );

CREATE POLICY categorization_history_insert_policy ON public.categorization_history
  FOR INSERT WITH CHECK (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY categorization_history_update_policy ON public.categorization_history
  FOR UPDATE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin', 'accountant')
  );

CREATE POLICY categorization_history_delete_policy ON public.categorization_history
  FOR DELETE USING (
    auth.user_org_role(auth.entity_org_id(entity_id)) IN ('owner', 'admin')
  );
