-- =============================================================================
-- Autokkeep AI — Development Seed Data
-- =============================================================================
-- Run AFTER schema.sql and rls.sql.
-- Uses deterministic UUIDs so seeds are idempotent (re-runnable).
-- NOTE: User IDs are NOT included — create users via Supabase Auth first,
--       then insert a team_members row linking the user to the org.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Organization
-- ---------------------------------------------------------------------------
INSERT INTO organizations (id, name, slug)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Acme Corp',
  'acme-corp'
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Entity
-- ---------------------------------------------------------------------------
INSERT INTO entities (id, org_id, name, legal_name, base_currency, fiscal_year_end)
VALUES (
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Acme Corp - US',
  'Acme Corporation',
  'USD',
  '12-31'
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Chart of Accounts (matches mockTransactions.ts chartOfAccounts)
-- ---------------------------------------------------------------------------
INSERT INTO chart_of_accounts (entity_id, code, name, type) VALUES
  ('e0000000-0000-0000-0000-000000000001', '1010', 'Cash & Cash Equivalents',       'asset'),
  ('e0000000-0000-0000-0000-000000000001', '1100', 'Accounts Receivable',            'asset'),
  ('e0000000-0000-0000-0000-000000000001', '1200', 'Prepaid Expenses',               'asset'),
  ('e0000000-0000-0000-0000-000000000001', '2010', 'Accounts Payable',               'liability'),
  ('e0000000-0000-0000-0000-000000000001', '2100', 'Accrued Liabilities',            'liability'),
  ('e0000000-0000-0000-0000-000000000001', '3010', 'Retained Earnings',              'equity'),
  ('e0000000-0000-0000-0000-000000000001', '4010', 'Product Revenue',                'revenue'),
  ('e0000000-0000-0000-0000-000000000001', '4020', 'Service Revenue',                'revenue'),
  ('e0000000-0000-0000-0000-000000000001', '4030', 'Subscription Revenue',           'revenue'),
  ('e0000000-0000-0000-0000-000000000001', '5110', 'Software Dev Infrastructure',    'expense'),
  ('e0000000-0000-0000-0000-000000000001', '5120', 'Design Software Subscriptions',  'expense'),
  ('e0000000-0000-0000-0000-000000000001', '5130', 'Cloud Hosting & Compute',        'expense'),
  ('e0000000-0000-0000-0000-000000000001', '5200', 'Third-Party API Services',       'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6010', 'Salaries & Wages',               'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6020', 'Employee Benefits',              'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6030', 'Payroll Taxes',                  'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6110', 'Office & Co-working Space',      'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6120', 'Office Utilities',               'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6210', 'Marketing & Advertising',        'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6310', 'Travel - Airfare',               'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6320', 'Local Transportation',           'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6330', 'Travel - Hotel & Lodging',       'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6410', 'Business Meals & Entertainment', 'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6510', 'Office Supplies & Equipment',    'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6610', 'Professional Services',          'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6620', 'Legal & Compliance',             'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6710', 'Insurance',                      'expense'),
  ('e0000000-0000-0000-0000-000000000001', '6810', 'Depreciation',                   'expense'),
  ('e0000000-0000-0000-0000-000000000001', '7010', 'Bank Fees & Charges',            'expense'),
  ('e0000000-0000-0000-0000-000000000001', '7020', 'Interest Expense',               'expense')
ON CONFLICT (entity_id, code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Sample Transactions (3 different statuses)
-- ---------------------------------------------------------------------------

-- Transaction 1: pending — unknown vendor, needs human review
INSERT INTO transactions (
  id, entity_id, amount, date,
  merchant_name, merchant_raw, description,
  status, confidence, document_status,
  card_holder, card_last4, mcc_code, raw_bank_description, currency,
  tags, aging_days
) VALUES (
  't0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  1200.00, '2026-05-24',
  'TX-CORP-98821', 'TX-CORP-98821', 'Unknown vendor — needs categorization',
  'pending', 42, 'missing',
  'James Chen', '4829', '5734', 'TX-CORP-98821 TECH SERV', 'USD',
  ARRAY['Unknown Vendor', 'High Amount'], 4
) ON CONFLICT (id) DO NOTHING;

-- Transaction 2: human_review — AI categorized but low confidence
INSERT INTO transactions (
  id, entity_id, amount, date,
  merchant_name, merchant_raw, description,
  category_ai, confidence, ai_reasoning,
  status, document_status,
  card_holder, card_last4, mcc_code, raw_bank_description, currency,
  tags, aging_days
) VALUES (
  't0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',
  42.50, '2026-05-23',
  'Blue Bottle Coffee', 'BLUE BOTTLE COFFE #127', 'Possible team meeting expense',
  '6410', 89, 'Recognized merchant. Amount higher than typical individual purchase — likely group/client entertainment.',
  'human_review', 'missing',
  'Sarah Martinez', '7712', '5812', 'BLUE BOTTLE COFFE #127 SAN FRAN', 'USD',
  ARRAY['Missing Receipt'], 5
) ON CONFLICT (id) DO NOTHING;

-- Transaction 3: approved — high-confidence, human-verified
INSERT INTO transactions (
  id, entity_id, amount, date,
  merchant_name, merchant_raw, description,
  category_ai, category_human, confidence, ai_reasoning,
  status, document_status, document_url,
  card_holder, card_last4, mcc_code, raw_bank_description, currency,
  tags, aging_days
) VALUES (
  't0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000001',
  540.00, '2026-05-22',
  'Figma Inc.', 'FIGMA INC. ANNUAL', 'Annual design tool subscription',
  '5120', '5120', 97, 'Recognized design tool vendor. Annual subscription matches historical pattern.',
  'approved', 'found', 'https://example.com/invoices/FIG-2026-8821.pdf',
  'Alex Kim', '3341', '5734', 'FIGMA INC. ANNUAL SUBSCRIPTION', 'USD',
  ARRAY['Software'], 6
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Sample Subscription (org on trial)
-- ---------------------------------------------------------------------------
INSERT INTO subscriptions (id, org_id, plan, status)
VALUES (
  's0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'smb_basic',
  'trialing'
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- USAGE:
-- 1. Run schema.sql first
-- 2. Run rls.sql
-- 3. Run this seed.sql
-- 4. Create a user in Supabase Auth (Dashboard → Authentication → Users)
-- 5. Insert a team_members row to link the user to Acme Corp:
--
--    INSERT INTO team_members (org_id, user_id, role, accepted_at)
--    VALUES (
--      'a0000000-0000-0000-0000-000000000001',
--      '<YOUR_AUTH_USER_UUID>',
--      'owner',
--      now()
--    );
-- =============================================================================
