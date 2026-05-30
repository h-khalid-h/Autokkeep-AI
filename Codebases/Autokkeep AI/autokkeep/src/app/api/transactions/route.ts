
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/transactions — List & Create Transactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit';
import { rateLimit } from '@/lib/rate-limit';

// ─── GET: List transactions with filtering ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 60, windowSeconds: 60, prefix: 'txn-list' });
    if (limited) return limited;

    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get('entityId');
    const status = searchParams.get('status');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const confidenceMin = searchParams.get('confidenceMin');
    const confidenceMax = searchParams.get('confidenceMax');
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Validate org membership
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // If entityId provided, validate access; otherwise use all org entities
    let entityIds: string[] = [];

    if (entityId) {
      const { data: entity } = await (supabase as any)
        .from('entities')
        .select('id, org_id')
        .eq('id', entityId)
        .eq('org_id', membership.org_id)
        .single();

      if (!entity) {
        return NextResponse.json(
          { error: 'Entity not found or access denied' },
          { status: 403 }
        );
      }
      entityIds = [entity.id];
    } else {
      const { data: orgEntities } = await (supabase as any)
        .from('entities')
        .select('id')
        .eq('org_id', membership.org_id);

      entityIds = (orgEntities || []).map((e: { id: string }) => e.id);
      if (entityIds.length === 0) {
        return NextResponse.json({
          transactions: [],
          pagination: { total: 0, limit, offset, hasMore: false },
        });
      }
    }

    // Build query with filters
    const sort = searchParams.get('sort') || 'date_desc';
    const [sortField, sortDir] = sort.split('_');
    const sortColumn = sortField === 'amount' ? 'amount'
      : sortField === 'confidence' ? 'confidence'
      : 'date';
    const ascending = sortDir === 'asc';

    let query = (supabase as any)
      .from('transactions')
      .select('*', { count: 'exact' })
      .in('entity_id', entityIds)
      .neq('status', 'removed')
      .neq('status', 'deleted')
      .order(sortColumn, { ascending })
      .range(offset, offset + limit - 1);

    if (status) {
      const statuses = status.split(',').map((s: string) => s.trim());
      query = statuses.length === 1
        ? query.eq('status', statuses[0])
        : query.in('status', statuses);
    }

    if (dateFrom) {
      query = query.gte('date', dateFrom);
    }

    if (dateTo) {
      query = query.lte('date', dateTo);
    }

    if (confidenceMin) {
      query = query.gte('confidence', parseInt(confidenceMin, 10));
    }

    if (confidenceMax) {
      query = query.lte('confidence', parseInt(confidenceMax, 10));
    }

    if (search) {
      // Sanitize search to prevent PostgREST filter injection
      // Escape characters that have special meaning in PostgREST filter syntax
      const sanitized = search
        .replace(/[\\%_]/g, (c) => `\\${c}`) // Escape SQL LIKE wildcards
        .replace(/[,.()]/g, '') // Strip PostgREST filter operators
        .slice(0, 100); // Limit length

      if (sanitized.length > 0) {
        query = query.or(
          `merchant_name.ilike.%${sanitized}%,merchant_raw.ilike.%${sanitized}%`
        );
      }
    }

    const { data: transactions, error: txError, count } = await query;

    if (txError) {
      console.error('[Transactions] Query error:', txError);
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      transactions: transactions || [],
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error('[Transactions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// ─── POST: Create manual transaction ────────────────────────────────────────────

interface CreateTransactionBody {
  entityId: string;
  merchant: string;
  amount: number;
  date: string;
  glCode?: string;
  glName?: string;
  cardHolder?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, { max: 30, windowSeconds: 60, prefix: 'txn-create' });
    if (limited) return limited;

    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: CreateTransactionBody = await request.json();
    const { entityId, merchant, amount, date, glCode, glName, cardHolder, notes } =
      body;

    if (!entityId || !merchant || amount === undefined || !date) {
      return NextResponse.json(
        { error: 'entityId, merchant, amount, and date are required' },
        { status: 400 }
      );
    }

    // Validate entity access
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: entity } = await (supabase as any)
      .from('entities')
      .select('id, org_id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found or access denied' },
        { status: 403 }
      );
    }

    // Create manual transaction
    const { data: transaction, error: txError } = await (supabase as any)
      .from('transactions')
      .insert({
        entity_id: entityId,
        merchant_name: merchant,
        merchant_raw: merchant,
        amount,
        date,
        category_ai: glCode || null,
        ai_reasoning: glName || null,
        card_holder: cardHolder || null,
        description: notes || null,
        status: glCode ? 'approved' : 'pending',
        confidence: glCode ? 100 : 0,
      })
      .select()
      .single();

    if (txError) {
      console.error('[Transactions] Create error:', txError);
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // Log to audit
    await writeAuditLog({
      supabase,
      entityId,
      actorId: user.id,
      actorType: 'human',
      action: 'create',
      targetType: 'transaction',
      targetId: transaction.id,
      details: { merchant, amount, source: 'manual' },
      request,
    });

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error('[Transactions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}
