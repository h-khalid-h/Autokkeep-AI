// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — AI Categorization Prompt Templates
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { formatCurrency } from '@/lib/currency/converter';

/**
 * System prompt instructing the LLM to categorize financial transactions.
 * Returns structured JSON with GL code, confidence, reasoning, and alternatives.
 */
export const CATEGORIZATION_SYSTEM_PROMPT = `You are an expert financial transaction categorizer for accounting firms and small businesses. Your job is to analyze bank transactions and assign the correct General Ledger (GL) code from the entity's chart of accounts.

For each transaction, analyze:
- Merchant name and raw bank description
- Transaction amount and patterns
- MCC (Merchant Category Code) classification
- Historical categorization patterns for similar transactions
- Card holder context and spending patterns

You MUST respond with valid JSON in this exact schema:
{
  "suggested_gl_code": "string - the GL code from the chart of accounts",
  "suggested_gl_name": "string - the GL account name",
  "confidence": "number 0-100 - your confidence in this categorization",
  "reasoning": "string - detailed explanation of why you chose this categorization, including what factors increased or decreased your confidence",
  "alternative_codes": [
    {
      "code": "string - alternative GL code",
      "name": "string - alternative GL account name",
      "confidence": "number 0-100 - confidence for this alternative"
    }
  ]
}

Confidence guidelines:
- 95-100: Exact merchant match with consistent historical pattern
- 80-94: Strong match with minor ambiguity (e.g., amount deviation)
- 60-79: Reasonable match but notable uncertainty (e.g., ambiguous merchant)
- 40-59: Low confidence, multiple plausible categories
- 0-39: Very uncertain, needs human review

Always provide at least 1-2 alternatives when confidence is below 90%.
Never fabricate GL codes — only use codes from the provided chart of accounts.
`;

/**
 * Builds the user prompt containing transaction details, chart of accounts,
 * and historical categorization patterns.
 */
export function buildCategorizationUserPrompt(
  transaction: {
    merchant: string;
    merchantRaw?: string;
    amount: number;
    date: string;
    mcc?: string;
    currency?: string;
    cardHolder?: string;
    bankDescription?: string;
  },
  chartOfAccounts: Array<{ code: string; name: string }>,
  historicalPatterns?: Array<{
    merchant: string;
    glCode: string;
    glName: string;
    frequency: number;
    lastUsed: string;
  }>
): string {
  let prompt = `## Transaction to Categorize\n\n`;
  prompt += `- **Merchant**: ${transaction.merchant}\n`;
  prompt += `- **Raw Bank Description**: ${transaction.merchantRaw || transaction.bankDescription || 'N/A'}\n`;
  prompt += `- **Amount**: ${formatCurrency(transaction.amount)}\n`;
  prompt += `- **Date**: ${transaction.date}\n`;

  if (transaction.mcc) {
    prompt += `- **MCC Code**: ${transaction.mcc}\n`;
  }
  if (transaction.currency) {
    prompt += `- **Currency**: ${transaction.currency}\n`;
  }
  if (transaction.cardHolder) {
    prompt += `- **Card Holder**: ${transaction.cardHolder}\n`;
  }

  prompt += `\n## Available Chart of Accounts\n\n`;
  prompt += `| Code | Account Name |\n|------|-------------|\n`;
  for (const account of chartOfAccounts) {
    prompt += `| ${account.code} | ${account.name} |\n`;
  }

  if (historicalPatterns && historicalPatterns.length > 0) {
    prompt += `\n## Historical Patterns for Similar Transactions\n\n`;
    for (const pattern of historicalPatterns) {
      prompt += `- Merchant "${pattern.merchant}" was categorized to ${pattern.glCode} (${pattern.glName}) ${pattern.frequency} time(s), last on ${pattern.lastUsed}\n`;
    }
  }

  prompt += `\nAnalyze this transaction and provide your categorization as JSON.`;
  return prompt;
}
