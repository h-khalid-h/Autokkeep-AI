-- =============================================================================
-- 030: User Notification Preferences (account-level)
-- =============================================================================
-- Stores per-user account-level notification channel toggles (email, slack, sms).
-- These are distinct from the per-entity channel_preferences in migration 027,
-- which control receipt-chase routing per entity. This table controls global
-- notification delivery preferences shown on the Account Settings page.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE,
  email       boolean NOT NULL DEFAULT true,
  slack       boolean NOT NULL DEFAULT false,
  sms         boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read/write their own notification preferences
CREATE POLICY "Users manage own notification preferences"
  ON user_notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_user_notification_prefs_user
  ON user_notification_preferences (user_id);
