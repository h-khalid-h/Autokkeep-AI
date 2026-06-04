
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/compliance/check — Run Compliance Check for an Entity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import {
  runComplianceCheck,
} from '@/lib/compliance';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '@/lib/compliance';
import { parseBody, schemas } from '@/lib/validation';
import { writeAuditLog } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 requests per minute
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'compliance-check' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    // Parse body
    const parsed = await parseBody(request, schemas.complianceCheck);
    if (!parsed.success) return parsed.error;
    const { entityId, region } = parsed.data;

    // Validate entity access against org
    const { data: entity } = await db
      .from('entities')
      .select('id, org_id, base_currency, tax_id, fiscal_year_end, country')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Fetch transactions for the entity (last 90 days by default)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: rawTransactions, error: txError } = await db
      .from('transactions')
      .select('id, amount, currency, date, merchant_name, category_ai, category_human, document_status, gl_name')
      .eq('entity_id', entityId)
      .gte('date', ninetyDaysAgo.toISOString().split('T')[0])
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(1000);

    if (txError) {
      captureException(txError, {
        tags: { route: 'compliance-check', region },
        extra: { entityId },
      });
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    // Map to compliance transaction format
    const transactions: TransactionForCompliance[] = (rawTransactions || []).map(
      (tx: Record<string, unknown>) => ({
        id: tx.id as string,
        amount: tx.amount as number,
        currency: tx.currency as string,
        date: tx.date as string,
        merchant_name: (tx.merchant_name as string | null) ?? null,
        category_ai: (tx.category_ai as string | null) ?? null,
        category_human: (tx.category_human as string | null) ?? null,
        document_status: (tx.document_status as string | null) ?? null,
        gl_code: (tx.gl_name as string | null) ?? null,
      })
    );

    // Build entity compliance config
    const entityConfig: EntityComplianceConfig = {
      entityId: entity.id as string,
      region,
      taxId: (entity.tax_id as string | undefined) ?? undefined,
      fiscalYearStart: (entity.fiscal_year_end as string | undefined) ?? undefined,
      currency: entity.base_currency as string,
    };

    // Run the compliance check
    const result = runComplianceCheck(region, transactions, entityConfig);

    // Audit log: compliance check executed
    await writeAuditLog({
      supabase: db,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'view',
      targetType: 'compliance_check',
      details: { region, score: result.score, violationCount: result.violations.length },
      request,
    });

    return NextResponse.json({
      result,
      meta: {
        transactionCount: transactions.length,
        periodStart: ninetyDaysAgo.toISOString().split('T')[0],
        periodEnd: new Date().toISOString().split('T')[0],
      },
    });
  } catch (error) {
    captureException(error, {
      tags: { route: 'compliance-check' },
    });
    console.error('[Compliance/Check] Error:', error);
    return NextResponse.json(
      { error: 'Failed to run compliance check' },
      { status: 500 }
    );
  }
}
