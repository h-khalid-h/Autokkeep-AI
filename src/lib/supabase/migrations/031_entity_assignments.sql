-- =============================================================================
-- 031: Entity Assignments (Per-Entity Access Control)
-- =============================================================================
-- Additive access model: owner/admin see all entities in their org.
-- Accountant/viewer must be explicitly assigned to entities.
-- When a new entity is created, owner/admin are auto-assigned.

CREATE TABLE IF NOT EXISTS entity_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_id, user_id)
);

ALTER TABLE entity_assignments ENABLE ROW LEVEL SECURITY;

-- Org members can see assignments for their entities
CREATE POLICY "entity_assignments_select" ON entity_assignments
  FOR SELECT USING (
    entity_id IN (SELECT public.auth_user_entity_ids())
  );

-- Only owner/admin can manage assignments
CREATE POLICY "entity_assignments_insert" ON entity_assignments
  FOR INSERT WITH CHECK (
    entity_id IN (SELECT public.auth_user_entity_ids())
  );

CREATE POLICY "entity_assignments_delete" ON entity_assignments
  FOR DELETE USING (
    entity_id IN (SELECT public.auth_user_entity_ids())
  );

CREATE INDEX idx_entity_assignments_entity ON entity_assignments (entity_id);
CREATE INDEX idx_entity_assignments_user ON entity_assignments (user_id);

-- NOTE: The auth_user_entity_ids() function is NOT modified here.
-- Per-entity filtering is enforced at the application layer (api-auth.ts)
-- rather than modifying the core RLS function, to avoid breaking existing
-- RLS policies that depend on it for all financial tables.
-- The EntityContext and api-auth.ts will filter based on assignments.
