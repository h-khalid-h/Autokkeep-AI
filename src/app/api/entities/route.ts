// POST /api/entities — Create a new entity within the user's existing org
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { parseBody } from '@/lib/validation';
import { z } from 'zod';

const createEntitySchema = z.object({
  name: z.string().min(1, 'Entity name is required').max(255),
  fiscalYearEnd: z.string().regex(/^(0[1-9]|1[0-2]|[1-9])$/, 'Must be 1-12 or 01-12').optional().default('12'),
  currency: z.string().max(3).toUpperCase().optional().default('USD'),
});

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

    const parsed = await parseBody(request, createEntitySchema);
    if (!parsed.success) return parsed.error;
    const { name, fiscalYearEnd, currency } = parsed.data;

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
    return handleApiError(error, 'POST /api/entities', 'Internal server error');
  }
}
