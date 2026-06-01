-- =============================================================================
-- Chase Agent Schema Additions
-- Adds missing tables and columns required by the receipt chase system
-- =============================================================================

-- 1. Chase opt-outs table (C3)
-- Tracks users who have opted out of receipt chase messages
CREATE TABLE IF NOT EXISTS chase_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  channel_type text NOT NULL, -- 'sms', 'whatsapp', 'slack', 'teams'
  channel_identifier text NOT NULL, -- phone number, slack user id, etc.
  opted_out_at timestamptz DEFAULT now(),
  opted_back_in_at timestamptz,
  is_active boolean DEFAULT true,
  UNIQUE(entity_id, channel_type, channel_identifier)
);

CREATE INDEX IF NOT EXISTS idx_chase_opt_outs_entity ON chase_opt_outs(entity_id);
CREATE INDEX IF NOT EXISTS idx_chase_opt_outs_active ON chase_opt_outs(entity_id, is_active) WHERE is_active;

-- 2. Add escalation columns to receipt_requests (C4)
ALTER TABLE receipt_requests ADD COLUMN IF NOT EXISTS escalation_level text DEFAULT 'standard';
ALTER TABLE receipt_requests ADD COLUMN IF NOT EXISTS chase_count integer DEFAULT 0;

-- 3. Add webhook_url to channel_connections (C5)
-- Used for Microsoft Teams incoming webhook dispatch
ALTER TABLE channel_connections ADD COLUMN IF NOT EXISTS webhook_url text;

-- 4. RLS for chase_opt_outs
ALTER TABLE chase_opt_outs ENABLE ROW LEVEL SECURITY;

CREATE POLICY chase_opt_outs_select ON chase_opt_outs FOR SELECT
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY chase_opt_outs_insert ON chase_opt_outs FOR INSERT
  WITH CHECK (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

CREATE POLICY chase_opt_outs_update ON chase_opt_outs FOR UPDATE
  USING (entity_id IN (
    SELECT e.id FROM entities e
    JOIN team_members tm ON tm.org_id = e.org_id
    WHERE tm.user_id = auth.uid()
  ));

-- Service role policies (for cron jobs using service role key)
CREATE POLICY chase_opt_outs_service_select ON chase_opt_outs FOR SELECT
  TO service_role USING (true);

CREATE POLICY chase_opt_outs_service_insert ON chase_opt_outs FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY chase_opt_outs_service_update ON chase_opt_outs FOR UPDATE
  TO service_role USING (true);

-- Service role policies for receipt_requests (chase agent uses service role)
-- These may already exist, so use IF NOT EXISTS pattern
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipt_requests' AND policyname = 'receipt_requests_service_select'
  ) THEN
    CREATE POLICY receipt_requests_service_select ON receipt_requests FOR SELECT
      TO service_role USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipt_requests' AND policyname = 'receipt_requests_service_insert'
  ) THEN
    CREATE POLICY receipt_requests_service_insert ON receipt_requests FOR INSERT
      TO service_role WITH CHECK (true);
  END IF;
END $$;
