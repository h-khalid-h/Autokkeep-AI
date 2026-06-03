// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Receipt-to-Transaction Matcher
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import type { ExtractedReceiptData } from './extractor';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MatchResult {
  transactionId: string;
  confidence: number;
}

interface TransactionRecord {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
}

// ─── Configuration ─────────────────────────────────────────────────────────────

/** How many days back to search for matching transactions. Configurable via env var. */
const OCR_LOOKBACK_DAYS = parseInt(process.env.OCR_LOOKBACK_DAYS || '30', 10);

// ─── Scoring Weights ───────────────────────────────────────────────────────────

const VENDOR_WEIGHT = 0.40;
const AMOUNT_WEIGHT = 0.35;
const DATE_WEIGHT = 0.25;
const MIN_CONFIDENCE_THRESHOLD = 0.6;

// ─── Similarity Helpers ────────────────────────────────────────────────────────

/**
 * Computes a normalized Levenshtein-based similarity score between two strings.
 * Returns a value between 0 (no match) and 1 (exact match).
 */
function vendorSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Check substring containment for partial matches
  if (s1.includes(s2) || s2.includes(s1)) {
    const shorter = Math.min(s1.length, s2.length);
    const longer = Math.max(s1.length, s2.length);
    return shorter / longer;
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost  // substitution
      );
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * Computes an amount match score.
 * Returns 1.0 for exact match, decreasing as the difference grows.
 */
function amountScore(receiptAmount: number, transactionAmount: number): number {
  if (receiptAmount === transactionAmount) return 1;

  const absReceipt = Math.abs(receiptAmount);
  const absTransaction = Math.abs(transactionAmount);

  if (absReceipt === 0 && absTransaction === 0) return 1;

  const diff = Math.abs(absReceipt - absTransaction);
  const maxVal = Math.max(absReceipt, absTransaction);

  // Allow up to 5% tolerance for rounding differences
  const percentDiff = diff / maxVal;
  if (percentDiff <= 0.05) return 1.0 - percentDiff;

  // Beyond 5%, score drops off rapidly
  return Math.max(0, 1 - percentDiff * 2);
}

/**
 * Computes a date proximity score.
 * Returns 1.0 for same-day match, decreasing over 7 days to 0.
 */
function dateProximityScore(receiptDate: string, transactionDate: string): number {
  const d1 = new Date(receiptDate);
  const d2 = new Date(transactionDate);

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;

  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 0) return 1;
  if (diffDays >= 7) return 0;

  // Linear decay over 7 days
  return 1 - diffDays / 7;
}

// ─── Main Matcher ──────────────────────────────────────────────────────────────

/**
 * Finds the best matching transaction for extracted receipt data.
 * Queries recent transactions (last 30 days) for the entity and scores each
 * using a weighted combination of vendor similarity, amount match, and date proximity.
 *
 * @param db - Supabase query client
 * @param entityId - The entity to search transactions for
 * @param extractedData - Extracted receipt data from OCR
 * @returns Match result with transaction ID and confidence, or null if no match above threshold
 */
export async function matchReceiptToTransaction(
  db: SupabaseQueryClient,
  entityId: string,
  extractedData: ExtractedReceiptData
): Promise<MatchResult | null> {
  // Query recent transactions within the configurable lookback window
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - OCR_LOOKBACK_DAYS);
  const cutoffDate = lookbackDate.toISOString().split('T')[0];

  const { data: transactions, error } = await db
    .from('transactions')
    .select('id, merchant_name, amount, date')
    .eq('entity_id', entityId)
    .gte('date', cutoffDate)
    .order('date', { ascending: false });

  if (error) {
    console.error('[OCR Matcher] Failed to query transactions:', error);
    return null;
  }

  if (!transactions || transactions.length === 0) {
    return null;
  }

  let bestMatch: MatchResult | null = null;

  for (const txn of transactions as TransactionRecord[]) {
    const vendorScore = vendorSimilarity(
      extractedData.vendor,
      txn.merchant_name || ''
    );
    const amtScore = amountScore(extractedData.amount, txn.amount);
    const dateScore = dateProximityScore(extractedData.date, txn.date);

    const totalScore =
      vendorScore * VENDOR_WEIGHT +
      amtScore * AMOUNT_WEIGHT +
      dateScore * DATE_WEIGHT;

    if (totalScore > MIN_CONFIDENCE_THRESHOLD) {
      if (!bestMatch || totalScore > bestMatch.confidence) {
        bestMatch = {
          transactionId: txn.id,
          confidence: totalScore,
        };
      }
    }
  }

  return bestMatch;
}
