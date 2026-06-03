/**
 * User Channel Preferences Service
 *
 * Manages per-user, per-entity notification channel preferences.
 * Allows users to choose their preferred channel (SMS, WhatsApp,
 * Slack, etc.) for receipt chase messages.
 *
 * When the chase agent resolves a target user, it checks their
 * channel preference first. If set, messages are routed via that
 * channel; otherwise the entity-level channel_connections are used.
 */

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ChannelPreference {
  channel: string;
  identifier: string;
}

interface ChannelPreferenceRow {
  id: string;
  user_id: string;
  entity_id: string;
  channel: string;
  identifier: string;
  updated_at: string;
}

// ── Read Preference ─────────────────────────────────────────────────────────

/**
 * Gets a user's preferred notification channel for a specific entity.
 *
 * @param db - Supabase query client
 * @param userId - The user whose preference to look up
 * @param entityId - The entity scope
 * @returns The channel preference, or null if not set
 */
export async function getUserChannelPreference(
  db: SupabaseQueryClient,
  userId: string,
  entityId: string
): Promise<ChannelPreference | null> {
  if (!userId || !entityId) return null;

  try {
    const { data, error } = await db
      .from('user_channel_preferences')
      .select('id, user_id, entity_id, channel, identifier, updated_at')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .limit(1);

    if (error || !data || data.length === 0) return null;

    const row = (data as ChannelPreferenceRow[])[0];
    return {
      channel: row.channel,
      identifier: row.identifier,
    };
  } catch (error) {
    console.error('[UserChannelPrefs] Read error:', error);
    return null;
  }
}

// ── Write Preference ────────────────────────────────────────────────────────

/**
 * Sets (upserts) a user's preferred notification channel for a specific entity.
 *
 * @param db - Supabase query client
 * @param userId - The user whose preference to set
 * @param entityId - The entity scope
 * @param channel - The channel type (e.g., 'sms', 'whatsapp', 'slack')
 * @param identifier - The channel-specific identifier (phone number, Slack user ID, etc.)
 */
export async function setUserChannelPreference(
  db: SupabaseQueryClient,
  userId: string,
  entityId: string,
  channel: string,
  identifier: string
): Promise<void> {
  try {
    await db
      .from('user_channel_preferences')
      .upsert(
        {
          user_id: userId,
          entity_id: entityId,
          channel,
          identifier,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,entity_id' }
      );
  } catch (error) {
    console.error('[UserChannelPrefs] Write error:', error);
    throw error;
  }
}
