-- =============================================================================
-- 027: Per-User Channel Preferences (G4) + Email channel_type (G9)
-- =============================================================================
-- Allows individual team members to choose how they want to be contacted
-- for receipt chases and notifications (Slack, Teams, email, SMS, WhatsApp).

-- Add 'email' to the channel_type enum for G9
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'email';

CREATE TABLE user_channel_preferences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  entity_id           uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  preferred_channel   channel_type NOT NULL DEFAULT 'slack',
  channel_identifier  text,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(user_id, entity_id)
);

ALTER TABLE user_channel_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own preferences
CREATE POLICY "Users manage own channel preferences"
  ON user_channel_preferences FOR ALL
  USING (user_id = auth.uid());

-- Admins can view all preferences for their entities (for chase routing)
CREATE POLICY "Admins view entity preferences"
  ON user_channel_preferences FOR SELECT
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

CREATE INDEX idx_user_channel_prefs_lookup
  ON user_channel_preferences (user_id, entity_id);
