-- =============================================================================
-- 016_bootstrap_onboarding_rpc.sql — SECURITY DEFINER function for onboarding
-- =============================================================================
-- Problem: New users can't create their first organization via client-side
-- Supabase because RLS policies require existing org membership (chicken & egg).
-- 
-- Solution: A SECURITY DEFINER function that runs with elevated privileges,
-- while still verifying the caller is authenticated via auth.uid().
--
-- Fixes applied:
--   M7:  Input length validation on p_entity_name
--   H1:  Entity idempotency — reuse existing entity with same name in org
--   M10: Use p_currency to set base_currency on the entities table
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
  v_entity_count integer;
BEGIN
  -- Get the authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- M7: Input length validation
  IF length(p_entity_name) > 255 THEN
    RAISE EXCEPTION 'Entity name exceeds maximum length of 255 characters';
  END IF;

  IF length(trim(p_entity_name)) = 0 THEN
    RAISE EXCEPTION 'Entity name cannot be empty';
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

  -- H1: Entity idempotency — check if entity with same name exists in this org
  SELECT id INTO v_entity_id
  FROM entities
  WHERE org_id = v_org_id
    AND name = p_entity_name
  LIMIT 1;

  IF v_entity_id IS NULL THEN
    -- L2: Limit entities per org to prevent abuse
    SELECT count(*) INTO v_entity_count FROM entities WHERE org_id = v_org_id;
    IF v_entity_count >= 10 THEN
      RAISE EXCEPTION 'Maximum of 10 entities per organization reached';
    END IF;

    -- Create new entity with base_currency from p_currency (M10)
    INSERT INTO entities (org_id, name, fiscal_year_end, base_currency)
    VALUES (v_org_id, p_entity_name, p_fiscal_year_end, p_currency)
    RETURNING id INTO v_entity_id;
  END IF;

  RETURN jsonb_build_object(
    'orgId', v_org_id,
    'entityId', v_entity_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users only
GRANT EXECUTE ON FUNCTION bootstrap_onboarding(text, text, text) TO authenticated;
