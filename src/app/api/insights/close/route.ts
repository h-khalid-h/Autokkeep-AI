
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/insights/close — AI Month-End Close
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { runMonthEndClose, closePeriod } from '@/lib/ai/close-engine';

// ─── GET: Run month-end close checks ──────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 15, windowSeconds: 60, prefix: 'close-check' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db } = ctx;

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const yearStr = searchParams.get('year');
    const monthStr = searchParams.get('month');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    const year = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
    const month = monthStr ? parseInt(monthStr, 10) : new Date().getMonth() + 1;

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'year must be between 2000 and 2100' },
        { status: 400 }
      );
    }

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'month must be between 1 and 12' },
        { status: 400 }
      );
    }

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', ctx.membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Check if period is already locked
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const { data: existingPeriod } = await db
      .from('accounting_periods')
      .select('id, is_locked, locked_at, locked_by')
      .eq('entity_id', entityId)
      .eq('period', period)
      .maybeSingle();

    // Run close checks
    const report = await runMonthEndClose(entityId, year, month, db);

    return NextResponse.json({
      report,
      periodStatus: existingPeriod
        ? {
            isLocked: existingPeriod.is_locked,
            lockedAt: existingPeriod.locked_at,
            lockedBy: existingPeriod.locked_by,
          }
        : { isLocked: false },
    });
  } catch (error) {
    console.error('[Insights/Close] Error:', error);
    return NextResponse.json(
      { error: 'Failed to run month-end close checks' },
      { status: 500 }
    );
  }
}

// ─── POST: Close (lock) the accounting period ─────────────────────────────

interface CloseBody {
  entityId: string;
  year: number;
  month: number;
  action: 'close';
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'close-period' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const body: CloseBody = await request.json();

    if (!body.entityId || !body.year || !body.month) {
      return NextResponse.json(
        { error: 'entityId, year, and month are required' },
        { status: 400 }
      );
    }

    if (body.action !== 'close') {
      return NextResponse.json(
        { error: 'action must be "close"' },
        { status: 400 }
      );
    }

    if (body.year < 2000 || body.year > 2100) {
      return NextResponse.json(
        { error: 'year must be between 2000 and 2100' },
        { status: 400 }
      );
    }

    if (body.month < 1 || body.month > 12) {
      return NextResponse.json(
        { error: 'month must be between 1 and 12' },
        { status: 400 }
      );
    }

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', body.entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Run close checks to verify readiness
    const report = await runMonthEndClose(body.entityId, body.year, body.month, db);

    if (report.readinessScore < 80) {
      return NextResponse.json(
        {
          error: 'Period is not ready to close',
          report,
          message: `Readiness score is ${report.readinessScore}/100. A score of 80+ is required to close a period.`,
        },
        { status: 422 }
      );
    }

    // Lock the period
    const result = await closePeriod(body.entityId, body.year, body.month, user.id, db);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message, report },
        { status: 409 }
      );
    }

    // Audit log
    await writeAuditLog({
      supabase: db,
      entityId: body.entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'update',
      targetType: 'accounting_period',
      details: {
        action: 'period_close',
        year: body.year,
        month: body.month,
        readinessScore: report.readinessScore,
        checksRun: report.checks.length,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      report,
    });
  } catch (error) {
    console.error('[Insights/Close] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to close period' },
      { status: 500 }
    );
  }
}
