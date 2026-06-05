
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/tax/readiness — Tax Readiness Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, apiError } from '@/lib/api-helpers';
import { getApiAuthContext } from '@/lib/api-auth';
import { checkPlanLimits } from '@/lib/billing/plans';
import { rateLimit } from '@/lib/rate-limit';
import { analyzeTaxReadiness } from '@/lib/tax/readiness';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    // Rate limit: 10 requests per minute
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'tax-readiness' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Enforce plan limits for Tax Readiness feature
    const planCheck = await checkPlanLimits(db, membership.org_id, 'tax_readiness');
    if (!planCheck.allowed) {
      return apiError(planCheck.reason || 'This feature requires a paid plan', 403);
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const yearStr = searchParams.get('taxYear');

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId query parameter is required' },
        { status: 400 }
      );
    }

    const taxYear = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();

    if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
      return NextResponse.json(
        { error: 'taxYear must be between 2000 and 2100' },
        { status: 400 }
      );
    }

    // Validate entity access against org
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

    // Run tax readiness analysis
    const report = await analyzeTaxReadiness(entityId, taxYear, db);

    // Audit log: tax readiness analysis executed (F24: persist full breakdown)
    const receiptCompliancePct = report.missingReceipts.length > 0
      ? Math.round(
          ((report.deductionsByCategory.reduce((s, c) => s + c.count, 0) - report.missingReceipts.length) /
           Math.max(1, report.deductionsByCategory.reduce((s, c) => s + c.count, 0))) * 100
        )
      : 100;

    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'view',
      targetType: 'tax_readiness',
      details: {
        taxYear,
        readinessScore: report.readinessScore,
        totalExpenses: report.totalExpenses,
        totalDeductible: report.totalDeductible,
        estimatedSavings: report.estimatedSavings,
        categoryCount: report.deductionsByCategory.length,
        missingReceiptCount: report.missingReceipts.length,
        receiptCompliancePct,
        topCategories: report.deductionsByCategory.slice(0, 5).map(c => c.category),
        recommendationCount: report.recommendations.length,
      },
      request,
    });

    return NextResponse.json({ report });
  } catch (error) {
    return handleApiError(error, 'tax-readiness', 'Failed to analyze tax readiness');
  }
}
