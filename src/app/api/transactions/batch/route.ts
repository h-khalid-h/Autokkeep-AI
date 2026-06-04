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

    // ── Period-lock check: filter out transactions in locked periods ──
    const { data: fetchedTxs } = await db
      .from('transactions')
      .select('id, date')
      .in('id', transactionIds)
      .eq('entity_id', entityId);

    const txRows = fetchedTxs || [];

    // Gather unique year-month combos from the transactions
    const periodKeys = new Set<string>();
    for (const tx of txRows) {
      const [yr, mo] = (tx.date as string).split('-');
      periodKeys.add(`${yr}-${parseInt(mo, 10)}`);
    }

    // Batch-fetch locked periods for this entity
    const lockedSet = new Set<string>();
    if (periodKeys.size > 0) {
      const { data: periods } = await db
        .from('accounting_periods')
        .select('year, month, is_locked')
        .eq('entity_id', entityId)
        .eq('is_locked', true);

      for (const p of periods || []) {
        lockedSet.add(`${p.year}-${p.month}`);
      }
    }

    // Partition transactions into locked / unlocked
    const lockedIds: string[] = [];
    const unlockedIds: string[] = [];

    for (const tx of txRows) {
      const [yr2, mo2] = (tx.date as string).split('-');
      const key = `${yr2}-${parseInt(mo2, 10)}`;
      if (lockedSet.has(key)) {
        lockedIds.push(tx.id as string);
      } else {
        unlockedIds.push(tx.id as string);
      }
    }

    if (unlockedIds.length === 0 && lockedIds.length > 0) {
      return NextResponse.json(
        { error: 'All selected transactions are in locked accounting periods' },
        { status: 409 }
      );
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

    // Batch update only unlocked transactions
    const { data: updated, error: updateError } = await db
      .from('transactions')
      .update(updatePayload)
      .in('id', unlockedIds)
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

    const response: Record<string, unknown> = {
      success: true,
      action,
      updated: updated?.length || 0,
      total: transactionIds.length,
    };

    if (lockedIds.length > 0) {
      response.warning = `${lockedIds.length} transaction(s) skipped because they are in locked accounting periods`;
      response.skipped_locked_ids = lockedIds;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Batch] Error:', error);
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 });
  }
}
