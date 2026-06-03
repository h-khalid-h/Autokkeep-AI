import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getApiAuthContext } from '@/lib/api-auth';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// Allowed entity types for validation
const ALLOWED_ENTITY_TYPES = ['llc', 'corp', 'sole_prop', 'partnership', 'nonprofit', 'other'] as const;

interface BootstrapRequestBody {
  entityName?: unknown;
  entityType?: unknown;
  fiscalYearEnd?: unknown;
  currency?: unknown;
}

interface FieldError {
  field: string;
  message: string;
}

// POST /api/onboarding/bootstrap — Create org + entity with validated input
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'onboarding-bootstrap' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { db } = ctx;

    let body: BootstrapRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { entityName, entityType, fiscalYearEnd, currency } = body;

    // ── Input validation ──────────────────────────────────────────────────
    const errors: FieldError[] = [];

    // Validate entityName: required, non-empty trimmed string, max 200 chars
    if (typeof entityName !== 'string' || entityName.trim().length === 0) {
      errors.push({ field: 'entityName', message: 'Entity name is required and must be a non-empty string' });
    } else if (entityName.trim().length > 200) {
      errors.push({ field: 'entityName', message: 'Entity name must be 200 characters or fewer' });
    }

    // Validate entityType: if provided, must be one of the allowed types
    if (entityType !== undefined && entityType !== null && entityType !== '') {
      if (typeof entityType !== 'string' || !ALLOWED_ENTITY_TYPES.includes(entityType as typeof ALLOWED_ENTITY_TYPES[number])) {
        errors.push({
          field: 'entityType',
          message: `Entity type must be one of: ${ALLOWED_ENTITY_TYPES.join(', ')}`,
        });
      }
    }

    // Validate fiscalYearEnd: if provided, must be valid month number (1-12)
    let validatedFiscalYearEnd = '12'; // default
    if (fiscalYearEnd !== undefined && fiscalYearEnd !== null && fiscalYearEnd !== '') {
      const fyeNum = typeof fiscalYearEnd === 'number' ? fiscalYearEnd : parseInt(String(fiscalYearEnd), 10);
      if (isNaN(fyeNum) || fyeNum < 1 || fyeNum > 12 || !Number.isInteger(fyeNum)) {
        errors.push({ field: 'fiscalYearEnd', message: 'Fiscal year end must be a month number between 1 and 12' });
      } else {
        validatedFiscalYearEnd = String(fyeNum);
      }
    }

    // Validate currency: if provided, must be a 3-letter uppercase string
    let validatedCurrency = 'USD'; // default
    if (currency !== undefined && currency !== null && currency !== '') {
      if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) {
        errors.push({ field: 'currency', message: 'Currency must be a 3-letter ISO 4217 code (e.g., USD, EUR)' });
      } else {
        validatedCurrency = currency;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: 'Validation failed', fieldErrors: errors }, { status: 400 });
    }

    // ── Call the bootstrap_onboarding SECURITY DEFINER function ────────────
    const sanitizedEntityName = (entityName as string).trim();

    const { data: result, error: rpcError } = await (db as unknown as SupabaseQueryClient)
      .rpc('bootstrap_onboarding', {
        p_entity_name: sanitizedEntityName,
        p_fiscal_year_end: validatedFiscalYearEnd,
        p_currency: validatedCurrency,
      });

    if (rpcError || !result) {
      console.error('[Bootstrap] RPC error:', rpcError);
      return NextResponse.json(
        { error: rpcError?.message || 'Failed to create entity. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      orgId: result.orgId,
      entityId: result.entityId,
    });
  } catch (error) {
    console.error('[Bootstrap] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during onboarding' },
      { status: 500 }
    );
  }
}
