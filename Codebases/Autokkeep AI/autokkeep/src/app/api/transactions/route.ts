
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/POST /api/transactions — List & Create Transactions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

// ─── GET: List transactions with filtering ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
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

    // Build query with filters
    let query = (supabase as any)
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('entity_id', entityId)
      .neq('status', 'removed')
      .neq('status', 'deleted')
      .order('date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
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
      query = query.or(
        `merchant_name.ilike.%${search}%,merchant_raw.ilike.%${search}%`
      );
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
    await (supabase as any).from('audit_log').insert({
      entity_id: entityId,
      actor_id: user.id,
      actor_type: 'human',
      action: 'create',
      target_type: 'transaction',
      target_id: transaction.id,
      details: { merchant, amount, source: 'manual' },
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
