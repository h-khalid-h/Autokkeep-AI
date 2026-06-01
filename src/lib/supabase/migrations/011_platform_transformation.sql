-- =============================================================================
-- Autokkeep AI Platform Transformation Migration
-- From bookkeeping tool → AI Financial Operations Platform
-- =============================================================================

-- 1. Multi-currency: Add exchange rate fields to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS base_currency varchar(3) DEFAULT 'USD';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS exchange_rate decimal(12,6) DEFAULT 1.0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS converted_amount decimal(15,2);

-- 2. Entity localization
ALTER TABLE entities ADD COLUMN IF NOT EXISTS locale varchar(10) DEFAULT 'en-US';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS timezone varchar(50) DEFAULT 'UTC';
ALTER TABLE entities ADD COLUMN IF NOT EXISTS country varchar(2) DEFAULT 'US';

-- 3. AI Conversations table (for AI Financial Analyst chat)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_entity ON ai_conversations(entity_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);

-- 4. Financial Narratives table (monthly reports)
CREATE TABLE IF NOT EXISTS financial_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  narrative jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(entity_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_financial_narratives_entity ON financial_narratives(entity_id);

-- 5. Health Alerts table (anomaly detection)
CREATE TABLE IF NOT EXISTS health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  description text NOT NULL,
  data jsonb,
  is_read boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_alerts_entity ON health_alerts(entity_id);
CREATE INDEX IF NOT EXISTS idx_health_alerts_unread ON health_alerts(entity_id, is_read) WHERE NOT is_read;

-- 6. RLS for new tables
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_conversations
CREATE POLICY ai_conversations_select ON ai_conversations FOR SELECT
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY ai_conversations_insert ON ai_conversations FOR INSERT
  WITH CHECK (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY ai_conversations_update ON ai_conversations FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY ai_conversations_delete ON ai_conversations FOR DELETE
  USING (user_id = auth.uid());

-- RLS policies for financial_narratives (read via entity access)
CREATE POLICY financial_narratives_select ON financial_narratives FOR SELECT
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

-- RLS policies for health_alerts (read via entity access)
CREATE POLICY health_alerts_select ON health_alerts FOR SELECT
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY health_alerts_update ON health_alerts FOR UPDATE
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

-- 7. Update subscription_plan enum for new pricing
-- Note: Can't ALTER ENUM easily, so we use text columns for plan in organizations table
-- The organizations.plan column is already text type, so no change needed

-- 8. Updated_at trigger for ai_conversations
CREATE TRIGGER trg_ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
