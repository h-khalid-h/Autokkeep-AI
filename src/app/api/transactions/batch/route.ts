import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'batch-txn' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transactionIds, action, entityId } = body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'transactionIds array is required' }, { status: 400 });
    }
    if (transactionIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 transactions per batch' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
    }

    const db = supabase as unknown as SupabaseQueryClient;

    // Validate org access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json({ error: 'Entity not found' }, { status: 403 });
    }

    const newStatus = action === 'approve' ? 'approved' : 'removed';
    const now = new Date().toISOString();

    // Batch update all selected transactions
    const { data: updated, error: updateError } = await db
      .from('transactions')
      .update({
        status: newStatus,
        updated_at: now,
      })
      .in('id', transactionIds)
      .eq('entity_id', entityId)
      .select('id');

    if (updateError) {
      console.error('[Batch] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update transactions' }, { status: 500 });
    }

    // Audit log
    await writeAuditLog({
      supabase,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: action === 'approve' ? 'approve' : 'delete',
      targetType: 'transaction_batch',
      targetId: `batch:${transactionIds.length}`,
      details: {
        transaction_ids: transactionIds,
        action,
        count: updated?.length || 0,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      action,
      updated: updated?.length || 0,
      total: transactionIds.length,
    });
  } catch (error) {
    console.error('[Batch] Error:', error);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
