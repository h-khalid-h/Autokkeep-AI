import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { handleApiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { removeItem } from '@/lib/plaid/client';
import { decryptToken } from '@/lib/crypto';
import { parseBody, schemas } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-disconnect' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const result = await parseBody(request, schemas.plaidDisconnect);
    if (!result.success) return result.error;
    const { connectionId } = result.data;

    // Validate access
    const { data: connection } = await db
      .from('bank_connections')
      .select('*, entity:entities!inner(org_id)')
      .eq('id', connectionId)
      .single();

    if (!connection || connection.entity?.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Connection not found or access denied' }, { status: 404 });
    }

    // Revoke Plaid access token
    try {
      await removeItem(decryptToken(connection.plaid_access_token));
    } catch (err) {
      console.error('[Plaid Disconnect] Failed to revoke token:', err);
      captureException(err);
      // Continue anyway — mark as disconnected in our DB
    }

    // Mark connection as disconnected
    await db
      .from('bank_connections')
      .update({
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId: connection.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'bank_connection',
      targetId: connectionId,
      details: { institution_name: connection.institution_name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'plaid/disconnect', 'Failed to disconnect bank');
  }
}
