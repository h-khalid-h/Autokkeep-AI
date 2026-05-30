import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { createServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { removeItem } from '@/lib/plaid/client';
import { decryptToken } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-disconnect' });
    if (limited) return limited;

    const supabase = await createServerClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connectionId } = await request.json();
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    // Validate access
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: connection } = await (supabase as any)
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
      // Continue anyway — mark as disconnected in our DB
    }

    // Mark connection as disconnected
    await (supabase as any)
      .from('bank_connections')
      .update({
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    // Audit log
    await writeAuditLog({
      supabase,
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
    console.error('[Plaid Disconnect] Error:', error);
    return NextResponse.json({ error: 'Failed to disconnect bank' }, { status: 500 });
  }
}
