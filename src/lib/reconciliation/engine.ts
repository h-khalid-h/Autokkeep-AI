// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Self-Healing Reconciliation Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// When a bank transaction amount doesn't match a linked invoice/payment
// due to processing fees (wire fees, international card fees, Stripe fees),
// this engine isolates the variance and creates a balancing adjusting entry
// to "Bank Fees & Charges" (GL 6180).

import { writeAuditLog } from '@/lib/audit';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { getGLCode } from '@/lib/entity-settings';

// ─── F21: Entity-Configurable GL Codes ─────────────────────────────────────

/**
 * Reads reconciliation GL codes from `entity_settings`, falling back to
 * hardcoded defaults when no overrides exist.
 *
 * Setting keys:
 *  - `bank_fees_gl`  → default '6180'
 *  - `suspense_gl`   → default '2900'
 *  - `cash_gl`       → default '1010'
 */
export async function getEntityGLConfig(
  db: SupabaseQueryClient,
  entityId: string
): Promise<Required<GLCodeOverrides>> {
  const [bankFeesGL, suspenseGL, cashGL] = await Promise.all([
    getGLCode(db, entityId, 'bank_fees_gl'),
    getGLCode(db, entityId, 'suspense_gl'),
    getGLCode(db, entityId, 'cash_gl'),
  ]);

  return { bankFeesGL, suspenseGL, cashGL };
}

/** Optional GL code overrides — callers can pass entity-specific codes */
export interface GLCodeOverrides {
  bankFeesGL?: string;   // Default: '6180'
  suspenseGL?: string;   // Default: '2900'
  cashGL?: string;       // Default: '1010'
}

export interface ReconciliationInput {
  transactionId: string;
  entityId: string;
  bankAmount: number;      // What the bank reported
  expectedAmount: number;  // What the invoice/payment was for
  merchantName: string;
  date: string;
}

export interface ReconciliationResult {
  matched: boolean;
  variance: number;
  varianceGlCode: string;
  varianceGlName: string;
  journalEntryId?: string;
  reasoning: string;
}

// Common fee patterns — map variance ranges to GL codes.
// The actual GL code used is determined at runtime via glOverrides.
const FEE_PATTERNS: Array<{
  maxVariance: number;
  glName: string;
  description: string;
}> = [
  {
    maxVariance: 0.50,
    glName: 'Bank Fees & Charges',
    description: 'Rounding/micro-fee adjustment',
  },
  {
    maxVariance: 5.00,
    glName: 'Bank Fees & Charges',
    description: 'Card processing fee',
  },
  {
    maxVariance: 15.00,
    glName: 'Bank Fees & Charges',
    description: 'ACH/wire transfer fee',
  },
  {
    maxVariance: 50.00,
    glName: 'Bank Fees & Charges',
    description: 'International processing fee',
  },
  {
    maxVariance: 100.00,
    glName: 'Bank Fees & Charges',
    description: 'Currency conversion fee',
  },
];

/**
 * Analyzes a variance between bank amount and expected amount.
 * Returns the appropriate GL code and whether it's a known fee pattern.
 */
export function analyzeVariance(
  bankAmount: number,
  expectedAmount: number,
  merchantName: string,
  gl: Required<GLCodeOverrides> = { bankFeesGL: '6180', suspenseGL: '2900', cashGL: '1010' }
): {
  isKnownFee: boolean;
  glCode: string;
  glName: string;
  description: string;
} {
  const variance = Math.abs(bankAmount - expectedAmount);

  // Check for Stripe-like fee pattern (2.9% + $0.30)
  const expectedStripeFee = Math.abs(expectedAmount) * 0.029 + 0.30;
  if (
    merchantName.toLowerCase().includes('stripe') &&
    Math.abs(variance - expectedStripeFee) < 0.02 // within 2 cents
  ) {
    return {
      isKnownFee: true,
      glCode: gl.bankFeesGL,
      glName: 'Bank Fees & Charges',
      description: `Stripe processing fee (2.9% + $0.30)`,
    };
  }

  // Check against fee pattern thresholds
  for (const pattern of FEE_PATTERNS) {
    if (variance <= pattern.maxVariance) {
      return {
        isKnownFee: true,
        glCode: gl.bankFeesGL,
        glName: pattern.glName,
        description: pattern.description,
      };
    }
  }

  // Variance too large — not a known fee, needs manual review
  return {
    isKnownFee: false,
    glCode: gl.suspenseGL,
    glName: 'Suspense/Clearing',
    description: `Unrecognized variance of $${variance.toFixed(2)} — requires manual review`,
  };
}

/**
 * Creates a self-healing adjusting journal entry for fee variances.
 * The supabase client must be an admin/service_role client.
 */
export async function createFeeAdjustingEntry(
  supabase: SupabaseQueryClient,
  input: ReconciliationInput,
  glOverrides?: GLCodeOverrides
): Promise<ReconciliationResult> {
  const gl: Required<GLCodeOverrides> = {
    bankFeesGL: glOverrides?.bankFeesGL ?? '6180',
    suspenseGL: glOverrides?.suspenseGL ?? '2900',
    cashGL: glOverrides?.cashGL ?? '1010',
  };
  const variance = input.bankAmount - input.expectedAmount;
  const absVariance = Math.abs(variance);

  // If no variance, nothing to reconcile
  if (absVariance < 0.01) {
    return {
      matched: true,
      variance: 0,
      varianceGlCode: '',
      varianceGlName: '',
      reasoning: 'Amounts match exactly — no adjustment needed.',
    };
  }

  const analysis = analyzeVariance(
    input.bankAmount,
    input.expectedAmount,
    input.merchantName,
    gl
  );

  // F9: Auto-post guard — only auto-post known fees ≤$10.
  // Larger known fees still get the correct GL code but require manual review
  // to prevent systematic drainage through manipulated bank feed data.
  const canAutoPost = analysis.isKnownFee && absVariance <= 10;

  // Create the adjusting journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      entity_id: input.entityId,
      transaction_id: input.transactionId,
      entry_date: input.date,
      memo: `Auto-reconciliation: ${analysis.description} for ${input.merchantName} ($${absVariance.toFixed(2)})${!canAutoPost && analysis.isKnownFee ? ' [pending review]' : ''}`,
      status: canAutoPost ? 'posted' : 'draft',
      posted_at: canAutoPost ? new Date().toISOString() : null,
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (jeError || !journalEntry) {
    return {
      matched: false,
      variance: absVariance,
      varianceGlCode: analysis.glCode,
      varianceGlName: analysis.glName,
      reasoning: `Failed to create adjusting entry: ${jeError?.message || 'Unknown error'}`,
    };
  }

  // Create balanced journal lines
  // If bank charged MORE than expected → debit Bank Fees, credit Cash
  // If bank charged LESS than expected → debit Cash, credit Bank Fees
  const feeIsDebit = variance < 0; // Bank took more than expected (fee deducted)

  const { error: linesError } = await supabase.from('journal_lines').insert([
    {
      journal_entry_id: journalEntry.id,
      gl_code: analysis.glCode,
      debit: feeIsDebit ? absVariance : 0,
      credit: feeIsDebit ? 0 : absVariance,
      description: analysis.description,
    },
    {
      journal_entry_id: journalEntry.id,
      gl_code: gl.cashGL, // Cash & Bank
      debit: feeIsDebit ? 0 : absVariance,
      credit: feeIsDebit ? absVariance : 0,
      description: `Offset for ${analysis.description}`,
    },
  ]);

  // Rollback orphaned journal entry if lines failed
  if (linesError) {
    console.error(`[Reconciliation] journal_lines insert failed, deleting orphaned entry ${journalEntry.id}:`, linesError.message);
    await supabase.from('journal_entries').delete().eq('id', journalEntry.id);
    return {
      matched: false,
      variance: absVariance,
      varianceGlCode: analysis.glCode,
      varianceGlName: analysis.glName,
      reasoning: `Failed to create journal lines: ${linesError.message}. Entry rolled back.`,
    };
  }

  // Log to audit
  await writeAuditLog({
    supabase,
    entityId: input.entityId,
    actorId: 'system',
    actorType: 'system',
    action: 'create',
    targetType: 'journal_entry',
    targetId: journalEntry.id,
    details: {
      action: 'self_healing_reconciliation',
      bank_amount: input.bankAmount,
      expected_amount: input.expectedAmount,
      variance: absVariance,
      fee_type: analysis.description,
      auto_posted: canAutoPost,
      requires_review: analysis.isKnownFee && !canAutoPost,
    },
  });

  return {
    matched: analysis.isKnownFee,
    variance: absVariance,
    varianceGlCode: analysis.glCode,
    varianceGlName: analysis.glName,
    journalEntryId: journalEntry.id,
    reasoning: canAutoPost
      ? `Auto-reconciled: ${analysis.description}. Adjusting entry posted.`
      : analysis.isKnownFee
        ? `Known fee (${analysis.description}) of $${absVariance.toFixed(2)} created as draft for review.`
        : `Variance of $${absVariance.toFixed(2)} routed to ${analysis.glName} for manual review.`,
  };
}
