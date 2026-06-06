-- =============================================================================
-- 040_seed_coa_on_bootstrap.sql — Auto-seed GAAP chart of accounts on bootstrap
-- =============================================================================
-- Problem: bootstrap_onboarding creates org + entity but does NOT seed any
--          GL accounts. New users start with zero chart_of_accounts rows.
--
-- Solution:
--   1. A SECURITY DEFINER helper that inserts 31 standard GAAP accounts
--   2. Update bootstrap_onboarding to call it after entity creation
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. seed_default_chart_of_accounts(p_entity_id uuid)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_default_chart_of_accounts(p_entity_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO chart_of_accounts (entity_id, code, name, type) VALUES
    -- Assets
    (p_entity_id, '1010', 'Cash & Cash Equivalents',       'asset'),
    (p_entity_id, '1100', 'Accounts Receivable',            'asset'),
    (p_entity_id, '1200', 'Prepaid Expenses',               'asset'),
    -- Liabilities
    (p_entity_id, '2010', 'Accounts Payable',               'liability'),
    (p_entity_id, '2100', 'Accrued Liabilities',            'liability'),
    -- Equity
    (p_entity_id, '3010', 'Retained Earnings',              'equity'),
    -- Revenue
    (p_entity_id, '4010', 'Product Revenue',                'revenue'),
    (p_entity_id, '4020', 'Service Revenue',                'revenue'),
    (p_entity_id, '4030', 'Subscription Revenue',           'revenue'),
    -- Cost of Goods Sold (account_type enum has no 'cogs'; uses 'expense')
    (p_entity_id, '5010', 'Cost of Goods Sold',             'expense'),
    -- Operating Expenses
    (p_entity_id, '5110', 'Software Dev Infrastructure',    'expense'),
    (p_entity_id, '5120', 'Design Software Subscriptions',  'expense'),
    (p_entity_id, '5130', 'Cloud Hosting & Compute',        'expense'),
    (p_entity_id, '5200', 'Third-Party API Services',       'expense'),
    (p_entity_id, '6010', 'Salaries & Wages',               'expense'),
    (p_entity_id, '6020', 'Employee Benefits',              'expense'),
    (p_entity_id, '6030', 'Payroll Taxes',                  'expense'),
    (p_entity_id, '6110', 'Office & Co-working Space',      'expense'),
    (p_entity_id, '6120', 'Office Utilities',               'expense'),
    (p_entity_id, '6210', 'Marketing & Advertising',        'expense'),
    (p_entity_id, '6310', 'Travel - Airfare',               'expense'),
    (p_entity_id, '6320', 'Local Transportation',           'expense'),
    (p_entity_id, '6330', 'Travel - Hotel & Lodging',       'expense'),
    (p_entity_id, '6410', 'Business Meals & Entertainment', 'expense'),
    (p_entity_id, '6510', 'Office Supplies & Equipment',    'expense'),
    (p_entity_id, '6610', 'Professional Services',          'expense'),
    (p_entity_id, '6620', 'Legal & Compliance',             'expense'),
    (p_entity_id, '6710', 'Insurance',                      'expense'),
    (p_entity_id, '6810', 'Depreciation',                   'expense'),
    (p_entity_id, '7010', 'Bank Fees & Charges',            'expense'),
    (p_entity_id, '7020', 'Interest Expense',               'expense')
  ON CONFLICT (entity_id, code) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 2. Updated bootstrap_onboarding — now calls seed_default_chart_of_accounts
-- ---------------------------------------------------------------------------
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
  v_is_new_entity boolean := false;
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

    v_is_new_entity := true;
  END IF;

  -- Seed default GAAP chart of accounts for new entities
  IF v_is_new_entity THEN
    PERFORM seed_default_chart_of_accounts(v_entity_id);
  END IF;

  RETURN jsonb_build_object(
    'orgId', v_org_id,
    'entityId', v_entity_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant execute (CREATE OR REPLACE preserves grants, but be explicit)
GRANT EXECUTE ON FUNCTION bootstrap_onboarding(text, text, text) TO authenticated;
