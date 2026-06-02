-- =============================================================================
-- 015_onboarding_rls_fix.sql — Fix bootstrapping for new user onboarding
-- =============================================================================
-- Problem: New users can't create their first organization because:
--   1. organizations has no INSERT policy
--   2. team_members INSERT requires org_id IN auth_user_org_ids() (empty for new users)
--   3. entities INSERT requires org_id IN auth_user_org_ids() (also empty)
-- 
-- Solution: Allow authenticated users to:
--   - INSERT into organizations where they set themselves as owner_id
--   - INSERT into team_members where they set themselves as user_id and own the org
--   - INSERT into entities only after they have an org membership (existing policy works after bootstrap)
-- =============================================================================

-- 1. Allow authenticated users to create a new organization (they must be the owner)
DROP POLICY IF EXISTS "organizations_insert" ON organizations;
CREATE POLICY "organizations_insert" ON organizations
  FOR INSERT WITH CHECK (
    auth.uid() = owner_id
  );

-- 2. Allow authenticated users to add THEMSELVES as the first team member of an org they own
--    This uses a direct check on the organizations table (not auth_user_org_ids which is empty)
DROP POLICY IF EXISTS "team_members_self_insert" ON team_members;
CREATE POLICY "team_members_self_insert" ON team_members
  FOR INSERT WITH CHECK (
    -- Either they're already a member (existing policy handles this via auth_user_org_ids),
    -- OR they are the owner of the org and are inserting themselves
    (
      org_id IN (SELECT auth_user_org_ids())
    )
    OR
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM organizations WHERE id = org_id AND owner_id = auth.uid()
      )
    )
  );
