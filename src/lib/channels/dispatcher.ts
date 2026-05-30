// ============================================
// UNIFIED CHANNEL DISPATCHER
// Routes receipt requests to the right channel
// ============================================

import { sendSlackReceiptRequest, type ReceiptRequestPayload } from './slack';
import { sendTeamsMessage, type TeamsAdaptiveCardPayload } from './teams';
import { sendSMS, sendWhatsApp, buildReceiptRequestMessage, type ReceiptRequestContext } from './twilio';

export type ChannelType = 'slack' | 'teams' | 'whatsapp' | 'sms';

export interface ChannelConnection {
  channelType: ChannelType;
  channelId: string;
  accessToken?: string;
  webhookUrl?: string;
}

export interface DispatchResult {
  success: boolean;
  channel: ChannelType;
  messageId?: string;
  error?: string;
}

export interface TransactionContext {
  transactionId: string;
  merchantName: string;
  amount: number;
  date: string;
  cardLast4: string;
  cardHolder: string;
  suggestedCategory?: string;
  suggestedGLCode?: string;
  confidence?: number;
}

// ============================================
// Main Dispatcher
// ============================================

export async function dispatchReceiptRequest(
  connection: ChannelConnection,
  context: TransactionContext
): Promise<DispatchResult> {
  try {
    switch (connection.channelType) {
      case 'slack':
        return await dispatchSlack(connection, context);
      case 'teams':
        return await dispatchTeams(connection, context);
      case 'whatsapp':
        return await dispatchWhatsApp(connection, context);
      case 'sms':
        return await dispatchSMS(connection, context);
      default:
        return {
          success: false,
          channel: connection.channelType,
          error: `Unsupported channel type: ${connection.channelType}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      channel: connection.channelType,
      error: error instanceof Error ? error.message : 'Dispatch failed',
    };
  }
}

// ============================================
// Multi-Channel Dispatch
// Send to all connected channels for a user
// ============================================

export async function dispatchToAllChannels(
  connections: ChannelConnection[],
  context: TransactionContext
): Promise<DispatchResult[]> {
  const results = await Promise.allSettled(
    connections.map((conn) => dispatchReceiptRequest(conn, context))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return {
      success: false,
      channel: connections[index].channelType,
      error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
    };
  });
}

// ============================================
// Channel-specific dispatchers
// ============================================

async function dispatchSlack(
  connection: ChannelConnection,
  context: TransactionContext
): Promise<DispatchResult> {
  const payload: ReceiptRequestPayload = {
    transactionId: context.transactionId,
    merchantName: context.merchantName,
    amount: context.amount,
    date: context.date,
    cardLast4: context.cardLast4,
    cardHolder: context.cardHolder,
    suggestedCategory: context.suggestedCategory,
    suggestedGLCode: context.suggestedGLCode,
    confidence: context.confidence,
  };

  const result = await sendSlackReceiptRequest(
    connection.channelId,
    payload,
    connection.accessToken
  );

  return {
    success: result.ok,
    channel: 'slack',
    messageId: result.ts,
    error: result.error,
  };
}

async function dispatchTeams(
  connection: ChannelConnection,
  context: TransactionContext
): Promise<DispatchResult> {
  const webhookUrl = connection.webhookUrl || process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      success: false,
      channel: 'teams',
      error: 'No Teams webhook URL configured',
    };
  }

  const payload: TeamsAdaptiveCardPayload = {
    transactionId: context.transactionId,
    merchantName: context.merchantName,
    amount: context.amount,
    date: context.date,
    cardLast4: context.cardLast4,
    cardHolder: context.cardHolder,
    suggestedCategory: context.suggestedCategory,
    suggestedGLCode: context.suggestedGLCode,
    confidence: context.confidence,
  };

  const result = await sendTeamsMessage(webhookUrl, payload);

  return {
    success: result.ok,
    channel: 'teams',
    error: result.error,
  };
}

async function dispatchWhatsApp(
  connection: ChannelConnection,
  context: TransactionContext
): Promise<DispatchResult> {
  const receiptContext: ReceiptRequestContext = {
    transactionId: context.transactionId,
    merchantName: context.merchantName,
    amount: context.amount,
    date: context.date,
    cardLast4: context.cardLast4,
    cardHolder: context.cardHolder,
  };

  const message = buildReceiptRequestMessage(receiptContext);

  try {
    const result = await sendWhatsApp({
      to: connection.channelId,
      message,
    });

    return {
      success: true,
      channel: 'whatsapp',
      messageId: result.sid,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'WhatsApp dispatch failed',
    };
  }
}

async function dispatchSMS(
  connection: ChannelConnection,
  context: TransactionContext
): Promise<DispatchResult> {
  const receiptContext: ReceiptRequestContext = {
    transactionId: context.transactionId,
    merchantName: context.merchantName,
    amount: context.amount,
    date: context.date,
    cardLast4: context.cardLast4,
    cardHolder: context.cardHolder,
  };

  const message = buildReceiptRequestMessage(receiptContext);

  try {
    const result = await sendSMS({
      to: connection.channelId,
      message,
    });

    return {
      success: true,
      channel: 'sms',
      messageId: result.sid,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'sms',
      error: error instanceof Error ? error.message : 'SMS dispatch failed',
    };
  }
}

// ============================================
// Priority-based dispatch
// Try preferred channel first, fallback to others
// ============================================

export async function dispatchWithFallback(
  connections: ChannelConnection[],
  context: TransactionContext,
  preferredChannel?: ChannelType
): Promise<DispatchResult> {
  if (!connections || connections.length === 0) {
    return {
      success: false,
      channel: preferredChannel || 'slack',
      error: 'No channel connections configured',
    };
  }

  // Sort connections with preferred channel first
  const sorted = [...connections].sort((a, b) => {
    if (a.channelType === preferredChannel) return -1;
    if (b.channelType === preferredChannel) return 1;
    // Priority order: slack > teams > whatsapp > sms
    const priority: Record<ChannelType, number> = {
      slack: 0,
      teams: 1,
      whatsapp: 2,
      sms: 3,
    };
    return priority[a.channelType] - priority[b.channelType];
  });

  for (const connection of sorted) {
    const result = await dispatchReceiptRequest(connection, context);
    if (result.success) return result;
    console.warn(
      `Channel ${result.channel} failed: ${result.error}. Trying next...`
    );
  }

  return {
    success: false,
    channel: sorted[0].channelType,
    error: 'All channels failed',
  };
}
