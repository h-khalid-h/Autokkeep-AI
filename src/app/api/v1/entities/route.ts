
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/v1/entities — Public API: List Entities
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/public-api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleApiError } from '@/lib/api-helpers';
import { createServerClient } from '@/lib/supabase/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-v1-entities');

export async function GET(request: NextRequest) {
  try {
    // Rate limit
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'v1-ent' });
    if (limited) return limited;

    // Authenticate via X-API-Key
    const ctx = await validateApiKey(request);
    if (ctx instanceof NextResponse) return ctx;

    log.info('Listing entities', { orgId: ctx.orgId });

    const supabase = await createServerClient();

    const { data: entities, error } = await supabase
      .from('entities')
      .select('id, name, base_currency, country, created_at')
      .eq('org_id', ctx.orgId)
      .order('name', { ascending: true });

    if (error) {
      log.error('Failed to fetch entities', { error: error.message, orgId: ctx.orgId });
      return NextResponse.json({ error: 'Failed to fetch entities' }, { status: 500 });
    }

    return NextResponse.json({
      data: entities || [],
      total: (entities || []).length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/v1/entities', 'Failed to fetch entities');
  }
}
