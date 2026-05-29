// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Dual-Engine AI Categorization Pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import OpenAI from 'openai';
import {
  CATEGORIZATION_SYSTEM_PROMPT,
  buildCategorizationUserPrompt,
} from './prompts';
import {
  tokenizeTransaction,
  hashSourceData,
  type RawTransactionData,
} from './privacy-parser';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CategorizationResult {
  glCode: string;
  glName: string;
  confidence: number;
  reasoning: string;
  engine: 'deterministic' | 'probabilistic';
  /** Rule match type for confidence gate calculation */
  ruleMatchType: 'exact_match' | 'pattern' | 'mcc' | 'none';
  /** SHA-256 hash of the source data for citation anchoring */
  sourceHash: string;
  alternatives: Array<{ code: string; name: string; confidence: number }>;
}

export interface CategorizationRule {
  id: string;
  vendor_pattern: string;
  mcc_code?: string;
  gl_code: string;
  gl_name: string;
  match_type: 'exact' | 'contains' | 'regex';
  priority: number;
}

export interface TransactionInput {
  id: string;
  merchant: string;
  merchantRaw?: string;
  amount: number;
  date: string;
  mcc?: string;
  currency?: string;
  cardHolder?: string;
  bankDescription?: string;
}

export interface ChartOfAccountsEntry {
  code: string;
  name: string;
}

export interface HistoricalPattern {
  merchant: string;
  glCode: string;
  glName: string;
  frequency: number;
  lastUsed: string;
}

// ─── Deterministic Engine ──────────────────────────────────────────────────────

/**
 * Attempts to categorize a transaction using exact-match rules.
 * Checks vendor name patterns (exact, contains, regex) and MCC codes.
 * Returns a result with 100% confidence if matched, null otherwise.
 */
export function categorizeDeterministic(
  transaction: TransactionInput,
  rules: CategorizationRule[]
): CategorizationResult | null {
  // Sort rules by priority (higher priority first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    let matched = false;
    const merchantLower = (transaction.merchant || '').toLowerCase();
    const merchantRawLower = (
      transaction.merchantRaw ||
      transaction.bankDescription ||
      ''
    ).toLowerCase();
    const patternLower = rule.vendor_pattern.toLowerCase();

    switch (rule.match_type) {
      case 'exact':
        matched =
          merchantLower === patternLower ||
          merchantRawLower === patternLower;
        break;

      case 'contains':
        matched =
          merchantLower.includes(patternLower) ||
          merchantRawLower.includes(patternLower);
        break;

      case 'regex':
        try {
          const regex = new RegExp(rule.vendor_pattern, 'i');
          matched =
            regex.test(transaction.merchant) ||
            regex.test(
              transaction.merchantRaw || transaction.bankDescription || ''
            );
        } catch {
          // Invalid regex pattern, skip this rule
          continue;
        }
        break;
    }

    // Also check MCC code if specified in the rule
    if (!matched && rule.mcc_code && transaction.mcc) {
      matched = rule.mcc_code.toLowerCase() === transaction.mcc.toLowerCase();
    }

    if (matched) {
      const ruleType = rule.mcc_code && transaction.mcc && rule.mcc_code.toLowerCase() === transaction.mcc.toLowerCase()
        ? 'mcc' as const
        : rule.match_type === 'exact'
          ? 'exact_match' as const
          : 'pattern' as const;

      return {
        glCode: rule.gl_code,
        glName: rule.gl_name,
        confidence: 100,
        reasoning: `Matched deterministic rule: "${rule.vendor_pattern}" (${rule.match_type} match, priority ${rule.priority})`,
        engine: 'deterministic',
        ruleMatchType: ruleType,
        sourceHash: hashSourceData({
          merchant: transaction.merchant,
          amount: transaction.amount,
          date: transaction.date,
          cardHolder: transaction.cardHolder,
          rawData: { bankDescription: transaction.bankDescription },
        }),
        alternatives: [],
      };
    }
  }

  return null;
}

// ─── Probabilistic Engine (OpenAI) ─────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Categorizes a transaction using the OpenAI API with structured JSON output.
 * Falls back to a zero-confidence result on error.
 */
export async function categorizeProbabilistic(
  transaction: TransactionInput,
  chartOfAccounts: ChartOfAccountsEntry[],
  history?: HistoricalPattern[]
): Promise<CategorizationResult> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4o';

  // ── Privacy Parser: tokenize before sending to OpenAI ──
  const rawData: RawTransactionData = {
    merchant: transaction.merchant,
    merchantRaw: transaction.merchantRaw,
    amount: transaction.amount,
    date: transaction.date,
    cardHolder: transaction.cardHolder,
    rawData: {
      mcc: transaction.mcc,
      currency: transaction.currency,
      bankDescription: transaction.bankDescription,
    },
  };
  const tokenized = tokenizeTransaction(rawData);
  const sourceHash = tokenized.sourceHash;

  // Send only tokenized (PII-stripped) data to OpenAI
  const userPrompt = buildCategorizationUserPrompt(
    {
      merchant: tokenized.vendorToken,
      merchantRaw: tokenized.descriptionToken,
      amount: tokenized.amount,
      date: tokenized.dateMarker,
      mcc: tokenized.mccCode || undefined,
      currency: tokenized.currency,
      // cardHolder is intentionally omitted (PII)
      bankDescription: tokenized.descriptionToken,
    },
    chartOfAccounts,
    history
  );

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'categorization_result',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              suggested_gl_code: { type: 'string' },
              suggested_gl_name: { type: 'string' },
              confidence: { type: 'number' },
              reasoning: { type: 'string' },
              alternative_codes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    code: { type: 'string' },
                    name: { type: 'string' },
                    confidence: { type: 'number' },
                  },
                  required: ['code', 'name', 'confidence'],
                  additionalProperties: false,
                },
              },
            },
            required: [
              'suggested_gl_code',
              'suggested_gl_name',
              'confidence',
              'reasoning',
              'alternative_codes',
            ],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    let confidence = Math.min(100, Math.max(0, parsed.confidence));

    // Validate that the suggested GL code exists in the chart of accounts
    const validCode = chartOfAccounts.find(c => c.code === parsed.suggested_gl_code);
    if (!validCode && chartOfAccounts.length > 0) {
      // AI hallucinated a non-existent GL code — downgrade confidence to force human review
      console.warn(`[AI Categorizer] AI suggested non-existent GL code: ${parsed.suggested_gl_code}`);
      confidence = Math.min(confidence, 50);
    }

    return {
      glCode: parsed.suggested_gl_code,
      glName: validCode?.name || parsed.suggested_gl_name,
      confidence,
      reasoning: parsed.reasoning,
      engine: 'probabilistic',
      ruleMatchType: 'none',
      sourceHash,
      alternatives: (parsed.alternative_codes || []).map(
        (alt: { code: string; name: string; confidence: number }) => ({
          code: alt.code,
          name: alt.name,
          confidence: Math.min(100, Math.max(0, alt.confidence)),
        })
      ),
    };
  } catch (error) {
    console.error('[AI Categorizer] OpenAI call failed:', error);

    // Fallback: return a low-confidence result indicating manual review needed
    return {
      glCode: '',
      glName: 'Uncategorized',
      confidence: 0,
      reasoning: `AI categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}. Manual review required.`,
      engine: 'probabilistic',
      ruleMatchType: 'none',
      sourceHash,
      alternatives: [],
    };
  }
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────

/**
 * Main categorization pipeline:
 * 1. Try deterministic rules first (instant, free, 100% confidence)
 * 2. Fall back to probabilistic AI engine (OpenAI)
 */
export async function categorizeTransaction(
  transaction: TransactionInput,
  rules: CategorizationRule[],
  chartOfAccounts: ChartOfAccountsEntry[],
  history?: HistoricalPattern[]
): Promise<CategorizationResult> {
  // Step 1: Try deterministic rules first (instant, free)
  const deterministicResult = categorizeDeterministic(transaction, rules);
  if (deterministicResult) {
    return deterministicResult;
  }

  // Step 2: Fall back to probabilistic AI engine
  return categorizeProbabilistic(transaction, chartOfAccounts, history);
}

// ─── Batch Processing ──────────────────────────────────────────────────────────

const CONCURRENCY_LIMIT = 5;
const RATE_LIMIT_DELAY_MS = 200; // Delay between OpenAI calls to avoid rate limits

/**
 * Process multiple transactions with a concurrency-limited Promise pool.
 * Returns a Map of transaction ID → CategorizationResult.
 */
export async function batchCategorize(
  transactions: TransactionInput[],
  rules: CategorizationRule[],
  chartOfAccounts: ChartOfAccountsEntry[],
  history?: HistoricalPattern[]
): Promise<Map<string, CategorizationResult>> {
  const results = new Map<string, CategorizationResult>();
  const queue = [...transactions];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const transaction = queue.shift();
      if (!transaction) break;

      try {
        const result = await categorizeTransaction(
          transaction,
          rules,
          chartOfAccounts,
          history
        );
        results.set(transaction.id, result);

        // Only apply rate limit delay when OpenAI was called (probabilistic engine)
        if (result.engine === 'probabilistic') {
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }
      } catch (error) {
        console.error(
          `[AI Categorizer] Failed to categorize transaction ${transaction.id}:`,
          error
        );
        results.set(transaction.id, {
          glCode: '',
          glName: 'Uncategorized',
          confidence: 0,
          reasoning: `Categorization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          engine: 'probabilistic',
          ruleMatchType: 'none',
          sourceHash: '',
          alternatives: [],
        });
      }
    }
  }

  // Create worker pool with concurrency limit
  const workers = Array.from(
    { length: Math.min(CONCURRENCY_LIMIT, transactions.length) },
    () => processNext()
  );
  await Promise.all(workers);

  return results;
}
