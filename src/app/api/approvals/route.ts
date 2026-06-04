
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/approvals — Approval Workflow Endpoints (WS-B)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiAuthContext } from '@/lib/api-auth';
import { getPendingApprovals, processApproval } from '@/lib/approval';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import { parseBody } from '@/lib/validation';

// ─── GET: List pending approvals for the current user ───────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'approvals-read' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db, entityIds } = ctx;

    if (entityIds.length === 0) {
      return NextResponse.json({ approvals: [] });
    }

    const pending = await getPendingApprovals(db, entityIds, membership.role);

    // Collect transaction IDs to batch-fetch display data
    const txnIds = pending.map((a) => a.transaction_id);

    const transactionMap: Record<string, Record<string, unknown>> = {};
    if (txnIds.length > 0) {
      const { data: transactions } = await db
        .from('transactions')
        .select('id, merchant_name, amount, currency, status, created_at')
        .in('id', txnIds);

      if (transactions) {
        for (const txn of transactions as { id: string }[]) {
          transactionMap[txn.id] = txn;
        }
      }
    }

    // Merge transaction display data into each approval
    const enriched = pending.map((approval) => ({
      ...approval,
      transaction: transactionMap[approval.transaction_id] ?? null,
    }));

    return NextResponse.json({ approvals: enriched });
  } catch (error) {
    console.error('[Approvals] GET error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch pending approvals' },
      { status: 500 },
    );
  }
}

// ─── POST: Submit an approval decision ──────────────────────────────────────────

const approvalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
});

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'approvals-decide' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db, entityIds } = ctx;

    const parsed = await parseBody(request, approvalDecisionSchema);
    if (!parsed.success) return parsed.error;
    const { approvalId, decision } = parsed.data;

    const updated = await processApproval(
      db,
      approvalId,
      user.id,
      membership.role,
      decision,
      entityIds,
    );

    return NextResponse.json({ approval: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process approval';
    const isValidation =
      message.includes('Insufficient role') ||
      message.includes('already processed') ||
      message.includes('not found');

    if (!isValidation) {
      console.error('[Approvals] POST error:', error);
      captureException(error);
    }

    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500 },
    );
  }
}
