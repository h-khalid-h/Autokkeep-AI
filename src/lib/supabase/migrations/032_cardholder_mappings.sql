-- =============================================================================
-- 032: Cardholder Mappings
-- =============================================================================
-- Explicit admin-defined mappings from card holder names (from bank feeds)
-- to team member user IDs. Used by the chase agent for reliable routing
-- instead of fuzzy name matching.

CREATE TABLE IF NOT EXISTS cardholder_mappings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  card_holder    text NOT NULL,
  card_last4     varchar(4),
  mapped_user_id uuid NOT NULL,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(entity_id, card_holder)
);

ALTER TABLE cardholder_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity-scoped cardholder mappings"
  ON cardholder_mappings FOR ALL
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

CREATE INDEX idx_cardholder_mappings_entity ON cardholder_mappings (entity_id);
CREATE INDEX idx_cardholder_mappings_lookup ON cardholder_mappings (entity_id, card_holder);
