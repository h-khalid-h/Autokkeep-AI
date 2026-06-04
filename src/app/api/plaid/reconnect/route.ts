import { NextRequest, NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { getApiAuthContext } from '@/lib/api-auth';
import { rateLimit } from '@/lib/rate-limit';
import { createUpdateLinkToken } from '@/lib/plaid/client';
import { decryptToken } from '@/lib/crypto';
import { parseBody, schemas } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'plaid-reconnect' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const parsed = await parseBody(request, schemas.plaidReconnect);
    if (!parsed.success) return parsed.error;
    const { connectionId } = parsed.data;

    // Validate access
    const { data: connection } = await db
      .from('bank_connections')
      .select('*, entity:entities!inner(org_id)')
      .eq('id', connectionId)
      .single();

    if (!connection || connection.entity?.org_id !== membership.org_id) {
      return NextResponse.json({ error: 'Connection not found or access denied' }, { status: 404 });
    }

    // Create update-mode link token for re-authentication
    const linkToken = await createUpdateLinkToken(
      user.id,
      decryptToken(connection.plaid_access_token)
    );

    return NextResponse.json({ link_token: linkToken });
  } catch (error) {
    console.error('[Plaid Reconnect] Error:', error);
    captureException(error);
    return NextResponse.json({ error: 'Failed to create reconnect token' }, { status: 500 });
  }
}
