// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Centralized Audit Logger (SOC 2 / SOX Compliant)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest } from 'next/server';

interface AuditLogEntry {
  supabase: any;
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

    await supabase.from('audit_log').insert({
      entity_id: entityId,
      actor_id: actorId,
      actor_type: actorType,
      action,
      target_type: targetType,
      target_id: targetId || null,
      details,
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  } catch (error) {
    // Audit logging should never break the main operation
    console.error('[Audit] Failed to write audit log:', error);
  }
}
