
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/transactions/[id]/split — Split a transaction into sub-allocations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Schema ─────────────────────────────────────────────────────────────────────

const splitSchema = z.object({
  splits: z
    .array(
      z.object({
        amount: z.number().positive('Each split amount must be positive'),
        glCode: z.string().min(1).max(50),
        glName: z.string().min(1).max(200),
        description: z.string().max(5000).optional(),
      }),
    )
    .min(2, 'At least 2 splits are required'),
});

// ─── POST handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'txn-split' });
    if (limited) return limited;

    // Validate transaction ID format
    const { id } = await context.params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid transaction ID format' }, { status: 400 });
    }

    // Auth
    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json({ error: 'No entity access' }, { status: 403 });
    }

    // Parse & validate body
    const parsed = await parseBody(request, splitSchema);
    if (!parsed.success) return parsed.error;
    const { splits } = parsed.data;

    // ── Fetch the original transaction ──────────────────────────────────
    const { data: original, error: fetchError } = await db
      .from('transactions')
      .select(
        'id, entity_id, bank_account_id, amount, date, merchant_name, merchant_raw, currency, status, is_split, deleted_at',
      )
      .eq('id', id)
      .in('entity_id', entityIds)
      .is('deleted_at', null)
      .single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // ── Business validations ────────────────────────────────────────────

    // Entity access check (belt-and-suspenders — .in() above already scopes)
    if (!entityIds.includes(original.entity_id as string)) {
      return NextResponse.json({ error: 'Access denied to this entity' }, { status: 403 });
    }

    // Cannot split an already-split transaction
    if (original.is_split) {
      return NextResponse.json(
        { error: 'Transaction has already been split' },
        { status: 400 },
      );
    }

    // Sum validation: split amounts must equal original amount (within $0.01)
    const originalAmount =
      typeof original.amount === 'number'
        ? original.amount
        : parseFloat(String(original.amount));

    const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);

    if (Math.abs(splitSum - originalAmount) > 0.01) {
      return NextResponse.json(
        {
          error: `Split amounts must equal the original transaction amount. Expected ${originalAmount}, got ${splitSum}`,
        },
        { status: 400 },
      );
    }

    // ── Mark original as split ──────────────────────────────────────────
    const { error: updateError } = await db
      .from('transactions')
      .update({
        is_split: true,
        status: TRANSACTION_STATUS.APPROVED,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', id);

    if (updateError) {
      console.error('[Transaction Split] Failed to mark parent:', updateError);
      return NextResponse.json({ error: 'Failed to update original transaction' }, { status: 500 });
    }

    // ── Create child transactions ───────────────────────────────────────
    const childRows = splits.map((split, index) => ({
      parent_transaction_id: id,
      entity_id: original.entity_id,
      bank_account_id: original.bank_account_id,
      amount: split.amount,
      date: original.date,
      merchant_name: original.merchant_name,
      merchant_raw: original.merchant_raw,
      currency: original.currency,
      category_human: split.glCode,
      gl_name: split.glName,
      description: split.description || null,
      status: TRANSACTION_STATUS.APPROVED,
      is_split: false,
      split_index: index + 1,
      confidence: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }));

    const { data: createdSplits, error: insertError } = await db
      .from('transactions')
      .insert(childRows)
      .select();

    if (insertError || !createdSplits) {
      console.error('[Transaction Split] Failed to create children:', insertError);
      // Attempt to rollback the parent update
      await db
        .from('transactions')
        .update({ is_split: false, status: original.status })
        .eq('id', id);
      return NextResponse.json({ error: 'Failed to create split transactions' }, { status: 500 });
    }

    // ── Audit log ───────────────────────────────────────────────────────
    await writeAuditLog({
      supabase: db,
      entityId: original.entity_id as string,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'transaction',
      targetId: id,
      details: {
        operation: 'split',
        splitCount: splits.length,
        splitAmounts: splits.map((s) => s.amount),
        childIds: createdSplits.map((c: { id: string }) => c.id),
      },
      request,
    });

    return NextResponse.json({ splits: createdSplits }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'POST /api/transactions/[id]/split', 'Failed to split transaction');
  }
}
