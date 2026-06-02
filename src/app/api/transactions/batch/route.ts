import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'batch-txn' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { transactionIds, action, entityId } = body;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json({ error: 'transactionIds array is required' }, { status: 400 });
    }
    if (transactionIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 transactions per batch' }, { status: 400 });
    }
    // Validate all IDs are non-empty strings (prevents type confusion)
    if (!transactionIds.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
      return NextResponse.json({ error: 'All transactionIds must be non-empty strings' }, { status: 400 });
    }
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be "approve" or "reject"' }, { status: 400 });
    }
    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json({ error: 'entityId is required' }, { status: 400 });
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

    // Build update payload with action-specific fields
    const updatePayload: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
    };
    if (action === 'reject') {
      updatePayload.deleted_at = now;
      updatePayload.deleted_by = user.id;
    }
    if (action === 'approve') {
      updatePayload.confidence = 100;
    }

    // Batch update all selected transactions
    const { data: updated, error: updateError } = await db
      .from('transactions')
      .update(updatePayload)
      .in('id', transactionIds)
      .eq('entity_id', entityId)
      .select('id');

    if (updateError) {
      console.error('[Batch] Update error:', updateError);
      return NextResponse.json({ error: 'Failed to update transactions' }, { status: 500 });
    }

    // Audit log
    await writeAuditLog({
      supabase: db,
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
