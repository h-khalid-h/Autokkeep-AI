import { NextRequest, NextResponse } from 'next/server';
import { checkPlanLimits } from '@/lib/billing/plans';
import {
  dispatchReceiptRequest,
  dispatchWithFallback,
  type ChannelConnection,
  type TransactionContext,
} from '@/lib/channels/dispatcher';

// POST /api/channels/dispatch — Send receipt request via connected channels
export async function POST(request: NextRequest) {
  try {
    const { transactionId, entityId, preferredChannel } = await request.json();

    if (!transactionId || !entityId) {
      return NextResponse.json(
        { error: 'Missing transactionId or entityId' },
        { status: 400 }
      );
    }

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: membership } = await (supabase as any)
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(supabase as any, membership.org_id, 'dispatch_channel');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    // Verify entity belongs to the user's org
    const { data: entity } = await (supabase as any)
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }

    // Get the transaction
    const { data: tx, error: txError } = await (supabase as any)
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('entity_id', entityId)
      .single();

    if (txError || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Get connected channels for this entity
    const { data: channels, error: channelsError } = await (supabase as any)
      .from('channel_connections')
      .select('*')
      .eq('entity_id', entityId)
      .eq('is_active', true);

    if (channelsError || !channels?.length) {
      return NextResponse.json(
        { error: 'No active channels connected for this entity' },
        { status: 404 }
      );
    }

    // Build transaction context
    const context: TransactionContext = {
      transactionId: tx.id,
      merchantName: tx.merchant_name || tx.merchant_raw || 'Unknown',
      amount: parseFloat(tx.amount),
      date: tx.date,
      cardLast4: tx.card_last4 || '0000',
      cardHolder: tx.card_holder || 'Team Member',
      suggestedCategory: tx.category_ai || undefined,
      suggestedGLCode: tx.gl_code || tx.category_ai || undefined,
      confidence: tx.confidence ? parseFloat(tx.confidence) : undefined,
    };

    // Map channels to connection format
    const connections: ChannelConnection[] = channels.map((ch: Record<string, any>) => ({
      channelType: ch.channel_type,
      channelId: ch.channel_id,
      accessToken: ch.access_token || undefined,
    }));

    let result: { success: boolean; channel: string; messageId?: string; error?: string };

    if (preferredChannel) {
      // Use priority-based dispatch with fallback
      result = await dispatchWithFallback(connections, context, preferredChannel);

      // Create receipt request record
      await (supabase as any).from('receipt_requests').insert({
        transaction_id: transactionId,
        channel_type: result.channel,
        channel_user_id: connections.find((c) => c.channelType === result.channel)?.channelId || '',
        message_id: result.messageId || '',
        status: result.success ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
      });

      return NextResponse.json({
        ok: result.success,
        channel: result.channel,
        messageId: result.messageId,
        error: result.error,
      });
    } else {
      // Send to first available channel
      const connection = connections[0];
      result = await dispatchReceiptRequest(connection, context);

      await (supabase as any).from('receipt_requests').insert({
        transaction_id: transactionId,
        channel_type: result.channel,
        channel_user_id: connection.channelId,
        message_id: result.messageId || '',
        status: result.success ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
      });

      // Log to audit trail
      await (supabase as any).from('audit_log').insert({
        entity_id: entityId,
        action: 'create',
        target_type: 'receipt_request',
        target_id: transactionId,
        actor_type: 'system',
        details: {
          channel: result.channel,
          success: result.success,
          message_id: result.messageId,
        },
      });

      return NextResponse.json({
        ok: result.success,
        channel: result.channel,
        messageId: result.messageId,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Channel dispatch error:', error);
    return NextResponse.json(
      { error: 'Receipt dispatch failed' },
      { status: 500 }
    );
  }
}
