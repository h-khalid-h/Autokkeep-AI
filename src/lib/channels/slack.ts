import { WebClient } from '@slack/web-api';
import { formatCurrency } from '@/lib/currency/converter';

// ============================================
// SLACK CLIENT
// ============================================

let defaultSlackClient: WebClient | null = null;

export function getSlackClient(token?: string): WebClient {
  // If a per-tenant token is provided, always create a fresh client (don't pollute the shared singleton)
  if (token) {
    return new WebClient(token);
  }

  // For the default bot token, use the cached singleton
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) throw new Error('Missing SLACK_BOT_TOKEN');

  if (!defaultSlackClient) {
    defaultSlackClient = new WebClient(botToken);
  }

  return defaultSlackClient;
}

// ============================================
// Slack Message Blocks Builder
// ============================================

export interface ReceiptRequestPayload {
  transactionId: string;
  merchantName: string;
  amount: number;
  date: string;
  cardLast4: string;
  cardHolder: string;
  suggestedCategory?: string;
  suggestedGLCode?: string;
  confidence?: number;
  currency?: string;
}

export function buildReceiptRequestBlocks(payload: ReceiptRequestPayload) {
  const formattedAmount = formatCurrency(payload.amount, payload.currency || 'USD');

  const confidenceEmoji = (payload.confidence ?? 0) >= 75 ? '🟡' : '🔴';

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '💳 New Transaction Requires Your Input',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Merchant:*\n${payload.merchantName}` },
        { type: 'mrkdwn', text: `*Amount:*\n${formattedAmount}` },
        { type: 'mrkdwn', text: `*Date:*\n${payload.date}` },
        { type: 'mrkdwn', text: `*Card:*\n····${payload.cardLast4}` },
      ],
    },
    ...(payload.suggestedCategory
      ? [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${confidenceEmoji} *AI Suggestion:* ${payload.suggestedGLCode} — ${payload.suggestedCategory} (${payload.confidence}% confidence)`,
            },
          },
        ]
      : []),
    {
      type: 'divider',
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*What type of expense is this?*',
      },
    },
    {
      type: 'actions',
      block_id: `receipt_action_${payload.transactionId}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Accept AI Category', emoji: true },
          style: 'primary',
          action_id: 'accept_category',
          value: JSON.stringify({
            transactionId: payload.transactionId,
            glCode: payload.suggestedGLCode,
            action: 'accept',
          }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '☕ Client Meeting', emoji: true },
          action_id: 'category_meeting',
          value: JSON.stringify({
            transactionId: payload.transactionId,
            glCode: '6410',
            glName: 'Business Meals & Entertainment',
            action: 'categorize',
          }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🍕 Team Lunch', emoji: true },
          action_id: 'category_team',
          value: JSON.stringify({
            transactionId: payload.transactionId,
            glCode: '6020',
            glName: 'Employee Welfare',
            action: 'categorize',
          }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📎 Upload Receipt', emoji: true },
          action_id: 'upload_receipt',
          value: JSON.stringify({
            transactionId: payload.transactionId,
            action: 'upload',
          }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Personal', emoji: true },
          style: 'danger',
          action_id: 'mark_personal',
          value: JSON.stringify({
            transactionId: payload.transactionId,
            action: 'personal',
          }),
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🤖 Autokkeep · Ref: ${payload.transactionId}`,
        },
      ],
    },
  ];
}

// ============================================
// Send Receipt Request via Slack
// ============================================

export async function sendSlackReceiptRequest(
  channelOrUserId: string,
  payload: ReceiptRequestPayload,
  token?: string
): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  const client = getSlackClient(token);
  const blocks = buildReceiptRequestBlocks(payload);

  try {
    const result = await client.chat.postMessage({
      channel: channelOrUserId,
      text: `💳 Transaction requires input: ${payload.merchantName} for ${formatCurrency(payload.amount, payload.currency || 'USD')}`,
      blocks,
      unfurl_links: false,
    });

    return {
      ok: result.ok ?? false,
      ts: result.ts,
      channel: result.channel,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Slack error';
    return { ok: false, error: message };
  }
}

// ============================================
// Send Confirmation Message
// ============================================

export async function sendSlackConfirmation(
  channel: string,
  threadTs: string,
  transactionId: string,
  action: string,
  glCode?: string,
  glName?: string,
  token?: string
) {
  const client = getSlackClient(token);

  let text = '';
  switch (action) {
    case 'accept':
      text = `✅ *Accepted!* Transaction \`${transactionId}\` categorized as \`${glCode}\` — ${glName}. Syncing to ledger...`;
      break;
    case 'categorize':
      text = `📝 *Recategorized!* Transaction \`${transactionId}\` → \`${glCode}\` — ${glName}`;
      break;
    case 'personal':
      text = `❌ *Marked as personal.* Transaction \`${transactionId}\` excluded from business books.`;
      break;
    case 'upload':
      text = `📎 *Upload noted!* Please drop the receipt file in this thread for transaction \`${transactionId}\`.`;
      break;
    default:
      text = `✓ Action recorded for transaction \`${transactionId}\`.`;
  }

  try {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
    });
  } catch (error) {
    console.error('Failed to send Slack confirmation:', error);
  }
}

// ============================================
// Slack Interaction Payload Parser
// ============================================

export interface SlackInteractionAction {
  transactionId: string;
  glCode?: string;
  glName?: string;
  action: 'accept' | 'categorize' | 'upload' | 'personal';
}

export function parseSlackInteraction(actionValue: string): SlackInteractionAction | null {
  try {
    return JSON.parse(actionValue);
  } catch {
    return null;
  }
}

// ============================================
// Slack Signature Verification
// ============================================

import crypto from 'crypto';

export function verifySlackSignature(
  signingSecret: string,
  requestTimestamp: string,
  rawBody: string,
  signature: string
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const fiveMinutesAgo = now - 60 * 5;
  const fiveMinutesFromNow = now + 60 * 5;
  const timestamp = parseInt(requestTimestamp, 10);

  if (timestamp < fiveMinutesAgo || timestamp > fiveMinutesFromNow) return false;

  const baseString = `v0:${requestTimestamp}:${rawBody}`;
  const hmac = crypto.createHmac('sha256', signingSecret);
  hmac.update(baseString);
  const computedSignature = `v0=${hmac.digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(signature)
    );
  } catch {
    // timingSafeEqual throws RangeError if buffers have different lengths
    return false;
  }
}

// ============================================
// Slack OAuth Helpers
// ============================================

export function getSlackInstallUrl(): string {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) throw new Error('Missing SLACK_CLIENT_ID');

  const scopes = [
    'chat:write',
    'chat:write.public',
    'files:read',
    'im:history',
    'im:write',
    'users:read',
    'users:read.email',
    'commands',
  ].join(',');

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/slack/callback`;

  return `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export async function exchangeSlackCode(code: string): Promise<{
  ok: boolean;
  accessToken?: string;
  teamId?: string;
  teamName?: string;
  botUserId?: string;
  error?: string;
}> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/channels/slack/callback`;

  if (!clientId || !clientSecret) {
    return { ok: false, error: 'Missing Slack OAuth credentials' };
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      return { ok: false, error: data.error };
    }

    return {
      ok: true,
      accessToken: data.access_token,
      teamId: data.team?.id,
      teamName: data.team?.name,
      botUserId: data.bot_user_id,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'OAuth exchange failed' };
  }
}
