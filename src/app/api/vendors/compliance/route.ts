
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/vendors/compliance — 1099/W-9 Compliance Dashboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { getVendors1099Status, getW9Summary } from '@/lib/vendors/service';

// ─── GET: Compliance dashboard ──────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'vendor-compliance' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db, entityIds } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');

    // entityId is required
    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    // Validate entity access
    if (!entityIds.includes(entityId)) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Fetch compliance data
    const [vendors1099, w9Summary] = await Promise.all([
      getVendors1099Status(db, entityId),
      getW9Summary(db, entityId),
    ]);

    // Compute compliance score: percentage of W-9s collected/verified out of total vendors
    // Score = 100 if no vendors, otherwise (verified / total) * 100
    const complianceScore = w9Summary.totalVendors === 0
      ? 100
      : Math.round(
          ((w9Summary.verified) / w9Summary.totalVendors) * 100
        );

    return NextResponse.json({
      vendorsNeeding1099: vendors1099.filter(v => v.needs1099Filing),
      vendorsApproaching1099: vendors1099.filter(v => !v.needs1099Filing),
      w9Summary,
      complianceScore,
    });
  } catch (error) {
    console.error('[Vendor Compliance] Error:', error);
    captureException(error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance data' },
      { status: 500 }
    );
  }
}
