// ============================================
// MICROSOFT TEAMS INTEGRATION
// ============================================

import { formatCurrency } from '@/lib/currency/converter';

export interface TeamsAdaptiveCardPayload {
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

// ============================================
// Build Adaptive Card for Receipt Request
// ============================================

export function buildTeamsAdaptiveCard(payload: TeamsAdaptiveCardPayload) {
  const formattedAmount = formatCurrency(payload.amount, payload.currency || 'USD');

  const confidenceColor = (payload.confidence ?? 0) >= 75 ? 'good' : 'attention';

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.5',
          body: [
            {
              type: 'ColumnSet',
              columns: [
                {
                  type: 'Column',
                  width: 'auto',
                  items: [
                    {
                      type: 'TextBlock',
                      text: '💳',
                      size: 'large',
                    },
                  ],
                },
                {
                  type: 'Column',
                  width: 'stretch',
                  items: [
                    {
                      type: 'TextBlock',
                      text: 'Transaction Requires Your Input',
                      weight: 'bolder',
                      size: 'medium',
                    },
                    {
                      type: 'TextBlock',
                      text: `Autokkeep · Ref: ${payload.transactionId}`,
                      isSubtle: true,
                      size: 'small',
                    },
                  ],
                },
              ],
            },
            {
              type: 'FactSet',
              facts: [
                { title: 'Merchant', value: payload.merchantName },
                { title: 'Amount', value: formattedAmount },
                { title: 'Date', value: payload.date },
                { title: 'Card', value: `····${payload.cardLast4}` },
                ...(payload.suggestedCategory
                  ? [
                      {
                        title: 'AI Suggestion',
                        value: `${payload.suggestedGLCode} — ${payload.suggestedCategory} (${payload.confidence}%)`,
                      },
                    ]
                  : []),
              ],
            },
            ...(payload.confidence
              ? [
                  {
                    type: 'TextBlock',
                    text: `Confidence: ${payload.confidence}%`,
                    color: confidenceColor,
                    weight: 'bolder',
                    size: 'small',
                  },
                ]
              : []),
            {
              type: 'TextBlock',
              text: 'What type of expense is this?',
              weight: 'bolder',
              wrap: true,
            },
            {
              type: 'Input.ChoiceSet',
              id: 'category_choice',
              style: 'expanded',
              choices: [
                { title: '✅ Accept AI Category', value: 'accept' },
                { title: '☕ Client Meeting', value: 'meeting' },
                { title: '🍕 Team Lunch', value: 'team_lunch' },
                { title: '❌ Personal (exclude)', value: 'personal' },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.Submit',
              title: 'Submit',
              data: {
                transactionId: payload.transactionId,
                action: 'categorize',
              },
            },
            {
              type: 'Action.OpenUrl',
              title: '📎 Upload Receipt',
              url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upload=${payload.transactionId}`,
            },
          ],
        },
      },
    ],
  };
}

// ============================================
// Send Teams Message via Incoming Webhook
// ============================================

export async function sendTeamsMessage(
  webhookUrl: string,
  payload: TeamsAdaptiveCardPayload
): Promise<{ ok: boolean; error?: string }> {
  const card = buildTeamsAdaptiveCard(payload);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Teams webhook failed: ${response.status} - ${text}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Teams message send failed',
    };
  }
}

// ============================================
// Send Teams Confirmation
// ============================================

export async function sendTeamsConfirmation(
  webhookUrl: string,
  transactionId: string,
  action: string,
  glCode?: string,
  glName?: string
): Promise<void> {
  let text = '';
  switch (action) {
    case 'accept':
      text = `✅ Transaction ${transactionId} categorized as ${glCode} — ${glName}. Syncing to ledger...`;
      break;
    case 'categorize':
      text = `📝 Transaction ${transactionId} recategorized → ${glCode} — ${glName}`;
      break;
    case 'personal':
      text = `❌ Transaction ${transactionId} marked as personal. Excluded from business books.`;
      break;
    default:
      text = `✓ Action recorded for ${transactionId}.`;
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              type: 'AdaptiveCard',
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              version: '1.5',
              body: [
                {
                  type: 'TextBlock',
                  text,
                  wrap: true,
                },
              ],
            },
          },
        ],
      }),
    });
  } catch (error) {
    console.error('Failed to send Teams confirmation:', error);
  }
}

// ============================================
// Parse Teams Webhook Response
// ============================================

export interface TeamsWebhookAction {
  transactionId: string;
  categoryChoice: string;
  action: string;
}

export function parseTeamsWebhookPayload(body: Record<string, unknown>): TeamsWebhookAction | null {
  try {
    const data = body.data as Record<string, string> | undefined;
    const categoryChoice = (data?.category_choice ?? body.category_choice) as string | undefined;

    if (!data?.transactionId) return null;

    return {
      transactionId: data.transactionId,
      categoryChoice: categoryChoice || 'accept',
      action: data.action || 'categorize',
    };
  } catch {
    return null;
  }
}

// Map Teams choice values to GL codes
export function mapTeamsChoiceToGL(choice: string): { glCode: string; glName: string } | null {
  const mapping: Record<string, { glCode: string; glName: string }> = {
    meeting: { glCode: '6410', glName: 'Business Meals & Entertainment' },
    team_lunch: { glCode: '6020', glName: 'Employee Welfare' },
    office_supplies: { glCode: '6510', glName: 'Office Supplies & Equipment' },
    travel: { glCode: '6310', glName: 'Travel - Airfare' },
    transport: { glCode: '6320', glName: 'Local Transportation' },
    software: { glCode: '5120', glName: 'Software Subscriptions' },
  };

  return mapping[choice] ?? null;
}
