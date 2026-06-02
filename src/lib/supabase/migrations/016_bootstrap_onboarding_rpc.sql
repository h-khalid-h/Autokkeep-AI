-- =============================================================================
-- 016_bootstrap_onboarding_rpc.sql — SECURITY DEFINER function for onboarding
-- =============================================================================
-- Problem: New users can't create their first organization via client-side
-- Supabase because RLS policies require existing org membership (chicken & egg).
-- 
-- Solution: A SECURITY DEFINER function that runs with elevated privileges,
-- while still verifying the caller is authenticated via auth.uid().
-- =============================================================================

CREATE OR REPLACE FUNCTION bootstrap_onboarding(
  p_entity_name text,
  p_fiscal_year_end text DEFAULT '12',
  p_currency text DEFAULT 'USD'
)
RETURNS jsonb AS $$
DECLARE
  v_user_id uuid;
  v_org_id uuid;
  v_entity_id uuid;
  v_existing_org_id uuid;
  v_slug text;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if user already has an org
  SELECT org_id INTO v_existing_org_id
  FROM team_members
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing_org_id IS NOT NULL THEN
    v_org_id := v_existing_org_id;
  ELSE
    -- Create slug
    v_slug := lower(regexp_replace(p_entity_name || '-org', '[^a-z0-9-]', '', 'g'));
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 8);

    -- Create organization
    INSERT INTO organizations (name, slug, owner_id)
    VALUES (p_entity_name || ' Org', v_slug, v_user_id)
    RETURNING id INTO v_org_id;

    -- Add user as owner team member
    INSERT INTO team_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner');
  END IF;

  -- Create entity
  INSERT INTO entities (org_id, name, fiscal_year_end)
  VALUES (v_org_id, p_entity_name, p_fiscal_year_end)
  RETURNING id INTO v_entity_id;

  RETURN jsonb_build_object(
    'orgId', v_org_id,
    'entityId', v_entity_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION bootstrap_onboarding(text, text, text) TO authenticated;
