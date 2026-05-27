
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET/PUT/DELETE /api/transactions/[id] — Single Transaction Operations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET: Single transaction with full details ──────────────────────────────────

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch transaction
    const { data: transaction, error: txError } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
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
      .eq('id', transaction.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity access denied' },
        { status: 403 }
      );
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[Transaction Detail] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transaction' },
      { status: 500 }
    );
  }
}

// ─── PUT: Update transaction (approve, change category, add receipt) ────────────

interface UpdateTransactionBody {
  glCode?: string;
  glName?: string;
  status?: string;
  notes?: string;
  receiptUrl?: string;
  receiptId?: string;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch existing transaction
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
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
      .eq('id', existing.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity access denied' },
        { status: 403 }
      );
    }

    const body: UpdateTransactionBody = await request.json();
    const {
      glCode,
      glName,
      status: newStatus,
      notes,
      receiptUrl,
      receiptId,
    } = body;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (glCode !== undefined) {
      updateData.category_ai = glCode;
      // If a human is setting the category, also store it as the human-approved category
      updateData.category_human = glCode;
    }
    if (glName !== undefined) updateData.ai_reasoning = glName;
    if (notes !== undefined) updateData.description = notes;
    if (receiptUrl !== undefined) updateData.document_url = receiptUrl;

    // Handle status changes — approval sets confidence to 100
    if (newStatus === 'approved') {
      updateData.status = 'approved';
      updateData.confidence = 100;
    } else if (newStatus) {
      // Validate allowed status transitions
      const validStatuses = ['pending', 'human_review', 'approved', 'auto_categorized'];
      if (!validStatuses.includes(newStatus)) {
        return NextResponse.json(
          { error: `Invalid status: ${newStatus}` },
          { status: 400 }
        );
      }
      updateData.status = newStatus;
    }

    const { data: transaction, error: updateError } = await (supabase as any)
      .from('transactions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Transaction Update] Error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update transaction' },
        { status: 500 }
      );
    }

    // Log to audit
    await (supabase as any).from('audit_log').insert({
      entity_id: existing.entity_id,
      actor_id: user.id,
      actor_type: 'human',
      action:
        newStatus === 'approved'
          ? 'approve'
          : 'update',
      target_type: 'transaction',
      target_id: id,
      details: {
        changes: body,
        previous_status: existing.status,
        previous_category_ai: existing.category_ai,
      },
    });

    // Update categorization history for learning when a human approves
    if (glCode && newStatus === 'approved' && existing.merchant_name) {
      const normalizedMerchant = existing.merchant_name.toLowerCase().trim();
      const { data: existingHistory } = await (supabase as any)
        .from('categorization_history')
        .select('id, frequency')
        .eq('entity_id', existing.entity_id)
        .eq('merchant', normalizedMerchant)
        .eq('gl_code', glCode)
        .single();

      if (existingHistory) {
        await (supabase as any)
          .from('categorization_history')
          .update({
            frequency: existingHistory.frequency + 1,
            last_used: new Date().toISOString(),
          })
          .eq('id', existingHistory.id);
      } else {
        await (supabase as any).from('categorization_history').insert({
          entity_id: existing.entity_id,
          merchant: normalizedMerchant,
          gl_code: glCode,
          gl_name: glName || '',
          frequency: 1,
          last_used: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({ transaction });
  } catch (error) {
    console.error('[Transaction Update] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update transaction' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Soft delete ────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createServerClient();

    // Validate auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch existing transaction
    const { data: existing, error: fetchError } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
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
      .eq('id', existing.entity_id)
      .eq('org_id', membership.org_id)
      .single();

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity access denied' },
        { status: 403 }
      );
    }

    // Soft delete
    const { error: deleteError } = await (supabase as any)
      .from('transactions')
      .update({
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete transaction' },
        { status: 500 }
      );
    }

    // Log to audit
    await (supabase as any).from('audit_log').insert({
      entity_id: existing.entity_id,
      actor_id: user.id,
      actor_type: 'human',
      action: 'delete',
      target_type: 'transaction',
      target_id: id,
      details: {
        merchant: existing.merchant_name,
        amount: existing.amount,
        previous_status: existing.status,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Transaction Delete] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
