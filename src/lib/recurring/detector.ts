// ─── Recurring Transaction Detector ─────────────────────────────────────────
// Detects recurring payment patterns from transaction history by analyzing
// merchant groupings, payment intervals, and frequency consistency.

// ─── Types ──────────────────────────────────────────────────────────────────

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';

export interface RecurringPattern {
  merchantName: string;
  averageAmount: number;
  frequency: RecurringFrequency;
  confidence: number; // 0-100
  lastOccurrence: string; // ISO date
  nextExpected: string; // ISO date
  occurrenceCount: number;
  transactionIds: string[];
}

export interface TransactionInput {
  id: string;
  merchant_name: string;
  amount: number;
  date: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MINIMUM_OCCURRENCES = 3;
const MINIMUM_CONFIDENCE = 60;

/** Frequency classification ranges (in days): [min, max, expectedInterval] */
const FREQUENCY_RANGES: Array<{ min: number; max: number; frequency: RecurringFrequency; expected: number }> = [
  { min: 5, max: 9, frequency: 'weekly', expected: 7 },
  { min: 12, max: 18, frequency: 'biweekly', expected: 14 },
  { min: 25, max: 35, frequency: 'monthly', expected: 30 },
  { min: 80, max: 100, frequency: 'quarterly', expected: 90 },
  { min: 340, max: 400, frequency: 'annual', expected: 365 },
];

// ─── Merchant Name Normalization ────────────────────────────────────────────

/**
 * Normalizes a merchant name for grouping:
 * - Lowercases the name
 * - Trims whitespace
 * - Removes trailing numbers, IDs, and hash/reference codes
 * - Collapses multiple spaces
 */
export function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove trailing numeric IDs, hashes, and reference codes
    // e.g., "Netflix #12345" → "Netflix", "Spotify 987" → "Spotify"
    .replace(/[\s]*[#]?\d{2,}[\s]*$/g, '')
    // Remove trailing single-char suffixes like "- A", "- B"
    .replace(/[\s]*-[\s]*[a-z0-9]$/gi, '')
    // Collapse multiple spaces into one
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Interval Analysis ──────────────────────────────────────────────────────

/** Calculates intervals in days between consecutive sorted dates. */
function calculateIntervals(dates: Date[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffMs = dates[i].getTime() - dates[i - 1].getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    intervals.push(diffDays);
  }
  return intervals;
}

/** Calculates the arithmetic mean of an array of numbers. */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Calculates the standard deviation of an array of numbers. */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Classifies the frequency based on the average interval in days.
 * Returns null if the average doesn't fit any known frequency range.
 */
function classifyFrequency(avgInterval: number): { frequency: RecurringFrequency; expected: number } | null {
  for (const range of FREQUENCY_RANGES) {
    if (avgInterval >= range.min && avgInterval <= range.max) {
      return { frequency: range.frequency, expected: range.expected };
    }
  }
  return null;
}

/**
 * Calculates confidence (0-100) based on interval consistency.
 *
 * Uses the coefficient of variation (CV = stdDev / mean) as the primary metric.
 * Lower CV means more consistent intervals → higher confidence.
 *
 * - CV = 0 (perfect consistency) → confidence = 100
 * - CV >= 0.5 (highly erratic) → confidence ≈ 0
 *
 * Additionally penalizes if mean interval is far from expected frequency interval.
 */
function calculateConfidence(intervals: number[], expectedInterval: number): number {
  if (intervals.length === 0) return 0;

  const avg = mean(intervals);
  const stdDev = standardDeviation(intervals);

  // Base confidence from consistency (CV-based)
  // CV of 0 → 100, CV of 0.5+ → ≤ 0
  const cv = avg > 0 ? stdDev / avg : 1;
  let confidence = Math.max(0, 100 * (1 - 2 * cv));

  // Penalty for deviation from expected interval center
  const deviationFromExpected = Math.abs(avg - expectedInterval) / expectedInterval;
  const deviationPenalty = Math.min(20, deviationFromExpected * 40);
  confidence = Math.max(0, confidence - deviationPenalty);

  return Math.round(confidence);
}

/** Adds a number of days to a Date and returns an ISO date string (YYYY-MM-DD). */
function addDays(date: Date, days: number): string {
  const result = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return result.toISOString().split('T')[0];
}

/** Formats a Date as an ISO date string (YYYY-MM-DD). */
function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ─── Main Detector ──────────────────────────────────────────────────────────

/**
 * Detects recurring transaction patterns from a list of transactions.
 *
 * Algorithm:
 * 1. Group transactions by normalized merchant name
 * 2. For each group with 3+ transactions:
 *    a. Sort by date ascending
 *    b. Calculate intervals between consecutive transactions
 *    c. Classify frequency (weekly/biweekly/monthly/quarterly/annual)
 *    d. Compute confidence based on interval consistency
 *    e. Predict next expected date
 * 3. Filter to patterns with confidence >= 60
 * 4. Sort by confidence descending
 */
export function detectRecurringPatterns(
  transactions: TransactionInput[]
): RecurringPattern[] {
  if (transactions.length === 0) return [];

  // Step 1: Group by normalized merchant name
  const groups = new Map<string, TransactionInput[]>();

  for (const txn of transactions) {
    if (!txn.merchant_name) continue;
    const normalized = normalizeMerchantName(txn.merchant_name);
    if (!normalized) continue;

    const group = groups.get(normalized);
    if (group) {
      group.push(txn);
    } else {
      groups.set(normalized, [txn]);
    }
  }

  const patterns: RecurringPattern[] = [];

  // Step 2: Analyze each merchant group
  for (const [merchantName, txns] of groups) {
    // Require minimum occurrences
    if (txns.length < MINIMUM_OCCURRENCES) continue;

    // Sort by date ascending
    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const dates = txns.map((t) => new Date(t.date));
    const intervals = calculateIntervals(dates);

    // Skip if all transactions are on the same date (intervals are all 0)
    if (intervals.length > 0 && intervals.every((i) => i === 0)) continue;

    // Calculate average interval
    const avgInterval = mean(intervals);

    // Classify frequency
    const classification = classifyFrequency(avgInterval);
    if (!classification) continue;

    // Calculate confidence
    const confidence = calculateConfidence(intervals, classification.expected);
    if (confidence < MINIMUM_CONFIDENCE) continue;

    // Calculate average amount
    const avgAmount = Math.round(mean(txns.map((t) => Math.abs(t.amount))) * 100) / 100;

    // Last occurrence and next expected
    const lastDate = dates[dates.length - 1];
    const nextExpected = addDays(lastDate, classification.expected);

    patterns.push({
      merchantName,
      averageAmount: avgAmount,
      frequency: classification.frequency,
      confidence,
      lastOccurrence: toISODate(lastDate),
      nextExpected,
      occurrenceCount: txns.length,
      transactionIds: txns.map((t) => t.id),
    });
  }

  // Step 4: Sort by confidence descending
  patterns.sort((a, b) => b.confidence - a.confidence);

  return patterns;
}
