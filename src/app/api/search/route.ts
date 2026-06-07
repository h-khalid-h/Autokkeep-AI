
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/search — Global Search API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/api-auth';
import { handleApiError } from '@/lib/api-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { search, type SearchDB, type SearchResultType } from '@/lib/search/engine';

const VALID_TYPES: SearchResultType[] = ['transaction', 'vendor', 'category'];

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'search' });
    if (limited) return limited;

    const ctx = await getApiAuthContext(request);
    if (ctx.error) return ctx.error;
    const { membership, db } = ctx;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';
    const typesParam = searchParams.get('types');
    const entityId = searchParams.get('entityId');
    const limitParam = searchParams.get('limit');

    if (!q.trim() || q.trim().length < 2) {
      return NextResponse.json({ results: [], query: q });
    }

    // Parse types filter
    let types: SearchResultType[] | undefined;
    if (typesParam) {
      const requested = typesParam.split(',').map((t) => t.trim()) as SearchResultType[];
      types = requested.filter((t) => VALID_TYPES.includes(t));
      if (types.length === 0) types = undefined;
    }

    // Parse limit
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 50) : 20;

    const results = await search(db as unknown as SearchDB, membership.org_id, {
      query: q,
      types,
      entityId: entityId || undefined,
      limit,
    });

    return NextResponse.json({
      results,
      query: q,
      total: results.length,
    });
  } catch (error) {
    return handleApiError(error, 'GET /api/search', 'Search failed');
  }
}
