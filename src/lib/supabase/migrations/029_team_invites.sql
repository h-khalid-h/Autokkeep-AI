-- ============================================
-- Migration 029: Team Invites Table
-- ============================================
-- Creates a dedicated team_invites table to track pending, accepted,
-- expired, and revoked invitations separately from team_members.

CREATE TABLE IF NOT EXISTS team_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  email text NOT NULL,
  role text DEFAULT 'member' NOT NULL,
  invited_by uuid REFERENCES auth.users(id) NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + interval '7 days') NOT NULL,
  accepted_at timestamptz
);

ALTER TABLE team_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_invites_select ON team_invites FOR SELECT
  USING (org_id IN (SELECT auth_user_entity_ids()));

CREATE POLICY team_invites_insert ON team_invites FOR INSERT
  WITH CHECK (org_id IN (SELECT auth_user_entity_ids()));
