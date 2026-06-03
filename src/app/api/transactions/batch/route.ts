import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';
import { z } from 'zod';

const batchSchema = schemas.batchTransactions.extend({
  entityId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'batch-txn' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const parsed = await parseBody(request, batchSchema);
    if (!parsed.success) return parsed.error;
    const { transactionIds, action, entityId } = parsed.data;

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
