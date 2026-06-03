/**
 * Vendor Manager Resolution Service
 *
 * Resolves which team member (vendor manager) is responsible for a
 * given merchant/vendor. Uses ILIKE pattern matching against the
 * vendor_managers table, then resolves the manager's profile from
 * team_members.
 *
 * Used by the chase agent to route receipt requests to the correct
 * person instead of (or in addition to) the card holder.
 */

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ── Types ───────────────────────────────────────────────────────────────────

export interface VendorManagerResult {
  userId: string;
  email?: string;
  name?: string;
}

interface VendorManagerRow {
  id: string;
  entity_id: string;
  vendor_pattern: string;
  manager_user_id: string;
  created_at: string;
}

interface TeamMemberRow {
  user_id: string;
  invited_email: string | null;
  display_name: string | null;
}

// ── Core Resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the vendor manager for a given merchant name within an entity.
 *
 * Queries the `vendor_managers` table using ILIKE pattern matching
 * (e.g., pattern `%AMAZON%` would match merchant "Amazon Web Services").
 * If a match is found, resolves the manager's email/name from `team_members`.
 *
 * @param db - Supabase query client
 * @param entityId - The entity to scope the lookup to
 * @param merchantName - The merchant name to match against vendor patterns
 * @returns The resolved vendor manager, or null if no match
 */
export async function resolveVendorManager(
  db: SupabaseQueryClient,
  entityId: string,
  merchantName: string
): Promise<VendorManagerResult | null> {
  if (!merchantName || !entityId) return null;

  try {
    // Query vendor_managers for a pattern that matches the merchant name
    const { data: managers, error: managerError } = await db
      .from('vendor_managers')
      .select('id, entity_id, vendor_pattern, manager_user_id, created_at')
      .eq('entity_id', entityId);

    if (managerError || !managers || managers.length === 0) {
      return null;
    }

    // Find first matching pattern using ILIKE-style comparison
    // Patterns are stored like '%AMAZON%' or 'Amazon%'
    const matchedManager = (managers as VendorManagerRow[]).find((mgr) => {
      const pattern = mgr.vendor_pattern;
      // Convert SQL ILIKE pattern to a JS regex:
      // '%' → '.*', '_' → '.', escape everything else
      const regexStr = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars first
        .replace(/%/g, '.*')                      // then convert SQL wildcards
        .replace(/_/g, '.');
      try {
        const regex = new RegExp(`^${regexStr}$`, 'i');
        return regex.test(merchantName);
      } catch {
        // Invalid pattern — skip
        return false;
      }
    });

    if (!matchedManager) return null;

    // Resolve the manager's profile from team_members
    const { data: memberData } = await db
      .from('team_members')
      .select('user_id, invited_email, display_name')
      .eq('user_id', matchedManager.manager_user_id)
      .limit(1);

    const member = (memberData as TeamMemberRow[] | null)?.[0];

    return {
      userId: matchedManager.manager_user_id,
      email: member?.invited_email ?? undefined,
      name: member?.display_name ?? undefined,
    };
  } catch (error) {
    console.error('[VendorManager] Resolution error:', error);
    return null;
  }
}
