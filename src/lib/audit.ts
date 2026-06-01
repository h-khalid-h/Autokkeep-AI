// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Centralized Audit Logger (SOC 2 / SOX Compliant)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest } from 'next/server';

/**
 * Valid audit_action enum values matching the PostgreSQL schema.
 */
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'categorize'
  | 'approve'
  | 'revoke'
  | 'export'
  | 'sync'
  | 'login'
  | 'connect'
  | 'disconnect'
  | 'receipt_upload'
  | 'pipeline_processed'
  | 'webhook_received';

const VALID_ACTIONS: Set<string> = new Set([
  'create', 'update', 'delete', 'categorize', 'approve', 'revoke',
  'export', 'sync', 'login', 'connect', 'disconnect', 'receipt_upload',
  'pipeline_processed', 'webhook_received',
]);

/**
 * Maps an arbitrary action string to a valid audit_action enum value.
 * Non-standard actions are mapped to the closest valid enum value
 * and the original action is preserved in the details object.
 */
function normalizeAction(action: string): { normalized: AuditAction; wasRemapped: boolean } {
  if (VALID_ACTIONS.has(action)) {
    return { normalized: action as AuditAction, wasRemapped: false };
  }

  // Map common webhook event types to 'webhook_received'
  const lower = action.toLowerCase();
  if (lower.includes('webhook') || lower.includes('event') || lower.startsWith('customer.') || lower.startsWith('invoice.') || lower.startsWith('checkout.')) {
    return { normalized: 'webhook_received', wasRemapped: true };
  }

  // Map sync-related actions
  if (lower.includes('sync') || lower.includes('refresh') || lower.includes('exchange')) {
    return { normalized: 'sync', wasRemapped: true };
  }

  // Map categorization-related actions
  if (lower.includes('categori') || lower.includes('classify')) {
    return { normalized: 'categorize', wasRemapped: true };
  }

  // Default: treat as 'update'
  return { normalized: 'update', wasRemapped: true };
}

interface AuditLogEntry {
  supabase: { from: (table: string) => { insert: (data: Record<string, unknown>) => unknown } };
  entityId?: string;
  actorId?: string;
  actorType: 'human' | 'ai' | 'system';
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown> | object;
  request?: NextRequest | Request;
}

/**
 * Writes a structured audit log entry with IP address and user agent.
 * Fire-and-forget — never throws; logs error to console on failure.
 * 
 * Automatically normalizes action strings to valid PostgreSQL enum values.
 */
export async function writeAuditLog({
  supabase,
  entityId = 'system',
  actorId = 'system',
  actorType,
  action,
  targetType,
  targetId,
  details = {},
  request,
}: AuditLogEntry): Promise<void> {
  try {
    // Extract IP and user agent from request headers
    let ipAddress = 'unknown';
    let userAgent = 'unknown';

    if (request) {
      const headers = request.headers;
      ipAddress =
        headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headers.get('x-real-ip') ||
        'unknown';
      userAgent = headers.get('user-agent') || 'unknown';
    }

    // Normalize action to valid enum value
    const { normalized, wasRemapped } = normalizeAction(action);
    const enrichedDetails = wasRemapped
      ? { ...details as Record<string, unknown>, original_action: action }
      : details;

    await supabase.from('audit_log').insert({
      entity_id: entityId,
      actor_id: actorId,
      actor_type: actorType,
      action: normalized,
      target_type: targetType,
      target_id: targetId || null,
      details: enrichedDetails,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('[Audit] Failed to write audit log:', error);
  }
}
