// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/settings/api-keys — API Key Management
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { listApiKeys, createApiKey } from '@/lib/api-keys/manager';
import { writeAuditLog } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'api-keys-list' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const result = await listApiKeys(
      db as Parameters<typeof listApiKeys>[0],
      membership.org_id
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ keys: result.keys });
  } catch (error) {
    return handleApiError(error, 'GET /api/settings/api-keys', 'Failed to list API keys');
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 5, windowSeconds: 60, prefix: 'api-keys-create' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request, { requireRole: ['owner', 'admin'] });
    if (ctx.error) return ctx.error;
    const { user, membership, db } = ctx;

    const body = await request.json();
    const { name, permissions, expiresAt } = body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: 'Name and permissions array are required' },
        { status: 400 }
      );
    }

    const result = await createApiKey(
      db as Parameters<typeof createApiKey>[0],
      membership.org_id,
      name,
      permissions,
      expiresAt
    );

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAuditLog({
      supabase: db as Parameters<typeof writeAuditLog>[0]['supabase'],
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'api_key',
      targetId: result.result?.keyInfo.id,
      details: { name, permissions },
      request,
    });

    return NextResponse.json(
      {
        key: result.result?.keyInfo,
        fullKey: result.result?.fullKey,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'POST /api/settings/api-keys', 'Failed to create API key');
  }
}
