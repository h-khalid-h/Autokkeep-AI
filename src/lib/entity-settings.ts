/**
 * Entity Settings Service
 *
 * Provides entity-scoped configuration via the entity_settings table.
 * Each setting is a key-value pair (key: string, value: JSONB).
 *
 * Primary use case: configurable GL codes per entity, replacing hardcoded
 * defaults like '1010' (Cash), '2900' (Suspense), '6510' (Default Expense).
 */

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ── Default GL Code Map ─────────────────────────────────────────────────────
// These defaults match the previous hardcoded values and are used when
// an entity has no override in entity_settings.

const GL_DEFAULTS: Record<string, string> = {
  cash_gl: '1010',           // Cash & Bank
  suspense_gl: '2900',       // Suspense / Clearing
  default_expense_gl: '6510', // Office Supplies & Equipment
  bank_fees_gl: '6180',      // Bank Fees & Charges
};

/**
 * Get a GL code for an entity, falling back to the hardcoded default.
 *
 * @param supabase - Supabase client (admin or server)
 * @param entityId - The entity to look up settings for
 * @param key - The setting key (e.g. 'cash_gl', 'suspense_gl')
 * @returns The GL code string
 */
export async function getGLCode(
  supabase: SupabaseQueryClient,
  entityId: string,
  key: keyof typeof GL_DEFAULTS
): Promise<string> {
  try {
    const { data } = await supabase
      .from('entity_settings')
      .select('value')
      .eq('entity_id', entityId)
      .eq('key', `gl_code:${key}`)
      .single();

    if (data?.value && typeof data.value === 'string') {
      return data.value;
    }
    // JSONB value — extract the code
    if (data?.value && typeof data.value === 'object' && 'code' in (data.value as Record<string, unknown>)) {
      return (data.value as Record<string, string>).code;
    }
  } catch {
    // Setting not found — fall through to default
  }

  return GL_DEFAULTS[key] ?? '6510';
}

/**
 * Get a generic entity setting.
 *
 * @param supabase - Supabase client
 * @param entityId - The entity ID
 * @param key - Setting key
 * @param fallback - Default value if not set
 */
export async function getEntitySetting<T = unknown>(
  supabase: SupabaseQueryClient,
  entityId: string,
  key: string,
  fallback: T
): Promise<T> {
  try {
    const { data } = await supabase
      .from('entity_settings')
      .select('value')
      .eq('entity_id', entityId)
      .eq('key', key)
      .single();

    if (data?.value !== undefined && data?.value !== null) {
      return data.value as T;
    }
  } catch {
    // Not found
  }

  return fallback;
}

/**
 * Set an entity setting (upsert).
 */
export async function setEntitySetting(
  supabase: SupabaseQueryClient,
  entityId: string,
  key: string,
  value: unknown
): Promise<void> {
  await supabase
    .from('entity_settings')
    .upsert(
      { entity_id: entityId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'entity_id,key' }
    );
}
