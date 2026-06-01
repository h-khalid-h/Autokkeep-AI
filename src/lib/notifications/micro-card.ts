// ============================================
// NOTIFICATION MICRO-CARD BUILDER
// High-risk transaction alerts for Slack & SMS
// ============================================

import { formatCurrency } from '@/lib/currency/converter';

// --- Types ---

export interface TransactionData {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  category_ai: string | null;
  entity_id: string;
  description: string | null;
  currency?: string;
}

export interface ConfidenceBreakdown {
  overall: number;
  merchant_match: number;
  mcc_match: number;
  historical_pattern: number;
  amount_anomaly: number;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: string;
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: { type: string; text: string };
    style?: string;
    url?: string;
    action_id?: string;
  }>;
}

// --- Constants ---

const HIGH_RISK_AMOUNT_THRESHOLD = 250;
const LOW_CONFIDENCE_THRESHOLD = 0.95;

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com';
}

function getRiskLevel(amount: number, confidence: number): 'high' | 'medium' | 'low' {
  if (Math.abs(amount) >= HIGH_RISK_AMOUNT_THRESHOLD && confidence < LOW_CONFIDENCE_THRESHOLD) {
    return 'high';
  }
  if (Math.abs(amount) >= HIGH_RISK_AMOUNT_THRESHOLD || confidence < LOW_CONFIDENCE_THRESHOLD) {
    return 'medium';
  }
  return 'low';
}

function getRiskEmoji(level: 'high' | 'medium' | 'low'): string {
  switch (level) {
    case 'high': return '🔴';
    case 'medium': return '🟡';
    case 'low': return '🟢';
  }
}

// --- Slack Block Kit ---

/**
 * Builds a Slack Block Kit message for a high-risk transaction review card.
 * Returns an array of Slack blocks ready for the Slack API.
 */
export function buildSlackCard(
  transaction: TransactionData,
  confidence: ConfidenceBreakdown
): SlackBlock[] {
  const baseUrl = getBaseUrl();
  const riskLevel = getRiskLevel(transaction.amount, confidence.overall);
  const riskEmoji = getRiskEmoji(riskLevel);

  const approveUrl = `${baseUrl}/api/transactions/${transaction.id}/receipt?action=approve`;
  const rejectUrl = `${baseUrl}/api/transactions/${transaction.id}/receipt?action=reject`;

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${riskEmoji} Transaction Review Required`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Merchant:*\n${transaction.merchant_name || 'Unknown'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Amount:*\n${formatCurrency(transaction.amount, transaction.currency)}`,
        },
        {
          type: 'mrkdwn',
          text: `*Date:*\n${transaction.date}`,
        },
        {
          type: 'mrkdwn',
          text: `*AI Category:*\n${transaction.category_ai || 'Uncategorized'}`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Overall Confidence:*\n${(confidence.overall * 100).toFixed(1)}%`,
        },
        {
          type: 'mrkdwn',
          text: `*Risk Level:*\n${riskEmoji} ${riskLevel.toUpperCase()}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Confidence Breakdown:*',
          `• Merchant Match: ${(confidence.merchant_match * 100).toFixed(0)}%`,
          `• MCC Match: ${(confidence.mcc_match * 100).toFixed(0)}%`,
          `• Historical Pattern: ${(confidence.historical_pattern * 100).toFixed(0)}%`,
          `• Amount Anomaly: ${(confidence.amount_anomaly * 100).toFixed(0)}%`,
        ].join('\n'),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✅ Approve' },
          style: 'primary',
          url: approveUrl,
          action_id: `approve_${transaction.id}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '❌ Reject' },
          style: 'danger',
          url: rejectUrl,
          action_id: `reject_${transaction.id}`,
        },
      ],
    },
  ];

  return blocks;
}

// --- SMS Plain Text ---

/**
 * Builds a plain-text SMS message for a high-risk transaction review.
 * Compact format suitable for SMS character limits.
 */
export function buildSMSCard(
  transaction: TransactionData,
  confidence: ConfidenceBreakdown
): string {
  const baseUrl = getBaseUrl();
  const riskLevel = getRiskLevel(transaction.amount, confidence.overall);
  const riskSymbol = riskLevel === 'high' ? '!!' : riskLevel === 'medium' ? '!' : '';

  const lines = [
    `${riskSymbol}AUTOKKEEP REVIEW${riskSymbol}`,
    `${transaction.merchant_name || 'Unknown'} — ${formatCurrency(transaction.amount, transaction.currency)}`,
    `Date: ${transaction.date}`,
    `AI Cat: ${transaction.category_ai || 'N/A'}`,
    `Confidence: ${(confidence.overall * 100).toFixed(0)}%`,
    `Risk: ${riskLevel.toUpperCase()}`,
    '',
    `Approve: ${baseUrl}/api/transactions/${transaction.id}/receipt?action=approve`,
    `Reject: ${baseUrl}/api/transactions/${transaction.id}/receipt?action=reject`,
  ];

  return lines.join('\n');
}
