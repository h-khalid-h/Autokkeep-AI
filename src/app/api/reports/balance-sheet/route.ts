// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/reports/balance-sheet — Generate Balance Sheet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { generateBalanceSheet } from '@/lib/reports/balance-sheet';

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
      prefix: 'reports-bs',
    });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const asOfDate = searchParams.get('asOfDate');

    // ── Validation ─────────────────────────────────────────────────────────

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    if (!asOfDate || !ISO_DATE_RE.test(asOfDate)) {
      return NextResponse.json(
        { error: 'asOfDate must be a valid ISO date (YYYY-MM-DD)' },
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

    const report = await generateBalanceSheet(
      db,
      entityId,
      asOfDate,
    );

    return NextResponse.json(report, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, 'reports-bs', 'Failed to generate Balance Sheet report');
  }
}
