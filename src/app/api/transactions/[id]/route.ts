
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT/DELETE /api/transactions/[id] — Single Transaction Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { writeAuditLog } from '@/lib/audit';
import { checkApprovalRequired, requestApproval } from '@/lib/approval';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody, schemas } from '@/lib/validation';
import { normalizeMerchantName } from '@/lib/vendors/service';

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
      .select('id, amount, currency, date, merchant_name, merchant_raw, category_ai, category_human, status, document_status, document_url, tags, description, ai_reasoning, entity_id, created_at, updated_at')
      .eq('id', id)
      .in('entity_id', entityIds)
      .is('deleted_at', null)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    return handleApiError(error, 'GET /api/transactions/[id]', 'Failed to fetch transaction');
  }
}

// ─── PUT: Update transaction (approve, change category, add receipt) ────────────


export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'txn-update' });
    if (limited) return limited;

    const { id } = await context.params;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership: _membership, db, entityIds } = ctx;
    if (entityIds.length === 0) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const { data: existing, error: fetchError } = await db
      .from('transactions')
      .select('id, entity_id, date, status, amount, category_ai, category_human, merchant_name, merchant_raw, confidence, description, document_url, gl_name, currency')
      .eq('id', id)
      .in('entity_id', entityIds)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const parsed = await parseBody(request, schemas.updateTransaction);
    if (!parsed.success) return parsed.error;
    const {
      glCode,
      glName,
      status: newStatus,
      notes,
      receiptUrl,
      receiptId: _receiptId,
    } = parsed.data;

    // ── Period-lock check ──────────────────────────────────────────────
    // Check if the existing transaction date falls in a locked period
    const [existingYearStr, existingMonthStr] = (existing.date as string).split('-');
    const existingYear = parseInt(existingYearStr, 10);
    const existingMonth = parseInt(existingMonthStr, 10);

    const { data: existingPeriod } = await db
      .from('accounting_periods')
      .select('is_locked')
      .eq('entity_id', existing.entity_id)
      .eq('year', existingYear)
      .eq('month', existingMonth)
      .single();

    if (existingPeriod?.is_locked) {
      return NextResponse.json(
        { error: 'Cannot update transaction in a locked accounting period' },
        { status: 409 }
      );
    }

    // If the date is being changed, also check the new date's period
    if ((parsed.data as Record<string, unknown>).date) {
      const [newYearStr, newMonthStr] = ((parsed.data as Record<string, unknown>).date as string).split('-');
      const newYear = parseInt(newYearStr, 10);
      const newMonth = parseInt(newMonthStr, 10);

      if (newMonth !== existingMonth || newYear !== existingYear) {
        const { data: newPeriod } = await db
          .from('accounting_periods')
          .select('is_locked')
          .eq('entity_id', existing.entity_id)
          .eq('year', newYear)
          .eq('month', newMonth)
          .single();

        if (newPeriod?.is_locked) {
          return NextResponse.json(
            { error: 'Cannot move transaction into a locked accounting period' },
            { status: 409 }
          );
        }
      }
    }

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
        // F26: Block internal/private hostnames to prevent SSRF
        const BLOCKED_HOSTS = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|127\.|0\.|localhost|metadata\.|internal\.)/i;
        if (BLOCKED_HOSTS.test(url.hostname)) {
          return NextResponse.json(
            { error: 'Internal URLs are not allowed' },
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
        [TRANSACTION_STATUS.PENDING]: [TRANSACTION_STATUS.APPROVED, 'rejected', TRANSACTION_STATUS.CATEGORIZATION_FAILED, TRANSACTION_STATUS.HUMAN_REVIEW],
        [TRANSACTION_STATUS.HUMAN_REVIEW]: [TRANSACTION_STATUS.APPROVED, 'rejected', TRANSACTION_STATUS.PENDING],
        [TRANSACTION_STATUS.AUTO_CATEGORIZED]: [TRANSACTION_STATUS.APPROVED, 'rejected', TRANSACTION_STATUS.HUMAN_REVIEW],
        [TRANSACTION_STATUS.APPROVED]: [TRANSACTION_STATUS.SYNCING, TRANSACTION_STATUS.SYNCED],
        rejected: [TRANSACTION_STATUS.PENDING],
        [TRANSACTION_STATUS.SYNCING]: [TRANSACTION_STATUS.SYNCED, TRANSACTION_STATUS.APPROVED],
        [TRANSACTION_STATUS.SYNCED]: [], // terminal — no transitions allowed
        [TRANSACTION_STATUS.ESCROW_SUSPENSE]: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.APPROVED],
        [TRANSACTION_STATUS.CATEGORIZATION_FAILED]: [TRANSACTION_STATUS.PENDING, TRANSACTION_STATUS.HUMAN_REVIEW],
        [TRANSACTION_STATUS.REMOVED]: [], // terminal — no transitions allowed
        [TRANSACTION_STATUS.PENDING_APPROVAL]: [TRANSACTION_STATUS.APPROVED, 'rejected'], // approval workflow
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
      if ((newStatus as string) === TRANSACTION_STATUS.APPROVED) {
        updateData.confidence = 100;

        // ── Approval hierarchy gate ────────────────────────────────────
        if (existing.amount == null) {
          return NextResponse.json(
            { error: 'Transaction has no amount' },
            { status: 400 }
          );
        }
        const txAmount = typeof existing.amount === 'number'
          ? existing.amount
          : parseFloat(String(existing.amount));

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
            .eq('status', TRANSACTION_STATUS.APPROVED)
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
                status: TRANSACTION_STATUS.PENDING_APPROVAL,
                updated_at: new Date().toISOString(),
                updated_by: user.id,
              })
              .eq('id', id);

            return NextResponse.json({
              status: TRANSACTION_STATUS.PENDING_APPROVAL,
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
        (newStatus as string) === TRANSACTION_STATUS.APPROVED
          ? 'approve'
          : 'update',
      targetType: 'transaction',
      targetId: id,
      details: {
        changes: parsed.data,
        previous_status: existing.status,
        previous_category_ai: existing.category_ai,
      },
      request,
    });

    // Update categorization history for learning when a human approves
    if (glCode && (newStatus as string) === TRANSACTION_STATUS.APPROVED && existing.merchant_name) {
      const normalizedMerchant = normalizeMerchantName(existing.merchant_name);
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
    return handleApiError(error, 'PUT /api/transactions/[id]', 'Failed to update transaction');
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
      .select('id, entity_id, status, merchant_name, amount')
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
        status: TRANSACTION_STATUS.REMOVED,
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

    // F22b: Cancel any pending approvals for this transaction
    await db.from('approval_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('transaction_id', id)
      .eq('status', TRANSACTION_STATUS.PENDING);

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
    return handleApiError(error, 'DELETE /api/transactions/[id]', 'Failed to delete transaction');
  }
}
