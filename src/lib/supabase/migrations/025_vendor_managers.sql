-- =============================================================================
-- 025: Vendor Manager Model (G2)
-- =============================================================================
-- Routes receipt chases to the person responsible for that vendor relationship,
-- not just the card holder. Pattern-based matching allows wildcards (e.g. 'AMAZON%').

CREATE TABLE IF NOT EXISTS vendor_managers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_pattern  text NOT NULL,
  manager_user_id uuid NOT NULL,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(entity_id, vendor_pattern)
);

ALTER TABLE vendor_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity-scoped vendor managers"
  ON vendor_managers FOR ALL
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

CREATE INDEX idx_vendor_managers_entity ON vendor_managers (entity_id);
CREATE INDEX idx_vendor_managers_pattern ON vendor_managers (entity_id, vendor_pattern);
