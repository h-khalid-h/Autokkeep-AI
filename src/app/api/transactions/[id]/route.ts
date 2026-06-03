
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT/DELETE /api/transactions/[id] — Single Transaction Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { writeAuditLog } from '@/lib/audit';
import { checkApprovalRequired, requestApproval } from '@/lib/approval';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET: Single transaction with full details ──────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'txn-get' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Fetch transaction scoped to user's entities
    const { data: transaction, error: txError } = await db
      .from('transactions')
      .select('*')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[Transaction Detail] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}

// ─── PUT: Update transaction (approve, change category, add receipt) ────────────

interface UpdateTransactionBody {
  glCode?: string;
  glName?: string;
  status?: string;
  notes?: string;
  receiptUrl?: string;
  receiptId?: string;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'txn-update' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Fetch existing transaction scoped to user's entities
    const { data: entityList } = await db
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (entityList || []).map((e: { id: string }) => e.id);
    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const { data: existing, error: fetchError } = await db
      .from('transactions')
      .select('*')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    let body: UpdateTransactionBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const {
      glCode,
      glName,
      status: newStatus,
      notes,
      receiptUrl,
      receiptId: _receiptId,
    } = body;

    // Validate GL code exists in chart of accounts for this entity
    if (glCode) {
      const { data: coaEntry } = await db
        .from('chart_of_accounts')
        .select('code')
        .eq('entity_id', existing.entity_id)
        .eq('code', glCode)
        .eq('is_active', true)
        .limit(1);

      if (!coaEntry?.length) {
        return NextResponse.json(
          { error: 'Invalid GL code — not found in chart of accounts' },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (glCode !== undefined) {
      // Store as the human-approved category (category_ai is set by the AI pipeline only)
      updateData.category_human = glCode;
    }
    if (glName !== undefined) updateData.gl_name = glName;
    if (notes !== undefined) updateData.description = notes;
    if (receiptUrl !== undefined) {
      // Validate URL format (must be HTTPS)
      try {
        const url = new URL(receiptUrl);
        if (url.protocol !== 'https:') {
          return NextResponse.json(
            { error: 'Receipt URL must use HTTPS protocol' },
            { status: 400 }
          );
        }
        updateData.document_url = receiptUrl;
      } catch {
        return NextResponse.json(
          { error: 'Invalid receipt URL format' },
          { status: 400 }
        );
      }
    }

    // Handle status changes — validate transitions and approval sets confidence to 100
    if (newStatus) {
      // Valid status transition map
      const validTransitions: Record<string, string[]> = {
        pending: ['approved', 'rejected', 'categorization_failed', 'human_review'],
        human_review: ['approved', 'rejected', 'pending'],
        auto_categorized: ['approved', 'rejected', 'human_review'],
        approved: ['syncing', 'synced'],
        rejected: ['pending'],
        syncing: ['synced', 'approved'],
        synced: [], // terminal — no transitions allowed
        escrow_suspense: ['pending', 'approved'],
        categorization_failed: ['pending', 'human_review'],
        removed: [], // terminal — no transitions allowed
        pending_approval: ['approved', 'rejected'], // approval workflow
      };

      const currentStatus = existing.status as string;
      const allowed = validTransitions[currentStatus];

      if (!allowed) {
        return NextResponse.json(
          { error: `Unknown current status: ${currentStatus}` },
          { status: 400 }
        );
      }

      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${currentStatus} → ${newStatus}` },
          { status: 400 }
        );
      }

      updateData.status = newStatus;
      if (newStatus === 'approved') {
        updateData.confidence = 100;

        // ── Approval hierarchy gate ────────────────────────────────────
        const txAmount = typeof existing.amount === 'number'
          ? existing.amount
          : parseFloat(String(existing.amount ?? '0'));

        const approvalCheck = await checkApprovalRequired(
          db,
          existing.entity_id as string,
          Math.abs(txAmount),
        );

        if (approvalCheck) {
          // Check whether an approved approval_request already exists
          const { data: existingApproval } = await db
            .from('approval_requests')
            .select('id, status')
            .eq('transaction_id', id)
            .eq('status', 'approved')
            .limit(1);

          if (!existingApproval || existingApproval.length === 0) {
            // No approved request — create a pending one and return early
            const pending = await requestApproval(
              db,
              existing.entity_id as string,
              id,
              approvalCheck.role,
              approvalCheck.thresholdId,
            );

            // Set transaction to pending_approval instead of approved
            await db
              .from('transactions')
              .update({
                status: 'pending_approval',
                updated_at: new Date().toISOString(),
                updated_by: user.id,
              })
              .eq('id', id);

            return NextResponse.json({
              status: 'pending_approval',
              approvalId: pending.id,
              requiredRole: approvalCheck.role,
              dualApproval: approvalCheck.dual,
            });
          }
          // An approved approval_request exists — allow the status change
        }
      }
    }

    const { data: transaction, error: updateError } = await db
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Transaction Update] Error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      );
    }

    // Log to audit
    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action:
        newStatus === 'approved'
          ? 'approve'
          : 'update',
      targetType: 'transaction',
      targetId: id,
      details: {
        changes: body,
        previous_status: existing.status,
        previous_category_ai: existing.category_ai,
      },
      request,
    });

    // Update categorization history for learning when a human approves
    if (glCode && newStatus === 'approved' && existing.merchant_name) {
      const normalizedMerchant = existing.merchant_name.toLowerCase().trim();
      const { data: existingHistory } = await db
        .from('categorization_history')
        .select('id, frequency')
        .eq('entity_id', existing.entity_id)
        .eq('merchant', normalizedMerchant)
        .eq('gl_code', glCode)
        .single();

      if (existingHistory) {
        await db
          .from('categorization_history')
          .update({
            frequency: existingHistory.frequency + 1,
            last_used: new Date().toISOString(),
          })
          .eq('id', existingHistory.id);
      } else {
        await db.from('categorization_history').insert({
          entity_id: existing.entity_id,
          merchant: normalizedMerchant,
          gl_code: glCode,
          gl_name: glName || '',
          frequency: 1,
          last_used: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[Transaction Update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Soft delete ────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'txn-delete' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Fetch existing transaction scoped to user's entities
    const { data: entityList } = await db
      .from('entities')
      .select('id')
      .eq('org_id', membership.org_id);

    const entityIds = (entityList || []).map((e: { id: string }) => e.id);
    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const { data: existing, error: fetchError } = await db
      .from('transactions')
      .select('*')
      .eq('id', id)
      .in('entity_id', entityIds)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Soft delete
    const { error: deleteError } = await db
      .from('transactions')
      .update({
        status: 'removed',
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete transaction' },
        { status: 500 }
      );
    }

    // Log to audit
    await writeAuditLog({
      supabase: db,
      entityId: existing.entity_id,
      actorId: user.id,
      actorType: 'human',
      action: 'delete',
      targetType: 'transaction',
      targetId: id,
      details: {
        merchant: existing.merchant_name,
        amount: existing.amount,
        previous_status: existing.status,
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Transaction Delete] Error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
