// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Duplicate Transaction Detector
// Identifies potential duplicate transactions based on amount, date proximity,
// and merchant name similarity.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TransactionRecord {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string; // ISO date string (YYYY-MM-DD)
  bank_account_id?: string | null;
  plaid_transaction_id?: string | null;
}

export interface DuplicateGroup {
  /** All transaction IDs in this duplicate group */
  transactionIds: string[];
  /** Confidence that these are true duplicates (0-100) */
  confidence: number;
  /** Reason for the duplicate flag */
  reason: string;
  /** The shared merchant name */
  merchantName: string;
  /** The shared amount */
  amount: number;
  /** Date range of the group */
  dateRange: { earliest: string; latest: string };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Normalize merchant name for comparison.
 * Strips whitespace, lowercases, removes common suffixes.
 */
export function normalizeMerchant(name: string | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    // Remove trailing reference numbers (e.g., "AMAZON #1234")
    .replace(/\s*[#*]\s*\d+\s*$/g, '')
    // Remove trailing transaction IDs (e.g., "UBER TRIP ABCDEF")
    .replace(/\s+[a-f0-9]{6,}$/gi, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate the absolute difference in days between two ISO date strings.
 */
export function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 86_400_000;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(Math.round((a - b) / msPerDay));
}

/**
 * Simple string similarity (Dice coefficient on bigrams).
 * Returns 0-1 where 1 = identical.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      set.add(s.slice(i, i + 2));
    }
    return set;
  };

  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

// ─── Core Detection ─────────────────────────────────────────────────────────────

/** Maximum days apart for two transactions to be considered duplicates */
const MAX_DATE_GAP_DAYS = 3;

/** Minimum string similarity for merchant names to match */
const MIN_MERCHANT_SIMILARITY = 0.7;

/** Minimum confidence to report a duplicate group */
const MIN_CONFIDENCE = 50;

/**
 * Detect potential duplicate transactions.
 *
 * A duplicate is identified when:
 * 1. Same normalized merchant name (or high similarity)
 * 2. Same amount (exact match)
 * 3. Within 3 days of each other
 * 4. Optionally from different bank accounts (cross-bank duplicates)
 *
 * Plaid-deduplicated transactions (same plaid_transaction_id) are skipped.
 */
export function detectDuplicates(
  transactions: TransactionRecord[]
): DuplicateGroup[] {
  if (transactions.length < 2) return [];

  // Pre-compute normalized merchants
  const normalized = transactions.map((tx) => ({
    ...tx,
    normalizedMerchant: normalizeMerchant(tx.merchant_name),
  }));

  // Sort by amount then date for efficient grouping
  normalized.sort((a, b) => a.amount - b.amount || a.date.localeCompare(b.date));

  const duplicateGroups: DuplicateGroup[] = [];
  const assigned = new Set<string>(); // Track which tx IDs are already in a group

  for (let i = 0; i < normalized.length; i++) {
    if (assigned.has(normalized[i].id)) continue;

    const anchor = normalized[i];
    const group: typeof normalized = [anchor];

    for (let j = i + 1; j < normalized.length; j++) {
      if (assigned.has(normalized[j].id)) continue;

      const candidate = normalized[j];

      // Fast exit: amounts must match exactly
      if (candidate.amount !== anchor.amount) {
        // Since sorted by amount, once we pass the matching amount, stop
        if (candidate.amount > anchor.amount) break;
        continue;
      }

      // Skip if same Plaid transaction ID (already deduplicated by Plaid)
      if (
        anchor.plaid_transaction_id &&
        candidate.plaid_transaction_id &&
        anchor.plaid_transaction_id === candidate.plaid_transaction_id
      ) {
        continue;
      }

      // Check date proximity
      const gap = daysBetween(anchor.date, candidate.date);
      if (gap > MAX_DATE_GAP_DAYS) continue;

      // Check merchant similarity
      const similarity = anchor.normalizedMerchant && candidate.normalizedMerchant
        ? stringSimilarity(anchor.normalizedMerchant, candidate.normalizedMerchant)
        : 0;

      if (similarity < MIN_MERCHANT_SIMILARITY) continue;

      group.push(candidate);
    }

    if (group.length >= 2) {
      // Calculate confidence
      let confidence = 60; // Base confidence for same amount + similar merchant + close date

      // Boost for exact merchant match
      const allSameMerchant = group.every(
        (tx) => tx.normalizedMerchant === anchor.normalizedMerchant
      );
      if (allSameMerchant) confidence += 15;

      // Boost for same-day transactions
      const allSameDay = group.every((tx) => tx.date === anchor.date);
      if (allSameDay) confidence += 10;

      // Boost for cross-bank duplicates (different bank accounts, very likely duplicate)
      const uniqueBanks = new Set(group.map((tx) => tx.bank_account_id).filter(Boolean));
      if (uniqueBanks.size > 1) confidence += 15;

      // Cap at 100
      confidence = Math.min(100, confidence);

      if (confidence >= MIN_CONFIDENCE) {
        const dates = group.map((tx) => tx.date).sort();
        const reason = buildReason(group, allSameMerchant, allSameDay, uniqueBanks.size > 1);

        duplicateGroups.push({
          transactionIds: group.map((tx) => tx.id),
          confidence,
          reason,
          merchantName: anchor.merchant_name || anchor.normalizedMerchant,
          amount: anchor.amount,
          dateRange: {
            earliest: dates[0],
            latest: dates[dates.length - 1],
          },
        });

        // Mark all group members as assigned
        for (const tx of group) {
          assigned.add(tx.id);
        }
      }
    }
  }

  // Sort by confidence descending
  return duplicateGroups.sort((a, b) => b.confidence - a.confidence);
}

function buildReason(
  group: TransactionRecord[],
  exactMerchant: boolean,
  sameDay: boolean,
  crossBank: boolean
): string {
  const parts: string[] = [];

  parts.push(`${group.length} transactions with identical amount`);

  if (exactMerchant) {
    parts.push('same merchant');
  } else {
    parts.push('similar merchant names');
  }

  if (sameDay) {
    parts.push('on the same date');
  } else {
    parts.push('within 3 days');
  }

  if (crossBank) {
    parts.push('across different bank accounts');
  }

  return parts.join(', ') + '.';
}
