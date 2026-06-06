// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/reports/profit-loss — Generate Profit & Loss statement
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { generateProfitAndLoss } from '@/lib/reports/profit-loss';

/**
 * ISO date validation: YYYY-MM-DD
 */
const ISO_DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 reports per minute
    const limited = await rateLimit(request, {
      max: 10,
      windowSeconds: 60,
      prefix: 'reports-pnl',
    });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');
    const compare = searchParams.get('compare') === 'true';

    // ── Validation ─────────────────────────────────────────────────────────

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    if (!periodStart || !ISO_DATE_RE.test(periodStart)) {
      return NextResponse.json(
        { error: 'periodStart must be a valid ISO date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (!periodEnd || !ISO_DATE_RE.test(periodEnd)) {
      return NextResponse.json(
        { error: 'periodEnd must be a valid ISO date (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    if (periodStart > periodEnd) {
      return NextResponse.json(
        { error: 'periodStart must be before or equal to periodEnd' },
        { status: 400 }
      );
    }

    // ── Entity Access Check ────────────────────────────────────────────────

    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // ── Generate Report ────────────────────────────────────────────────────

    const report = await generateProfitAndLoss(
      db,
      entityId,
      periodStart,
      periodEnd,
      { comparePrevious: compare }
    );

    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'reports-pnl', 'Failed to generate P&L report');
  }
}
