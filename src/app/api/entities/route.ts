// POST /api/entities — Create a new entity within the user's existing org
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';

const VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'INR', 'BRL', 'MXN', 'SGD', 'HKD', 'KRW', 'ZAR', 'AED', 'SAR', 'KWD'];
const VALID_FISCAL_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

/**
 * POST /api/entities
 * Creates a new entity within the authenticated user's existing organization.
 * Validates name uniqueness, entity count limit, and input format.
 *
 * Body: { name: string, fiscalYearEnd?: string, currency?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'entity-create' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Validate name
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length === 0) {
      return NextResponse.json({ error: 'Entity name is required' }, { status: 400 });
    }
    if (name.length > 255) {
      return NextResponse.json({ error: 'Entity name exceeds maximum length of 255 characters' }, { status: 400 });
    }

    // Validate fiscal year end (month number)
    const fiscalYearEnd = typeof body.fiscalYearEnd === 'string' ? body.fiscalYearEnd : '12';
    if (!VALID_FISCAL_MONTHS.includes(fiscalYearEnd)) {
      return NextResponse.json({ error: 'Invalid fiscal year end month' }, { status: 400 });
    }

    // Validate currency
    const currency = typeof body.currency === 'string' ? body.currency.toUpperCase() : 'USD';
    if (!VALID_CURRENCIES.includes(currency)) {
      return NextResponse.json({ error: `Invalid currency. Supported: ${VALID_CURRENCIES.join(', ')}` }, { status: 400 });
    }

    const orgId = membership.org_id;

    // Check entity count limit (<10)
    const { count, error: countError } = await db
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    if (countError) {
      console.error('[Entities POST] Count error:', countError);
      return NextResponse.json({ error: 'Failed to check entity limit' }, { status: 500 });
    }

    if ((count ?? 0) >= 10) {
      return NextResponse.json({ error: 'Maximum of 10 entities per organization reached' }, { status: 409 });
    }

    // Check name uniqueness within org
    const { data: existing } = await db
      .from('entities')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', name)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'An entity with this name already exists in your organization' }, { status: 409 });
    }

    // Create the entity
    const { data: entity, error: insertError } = await db
      .from('entities')
      .insert({
        org_id: orgId,
        name,
        fiscal_year_end: fiscalYearEnd,
        base_currency: currency,
      })
      .select('id, name, base_currency')
      .single();

    if (insertError) {
      console.error('[Entities POST] Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to create entity' }, { status: 500 });
    }

    return NextResponse.json(entity, { status: 201 });
  } catch (error) {
    console.error('[Entities POST] Unexpected:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
