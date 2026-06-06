// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Approval Hierarchy Service (WS-B)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Provides entity-scoped approval workflows via the approval_thresholds and
// approval_requests tables.  Transactions exceeding a configured amount
// threshold require explicit approval from a user with a sufficient role.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { writeAuditLog } from '@/lib/audit';
import { recordVendorPayment } from '@/lib/vendors/service';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ── Role Hierarchy ──────────────────────────────────────────────────────────────

/** Higher index = higher authority. */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  accountant: 1,
  admin: 2,
  owner: 3,
};

/**
 * Returns true when `actorRole` meets or exceeds `requiredRole`.
 */
function roleAtLeast(actorRole: string, requiredRole: string): boolean {
  return (ROLE_RANK[actorRole] ?? -1) >= (ROLE_RANK[requiredRole] ?? Infinity);
}

// ── Types ────────────────────────────────────────────────────────────────────────

export interface ApprovalCheck {
  required: boolean;
  role: string;
  dual: boolean;
  thresholdId: string;
}

export interface ApprovalRequest {
  id: string;
  entity_id: string;
  transaction_id: string;
  requested_role: string;
  threshold_id: string;
  status: string;
  approver_user_id: string | null;
  decided_at: string | null;
  created_at: string;
}

// ── Service Functions ────────────────────────────────────────────────────────────

/**
 * Check whether a transaction amount triggers an approval threshold.
 *
 * Queries `approval_thresholds` for the given entity where
 * `min_amount <= amount`, returning the highest-value threshold that
 * applies (ORDER BY min_amount DESC LIMIT 1).
 *
 * @returns Threshold info when approval is required, or `null` if none applies.
 */
export async function checkApprovalRequired(
  db: SupabaseQueryClient,
  entityId: string,
  amount: number,
): Promise<ApprovalCheck | null> {
  // Use absolute value so negative amounts (refunds) trigger the same
  // approval rules as positive amounts of equal magnitude.
  const absAmount = Math.abs(amount);

  const { data, error } = await db
    .from('approval_thresholds')
    .select('id, required_role, dual_approval, min_amount')
    .eq('entity_id', entityId)
    .lte('min_amount', absAmount)
    .order('min_amount', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  const threshold = data[0] as {
    id: string;
    required_role: string;
    dual_approval: boolean;
    min_amount: number;
  };

  return {
    required: true,
    role: threshold.required_role,
    dual: !!threshold.dual_approval,
    thresholdId: threshold.id,
  };
}

/**
 * Create a pending approval request for a transaction.
 *
 * If a pending request already exists for this transaction, the existing
 * request is returned instead of creating a duplicate (F21).
 *
 * @returns The approval_requests row (new or existing) and an `alreadyExists` flag.
 */
export async function requestApproval(
  db: SupabaseQueryClient,
  entityId: string,
  transactionId: string,
  requiredRole: string,
  thresholdId: string,
): Promise<ApprovalRequest & { alreadyExists?: boolean }> {
  // F21: Check for existing pending request on this transaction
  const { data: existing } = await db
    .from('approval_requests')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    // Fetch the full row to return consistent shape
    const { data: full } = await db
      .from('approval_requests')
      .select('id, entity_id, transaction_id, requested_role, threshold_id, status, approver_user_id, decided_at, created_at')
      .eq('id', existing.id)
      .single();

    return { ...(full as ApprovalRequest), alreadyExists: true };
  }

  const { data, error } = await db
    .from('approval_requests')
    .insert({
      entity_id: entityId,
      transaction_id: transactionId,
      requested_role: requiredRole,
      threshold_id: thresholdId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create approval request: ${error.message}`);
  }

  return data as ApprovalRequest;
}

/**
 * Process an approval or rejection decision.
 *
 * Validates that the acting user's role meets or exceeds the required role,
 * then updates the approval_request and the underlying transaction status.
 */
export async function processApproval(
  db: SupabaseQueryClient,
  approvalId: string,
  userId: string,
  userRole: string,
  decision: 'approved' | 'rejected',
  entityIds: string[],
): Promise<ApprovalRequest> {
  // ── F5: Validate approver is still an active team member ───────────
  // Prevents approvals from users who have been removed from the org or
  // have not yet accepted their invitation.
  // Resolve orgId from the entity — the entity_id is on the approval request,
  // but we need org_id for team_members lookup. We do this early so we can
  // fail fast before any state mutations.
  const { data: approvalForEntity } = await db
    .from('approval_requests')
    .select('entity_id')
    .eq('id', approvalId)
    .in('entity_id', entityIds)
    .single();

  if (!approvalForEntity) {
    throw new Error('Approval request not found or access denied');
  }

  const { data: entity } = await db
    .from('entities')
    .select('org_id')
    .eq('id', approvalForEntity.entity_id)
    .single();

  if (entity?.org_id) {
    const { data: membership } = await db
      .from('team_members')
      .select('id, role')
      .eq('user_id', userId)
      .eq('org_id', entity.org_id)
      .not('accepted_at', 'is', null)
      .single();

    if (!membership) {
      throw new Error('You are no longer an active team member');
    }
  }

  // Fetch the approval request — scoped to the caller's entity assignments
  // to prevent cross-org approval hijacking
  const { data: approval, error: fetchError } = await db
    .from('approval_requests')
    .select('id, entity_id, transaction_id, requested_role, threshold_id, status, approver_user_id, decided_at, created_at')
    .eq('id', approvalId)
    .in('entity_id', entityIds)
    .single();

  if (fetchError || !approval) {
    throw new Error('Approval request not found or access denied');
  }

  const req = approval as ApprovalRequest;

  if (req.status !== 'pending') {
    throw new Error(`Approval already processed (status: ${req.status})`);
  }

  // Validate role hierarchy
  if (!roleAtLeast(userRole, req.requested_role)) {
    throw new Error(
      `Insufficient role: ${userRole} cannot fulfil required role ${req.requested_role}`,
    );
  }

  // ── F2: SOD — Creator cannot be the approver ──────────────────────────
  // COSO principle: the person who initiates a transaction must not be the
  // same person who approves it. This prevents self-dealing and embezzlement.
  //
  // Design note: Plaid-imported transactions have `created_by = NULL` because
  // they are ingested automatically by the bank sync pipeline, not created by
  // any user. In that case, no SOD restriction applies — this is intentional
  // since there is no human initiator to conflict with the approver.
  if (decision === 'approved') {
    const { data: txn } = await db
      .from('transactions')
      .select('created_by')
      .eq('id', req.transaction_id)
      .single();

    if (txn?.created_by && txn.created_by === userId) {
      throw new Error(
        'SOD violation: transaction creator cannot approve their own transaction',
      );
    }
  }

  // ── F3: Dual approval enforcement ─────────────────────────────────────
  // If the matching threshold requires dual approval, check whether a prior
  // approval from a DIFFERENT user already exists. If not, mark this as the
  // first approval and keep the transaction in pending state.
  let isDualApprovalPartial = false;
  if (decision === 'approved' && req.threshold_id) {
    const { data: threshold } = await db
      .from('approval_thresholds')
      .select('requires_dual_approval')
      .eq('id', req.threshold_id)
      .single();

    // F4: Guard against deleted thresholds — if the threshold that
    // triggered this approval request no longer exists, we cannot safely
    // determine whether dual-approval is required. Reject rather than
    // silently downgrading to single-approval.
    if (threshold === null || threshold === undefined) {
      throw new Error(
        'Approval threshold was deleted — cannot process. Please re-evaluate this transaction.',
      );
    }

    if (threshold?.requires_dual_approval) {
      // ── F1: Dual-approval bypass prevention ────────────────────────
      // First, check if the current user has ALREADY approved any request
      // for this transaction. This prevents the same user from approving
      // both legs of a dual-approval flow. The previous check using
      // `.neq('approver_user_id', userId)` had a subtle bug: after the
      // first approval, the query would find 0 prior approvals from
      // OTHER users, treating it as "first of two" again — letting the
      // same user approve both legs.
      const { data: ownPriorApprovals } = await db
        .from('approval_requests')
        .select('id')
        .eq('transaction_id', req.transaction_id)
        .eq('status', 'approved')
        .eq('approver_user_id', userId);

      if (ownPriorApprovals && ownPriorApprovals.length > 0) {
        throw new Error(
          'Dual-approval violation: you have already approved this transaction. A different user must provide the second approval.',
        );
      }

      // Check for a prior approval from a DIFFERENT user
      const { data: priorApprovals } = await db
        .from('approval_requests')
        .select('id, approver_user_id')
        .eq('transaction_id', req.transaction_id)
        .eq('status', 'approved')
        .neq('approver_user_id', userId);

      if (!priorApprovals || priorApprovals.length === 0) {
        // This is the first of two required approvals
        isDualApprovalPartial = true;
      }
    }
  }

  const decidedAt = new Date().toISOString();

  // Update approval_requests row — OPTIMISTIC LOCK: .eq('status', 'pending')
  // prevents the TOCTOU race where two concurrent approvers both read 'pending'
  // and both update. The second concurrent caller will get 0 rows back.
  const { data: updatedRows, error: updateError } = await db
    .from('approval_requests')
    .update({
      approver_user_id: userId,
      status: decision,
      decided_at: decidedAt,
    })
    .eq('id', approvalId)
    .eq('status', 'pending') // Optimistic lock — prevents double-approval
    .select();

  if (updateError) {
    throw new Error(`Failed to update approval request: ${updateError.message}`);
  }

  if (!updatedRows || updatedRows.length === 0) {
    throw new Error('Approval already processed by another user');
  }

  const updated = updatedRows[0];

  // Update the underlying transaction status
  // For dual approval: first approver keeps the transaction in 'human_review'
  // and a new pending approval request is created for the second approver.
  if (isDualApprovalPartial) {
    // Create a second approval request for another qualified user
    await db.from('approval_requests').insert({
      entity_id: req.entity_id,
      transaction_id: req.transaction_id,
      requested_role: req.requested_role,
      threshold_id: req.threshold_id,
      status: 'pending',
    });

    await writeAuditLog({
      supabase: db,
      entityId: req.entity_id,
      actorId: userId,
      actorType: 'human',
      action: 'approve',
      targetType: 'approval_request',
      targetId: approvalId,
      details: {
        decision: 'approved (1 of 2 — dual approval)',
        transaction_id: req.transaction_id,
        required_role: req.requested_role,
        actor_role: userRole,
        dual_approval: true,
        awaiting_second_approver: true,
      },
    });

    return updated as ApprovalRequest;
  }

  // F3: Rejected transactions go to HUMAN_REVIEW instead of REMOVED.
  // This allows the creator to correct the transaction and resubmit for
  // approval, rather than permanently removing it from the workflow.
  const newTxStatus = decision === 'approved' ? TRANSACTION_STATUS.APPROVED : TRANSACTION_STATUS.HUMAN_REVIEW;

  await db
    .from('transactions')
    .update({
      status: newTxStatus,
      updated_at: decidedAt,
      updated_by: userId,
    })
    .eq('id', req.transaction_id)
    .eq('entity_id', req.entity_id);

  // ── Vendor YTD payment tracking (1099-NEC compliance) ─────────────
  // When a transaction is approved, update the vendor's YTD payment
  // accumulators so 1099-NEC thresholds can be tracked accurately.
  if (decision === 'approved') {
    try {
      const { data: txnForVendor } = await db
        .from('transactions')
        .select('vendor_id, amount, date')
        .eq('id', req.transaction_id)
        .single();

      if (txnForVendor?.vendor_id) {
        await recordVendorPayment(
          db,
          txnForVendor.vendor_id,
          txnForVendor.amount,
          txnForVendor.date,
        );
      }
    } catch (vendorErr) {
      // Non-fatal: vendor payment tracking failure should not block approval
      console.error('[Approval] Vendor payment tracking failed:', vendorErr);
    }
  }

  // Audit log
  await writeAuditLog({
    supabase: db,
    entityId: req.entity_id,
    actorId: userId,
    actorType: 'human',
    action: decision === 'approved' ? 'approve' : 'revoke',
    targetType: 'approval_request',
    targetId: approvalId,
    details: {
      decision,
      transaction_id: req.transaction_id,
      required_role: req.requested_role,
      actor_role: userRole,
    },
  });

  return updated as ApprovalRequest;
}

/**
 * Fetch pending approval requests visible to a user with the given role,
 * filtered to a set of entity IDs.
 *
 * Only returns approvals where the `requested_role` is at or below the
 * caller's role (i.e. the caller is qualified to decide).
 */
export async function getPendingApprovals(
  db: SupabaseQueryClient,
  entityIds: string[],
  userRole: string,
): Promise<ApprovalRequest[]> {
  if (entityIds.length === 0) return [];

  // Determine which requested_roles the caller can fulfil
  const callerRank = ROLE_RANK[userRole] ?? -1;
  const qualifiedRoles = Object.entries(ROLE_RANK)
    .filter(([, rank]) => rank <= callerRank)
    .map(([role]) => role);

  if (qualifiedRoles.length === 0) return [];

  const { data, error } = await db
    .from('approval_requests')
    .select('id, entity_id, transaction_id, requested_role, threshold_id, status, approver_user_id, decided_at, created_at')
    .in('entity_id', entityIds)
    .eq('status', 'pending')
    .in('requested_role', qualifiedRoles)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) {
    console.error('[Approval] getPendingApprovals error:', error);
    return [];
  }

  return (data ?? []) as ApprovalRequest[];
}
