// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Smart Rule Suggestion Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Analyzes a user's categorization history and suggests categorization rules
// based on recurring patterns in merchant-to-GL-code mappings.

export interface RuleSuggestion {
  merchantPattern: string; // normalized merchant name pattern
  suggestedGlCode: string;
  suggestedGlName: string;
  confidence: number; // 0-100
  matchCount: number; // how many past transactions match
  exampleMerchants: string[]; // raw merchant names that match
}

interface CategorizedTransaction {
  merchant_name: string;
  category_human: string;
  category_ai: string;
}

interface ExistingRule {
  match_value: string;
  gl_code: string;
}

// ─── Normalization ──────────────────────────────────────────────────────────

/**
 * Normalizes a merchant name for grouping:
 * - Lowercase
 * - Trim whitespace
 * - Remove trailing numeric IDs (e.g., "UBER EATS #12345" → "uber eats")
 * - Remove trailing hash/reference codes
 * - Collapse multiple spaces
 */
export function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove trailing # followed by digits/alphanumeric
    .replace(/\s*#[\w-]+$/i, '')
    // Remove trailing numeric sequences (order IDs, store numbers)
    .replace(/\s+\d{3,}$/, '')
    // Remove trailing asterisks and text after them (e.g., "SQ *COFFEE SHOP")
    .replace(/^(sq|tst|sp)\s*\*\s*/i, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Suggestion Engine ──────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 20;
const MIN_GROUP_SIZE = 3;
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const MEDIUM_CONFIDENCE_THRESHOLD = 0.6;
const MAX_EXAMPLE_MERCHANTS = 5;

/**
 * Analyzes categorized transactions and suggests categorization rules
 * based on consistent human categorization patterns.
 *
 * Algorithm:
 * 1. Group transactions by normalized merchant name
 * 2. For each group with 3+ transactions where the user consistently chose the same GL code:
 *    a. If >80% of transactions have the same category_human → high confidence (90)
 *    b. If >60% → medium confidence (70)
 * 3. Filter out merchants that already have existing rules
 * 4. Sort by confidence descending, then matchCount descending
 * 5. Return top 20 suggestions
 */
export function suggestCategorizationRules(
  categorizedTransactions: CategorizedTransaction[],
  existingRules: ExistingRule[]
): RuleSuggestion[] {
  if (!categorizedTransactions || categorizedTransactions.length === 0) {
    return [];
  }

  // Step 1: Group by normalized merchant name
  const merchantGroups = new Map<
    string,
    {
      rawNames: Set<string>;
      glCodes: Map<string, { count: number; glName: string }>;
      total: number;
    }
  >();

  for (const tx of categorizedTransactions) {
    if (!tx.merchant_name || !tx.category_human) continue;

    const normalized = normalizeMerchantName(tx.merchant_name);
    if (!normalized) continue;

    let group = merchantGroups.get(normalized);
    if (!group) {
      group = { rawNames: new Set(), glCodes: new Map(), total: 0 };
      merchantGroups.set(normalized, group);
    }

    group.rawNames.add(tx.merchant_name);
    group.total++;

    const existing = group.glCodes.get(tx.category_human);
    if (existing) {
      existing.count++;
    } else {
      // Use category_ai as fallback GL name if available, otherwise use the GL code itself
      const glName = tx.category_ai || tx.category_human;
      group.glCodes.set(tx.category_human, { count: 1, glName });
    }
  }

  // Step 2: Build existing rules lookup (normalized)
  const existingRulePatterns = new Set<string>();
  for (const rule of existingRules) {
    existingRulePatterns.add(normalizeMerchantName(rule.match_value));
  }

  // Step 3: Evaluate each group
  const suggestions: RuleSuggestion[] = [];

  for (const [pattern, group] of merchantGroups) {
    // Skip groups with fewer than MIN_GROUP_SIZE transactions
    if (group.total < MIN_GROUP_SIZE) continue;

    // Skip merchants that already have existing rules
    if (existingRulePatterns.has(pattern)) continue;

    // Find the dominant GL code
    let dominantCode = '';
    let dominantCount = 0;
    let dominantGlName = '';

    for (const [code, info] of group.glCodes) {
      if (info.count > dominantCount) {
        dominantCode = code;
        dominantCount = info.count;
        dominantGlName = info.glName;
      }
    }

    // Calculate consistency ratio
    const ratio = dominantCount / group.total;

    let confidence: number;
    if (ratio >= HIGH_CONFIDENCE_THRESHOLD) {
      confidence = 90;
    } else if (ratio >= MEDIUM_CONFIDENCE_THRESHOLD) {
      confidence = 70;
    } else {
      // Below 60% consistency — skip this merchant
      continue;
    }

    suggestions.push({
      merchantPattern: pattern,
      suggestedGlCode: dominantCode,
      suggestedGlName: dominantGlName,
      confidence,
      matchCount: group.total,
      exampleMerchants: Array.from(group.rawNames).slice(0, MAX_EXAMPLE_MERCHANTS),
    });
  }

  // Step 4: Sort by confidence descending, then matchCount descending
  suggestions.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.matchCount - a.matchCount;
  });

  // Step 5: Return top MAX_SUGGESTIONS
  return suggestions.slice(0, MAX_SUGGESTIONS);
}
