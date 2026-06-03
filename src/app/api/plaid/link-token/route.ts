
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST /api/plaid/link-token — Create Plaid Link Token
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { createLinkToken } from '@/lib/plaid/client';
import { parseBody, schemas } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'plaid-link' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const parsed = await parseBody(request, schemas.plaidLinkToken);
    if (!parsed.success) return parsed.error;
    const { entityId } = parsed.data;

    // Validate entity access
    const { data: entity, error: entityError } = await db
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (entityError || !entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Create Plaid Link token
    const linkToken = await createLinkToken(user.id, entityId);

    return NextResponse.json({ link_token: linkToken });
  } catch (error) {
    console.error('[Plaid Link Token] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create link token' },
      { status: 500 }
    );
  }
}
