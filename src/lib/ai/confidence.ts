/**
 * Composite Confidence Gate — Mathematical Guardrails for AI Decisions
 *
 * Implements the PRD v2.0 composite evaluation score (C_s) that determines
 * whether a transaction can bypass human validation.
 *
 * C_s = (w1 × P_llm) + (w2 × S_rule) + (w3 × M_doc)
 *
 * Where:
 *   P_llm  = LLM confidence (0.0-1.0) from OpenAI response
 *   S_rule = Rule match score (1.0 exact, 0.5 pattern, 0.0 none)
 *   M_doc  = Document corroboration (1.0 if receipt exists, 0.0 if none)
 */

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Weights for composite score (must sum to 1.0) */
export const WEIGHTS = {
  W_LLM: 0.50,   // w1: LLM confidence weight
  W_RULE: 0.30,  // w2: Rule match weight
  W_DOC: 0.20,   // w3: Document corroboration weight
} as const;

/** Threshold for auto-commit (bypass human review) */
export const AUTO_COMMIT_THRESHOLD = 0.95;

/** Amount threshold for high-risk classification */
export const HIGH_RISK_AMOUNT = 250;

/** Transaction routing decisions */
export type TriageDecision =
  | 'auto_commit'       // C_s >= 0.95 → silent background commit
  | 'escrow_suspense'   // C_s < 0.95 AND amount < $250 → weekly digest
  | 'freeze_review';    // C_s < 0.95 AND amount >= $250 → immediate notification

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  /** Raw LLM confidence (0.0-1.0) */
  pLlm: number;
  /** Rule match score (0.0, 0.5, or 1.0) */
  sRule: number;
  /** Document corroboration (0.0 or 1.0) */
  mDoc: number;
  /** Composite score: weighted sum */
  compositeScore: number;
  /** Human-readable explanation */
  reasoning: string;
}

export interface TriageResult {
  decision: TriageDecision;
  confidence: ConfidenceBreakdown;
  /** Target transaction status based on triage */
  targetStatus: 'auto_categorized' | 'escrow_suspense' | 'human_review';
  /** Communication channel (null = silent) */
  notificationChannel: 'none' | 'weekly_digest' | 'immediate_card';
}

export type RuleMatchType = 'exact_match' | 'pattern' | 'mcc' | 'none';

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Calculate the rule match score (S_rule).
 *
 * - exact_match: 1.0 (perfect deterministic match)
 * - pattern: 0.7 (regex/substring pattern matched)
 * - mcc: 0.5 (merchant category code matched)
 * - none: 0.0 (no rule applied)
 */
export function calculateRuleScore(matchType: RuleMatchType): number {
  switch (matchType) {
    case 'exact_match': return 1.0;
    case 'pattern': return 0.7;
    case 'mcc': return 0.5;
    case 'none': return 0.0;
  }
}

/**
 * Calculate the document corroboration score (M_doc).
 *
 * 1.0 if a matching receipt, invoice, or document exists
 * 0.0 if no supporting documentation found
 */
export function calculateDocScore(hasMatchingDocument: boolean): number {
  return hasMatchingDocument ? 1.0 : 0.0;
}

/**
 * Compute the composite confidence score (C_s).
 *
 * C_s = (w1 × P_llm) + (w2 × S_rule) + (w3 × M_doc)
 *
 * Invariant: w1 + w2 + w3 = 1.0
 */
export function computeCompositeScore(
  pLlm: number,
  sRule: number,
  mDoc: number,
): ConfidenceBreakdown {
  // Clamp inputs to [0, 1]
  const clampedLlm = Math.max(0, Math.min(1, pLlm));
  const clampedRule = Math.max(0, Math.min(1, sRule));
  const clampedDoc = Math.max(0, Math.min(1, mDoc));

  const compositeScore = 
    (WEIGHTS.W_LLM * clampedLlm) +
    (WEIGHTS.W_RULE * clampedRule) +
    (WEIGHTS.W_DOC * clampedDoc);

  // Build reasoning string
  const parts: string[] = [];
  if (clampedLlm >= 0.9) parts.push('high LLM confidence');
  else if (clampedLlm >= 0.7) parts.push('moderate LLM confidence');
  else parts.push('low LLM confidence');

  if (clampedRule >= 0.9) parts.push('exact rule match');
  else if (clampedRule > 0) parts.push('partial rule match');
  else parts.push('no matching rule');

  if (clampedDoc > 0) parts.push('document corroborated');
  else parts.push('no supporting document');

  return {
    pLlm: clampedLlm,
    sRule: clampedRule,
    mDoc: clampedDoc,
    compositeScore: Math.round(compositeScore * 10000) / 10000,
    reasoning: `C_s=${compositeScore.toFixed(4)}: ${parts.join(', ')}`,
  };
}

/**
 * Determine triage routing based on composite score and transaction amount.
 *
 * Priority Triage Rules (PRD §4.2):
 * - C_s >= 0.95: Auto-commit silently
 * - C_s < 0.95 AND amount < $250: Escrow to suspense, weekly digest
 * - C_s < 0.95 AND amount >= $250: Freeze, immediate notification
 */
export function triageTransaction(
  pLlm: number,
  ruleMatchType: RuleMatchType,
  hasDocument: boolean,
  transactionAmount: number,
): TriageResult {
  const sRule = calculateRuleScore(ruleMatchType);
  const mDoc = calculateDocScore(hasDocument);
  const confidence = computeCompositeScore(pLlm, sRule, mDoc);
  const absAmount = Math.abs(transactionAmount);

  if (confidence.compositeScore >= AUTO_COMMIT_THRESHOLD) {
    return {
      decision: 'auto_commit',
      confidence,
      targetStatus: 'auto_categorized',
      notificationChannel: 'none',
    };
  }

  if (absAmount < HIGH_RISK_AMOUNT) {
    return {
      decision: 'escrow_suspense',
      confidence,
      targetStatus: 'escrow_suspense',
      notificationChannel: 'weekly_digest',
    };
  }

  return {
    decision: 'freeze_review',
    confidence,
    targetStatus: 'human_review',
    notificationChannel: 'immediate_card',
  };
}
