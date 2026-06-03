-- =============================================================================
-- 020_entity_settings.sql — Entity-scoped configuration table
-- =============================================================================
-- Provides a key-value store for per-entity settings such as configurable
-- GL codes (suspense, cash, default expense), enabling entities to override
-- hardcoded defaults without code changes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS entity_settings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  key        text        NOT NULL,
  value      jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id, key)
);

-- RLS: entity-scoped, same pattern as all financial tables
ALTER TABLE entity_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_settings_select" ON entity_settings;
CREATE POLICY "entity_settings_select" ON entity_settings
  FOR SELECT USING (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "entity_settings_insert" ON entity_settings;
CREATE POLICY "entity_settings_insert" ON entity_settings
  FOR INSERT WITH CHECK (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "entity_settings_update" ON entity_settings;
CREATE POLICY "entity_settings_update" ON entity_settings
  FOR UPDATE USING (entity_id IN (SELECT auth_user_entity_ids()));

DROP POLICY IF EXISTS "entity_settings_delete" ON entity_settings;
CREATE POLICY "entity_settings_delete" ON entity_settings
  FOR DELETE USING (entity_id IN (SELECT auth_user_entity_ids()));

-- Performance index
CREATE INDEX IF NOT EXISTS idx_entity_settings_entity_key
  ON entity_settings(entity_id, key);
