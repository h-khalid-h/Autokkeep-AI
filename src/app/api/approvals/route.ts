
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/approvals — Approval Workflow Endpoints (WS-B)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { getPendingApprovals, processApproval } from '@/lib/approval';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';

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

interface ApprovalDecisionBody {
  approvalId: string;
  decision: 'approved' | 'rejected';
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'approvals-decide' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    let body: ApprovalDecisionBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const { approvalId, decision } = body;

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: 'approvalId and decision are required' },
        { status: 400 },
      );
    }

    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json(
        { error: 'decision must be "approved" or "rejected"' },
        { status: 400 },
      );
    }

    const updated = await processApproval(
      db,
      approvalId,
      user.id,
      membership.role,
      decision,
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
