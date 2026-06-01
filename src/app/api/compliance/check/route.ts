
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/compliance/check — Run Compliance Check for an Entity
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { captureException } from '@/lib/sentry';
import {
  runComplianceCheck,
  getAvailableRegions,
} from '@/lib/compliance';
import type {
  ComplianceRegion,
  TransactionForCompliance,
  EntityComplianceConfig,
} from '@/lib/compliance';

const VALID_REGIONS = new Set<ComplianceRegion>([
  'estonia',
  'qatar',
  'hong_kong',
  'japan',
  'india',
]);

interface ComplianceCheckRequestBody {
  entityId: string;
  region: ComplianceRegion;
}

function isValidRegion(value: string): value is ComplianceRegion {
  return VALID_REGIONS.has(value as ComplianceRegion);
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 20 requests per minute
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'compliance-check' });
    if (limited) return limited;

    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = (await request.json()) as Partial<ComplianceCheckRequestBody>;
    const { entityId, region } = body;

    if (!entityId || typeof entityId !== 'string') {
      return NextResponse.json(
        { error: 'entityId is required and must be a string' },
        { status: 400 }
      );
    }

    if (!region || !isValidRegion(region)) {
      return NextResponse.json(
        {
          error: `Invalid region. Must be one of: ${Array.from(VALID_REGIONS).join(', ')}`,
          availableRegions: getAvailableRegions(),
        },
        { status: 400 }
      );
    }

    // Validate org membership and entity access
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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
