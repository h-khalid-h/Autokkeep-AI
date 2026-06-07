// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DELETE /api/settings/api-keys/[keyId] — Revoke API Key
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { revokeApiKey } from '@/lib/api-keys/manager';
import { writeAuditLog } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ keyId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, { max: 10, windowSeconds: 60, prefix: 'api-keys-revoke' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const { keyId } = await params;

    const result = await revokeApiKey(
      db as Parameters<typeof revokeApiKey>[0],
      membership.org_id,
      keyId
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAuditLog({
      supabase: db as Parameters<typeof writeAuditLog>[0]['supabase'],
      actorId: user.id,
      actorType: 'human',
      action: 'revoke',
      targetType: 'api_key',
      targetId: keyId,
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'DELETE /api/settings/api-keys/[keyId]', 'Failed to revoke API key');
  }
}
