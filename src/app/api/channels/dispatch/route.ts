import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { rateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit';
import { decryptToken } from '@/lib/crypto';
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
    const limited = await rateLimit(request, { max: 20, windowSeconds: 60, prefix: 'dispatch' });
    if (limited) return limited;

    const { createServerClient } = await import('@/lib/supabase/server');
    const supabase = await createServerClient();
    const db = supabase as unknown as SupabaseQueryClient;

    // Auth check first
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: membership } = await db
      .from('team_members')
      .select('id, org_id')
      .eq('user_id', user.id)
      .single();
    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse and validate input
    const { transactionId, entityId, preferredChannel } = await request.json();

    if (!transactionId || !entityId) {
      return NextResponse.json(
        { error: 'Missing transactionId or entityId' },
        { status: 400 }
      );
    }

    // Enforce plan limits
    const planCheck = await checkPlanLimits(db, membership.org_id, 'dispatch_channel');
    if (!planCheck.allowed) {
      return NextResponse.json({ error: planCheck.reason, plan: planCheck.currentPlan }, { status: 403 });
    }

    // Verify entity belongs to the user's org
    const { data: entity } = await db
      .from('entities')
      .select('id')
      .eq('id', entityId)
      .eq('org_id', membership.org_id)
      .single();
    if (!entity) {
      return NextResponse.json({ error: 'Entity not found or access denied' }, { status: 403 });
    }

    // Get the transaction
    const { data: tx, error: txError } = await db
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('entity_id', entityId)
      .single();

    if (txError || !tx) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    // Get connected channels for this entity
    const { data: channels, error: channelsError } = await db
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
    const connections: ChannelConnection[] = channels.map((ch: Record<string, unknown>) => ({
      channelType: ch.channel_type as string,
      channelId: ch.channel_id as string,
      accessToken: ch.access_token ? decryptToken(ch.access_token as string) : undefined,
    }));

    let result: { success: boolean; channel: string; messageId?: string; error?: string };

    if (preferredChannel) {
      // Use priority-based dispatch with fallback
      result = await dispatchWithFallback(connections, context, preferredChannel);

      // Create receipt request record
      await db.from('receipt_requests').insert({
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

      await db.from('receipt_requests').insert({
        transaction_id: transactionId,
        channel_type: result.channel,
        channel_user_id: connection.channelId,
        message_id: result.messageId || '',
        status: result.success ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
      });

      // Log to audit trail
      await writeAuditLog({
        supabase: db,
        entityId,
        actorType: 'system',
        action: 'create',
        targetType: 'receipt_request',
        targetId: transactionId,
        details: {
          channel: result.channel,
          success: result.success,
          message_id: result.messageId,
        },
        request,
      });

      return NextResponse.json({
        ok: result.success,
        channel: result.channel,
        messageId: result.messageId,
        error: result.error,
      });
    }
  } catch (error: unknown) {
    console.error('Channel dispatch error:', error);
    return NextResponse.json(
      { error: 'Receipt dispatch failed' },
      { status: 500 }
    );
  }
}
