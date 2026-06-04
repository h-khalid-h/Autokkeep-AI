-- ============================================
-- Migration 036: Security Hardening (Round 4)
-- Fixes: team_invites RLS, team_members INSERT policy,
--        subscriptions RLS, audit_log FK cascade
-- ============================================

-- F2: team_invites uses auth_user_entity_ids() instead of auth_user_org_ids()
-- This causes all invite data to be invisible via RLS
DROP POLICY IF EXISTS "team_invites_select" ON team_invites;
DROP POLICY IF EXISTS "team_invites_insert" ON team_invites;

CREATE POLICY "team_invites_select" ON team_invites FOR SELECT
  USING (org_id IN (SELECT auth_user_org_ids()));

CREATE POLICY "team_invites_insert" ON team_invites FOR INSERT
  WITH CHECK (
    org_id IN (SELECT auth_user_org_ids())
    AND auth_user_has_role(org_id, 'admin')
  );

-- Add missing UPDATE/DELETE policies for team_invites
DROP POLICY IF EXISTS "team_invites_update" ON team_invites;
CREATE POLICY "team_invites_update" ON team_invites FOR UPDATE
  USING (
    org_id IN (SELECT auth_user_org_ids())
    AND auth_user_has_role(org_id, 'admin')
  );

DROP POLICY IF EXISTS "team_invites_delete" ON team_invites;
CREATE POLICY "team_invites_delete" ON team_invites FOR DELETE
  USING (
    org_id IN (SELECT auth_user_org_ids())
    AND auth_user_has_role(org_id, 'admin')
  );

-- F8: team_members INSERT allows any org member (no role check)
-- A viewer could add a new admin member if they bypass the app layer
DROP POLICY IF EXISTS "team_members_insert" ON team_members;
CREATE POLICY "team_members_insert" ON team_members FOR INSERT
  WITH CHECK (
    org_id IN (SELECT auth_user_org_ids())
    AND auth_user_has_role(org_id, 'admin')
  );

-- F9: subscriptions allows any org member to INSERT/UPDATE/DELETE
-- These should be restricted to service_role (Stripe webhooks)
DROP POLICY IF EXISTS "subscriptions_insert" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_update" ON subscriptions;
DROP POLICY IF EXISTS "subscriptions_delete" ON subscriptions;

-- Subscriptions are managed by Stripe webhooks via service_role.
-- Authenticated users can only SELECT.
CREATE POLICY "subscriptions_insert" ON subscriptions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "subscriptions_update" ON subscriptions FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "subscriptions_delete" ON subscriptions FOR DELETE
  TO service_role
  USING (true);

-- F10: audit_log ON DELETE CASCADE violates SOC 2 immutability
-- Audit logs must survive entity deletion
-- Make entity_id nullable first (required for SET NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'entity_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE audit_log ALTER COLUMN entity_id DROP NOT NULL;
  END IF;
END
$$;

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_entity_id_fkey;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_entity_id_fkey
  FOREIGN KEY (entity_id) REFERENCES entities(id)
  ON DELETE SET NULL;
