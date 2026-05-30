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

// Common fee patterns — map variance ranges to GL codes
const FEE_PATTERNS: Array<{
  maxVariance: number;
  glCode: string;
  glName: string;
  description: string;
}> = [
  {
    maxVariance: 0.50,
    glCode: '6180',
    glName: 'Bank Fees & Charges',
    description: 'Rounding/micro-fee adjustment',
  },
  {
    maxVariance: 5.00,
    glCode: '6180',
    glName: 'Bank Fees & Charges',
    description: 'Card processing fee',
  },
  {
    maxVariance: 15.00,
    glCode: '6180',
    glName: 'Bank Fees & Charges',
    description: 'ACH/wire transfer fee',
  },
  {
    maxVariance: 50.00,
    glCode: '6180',
    glName: 'Bank Fees & Charges',
    description: 'International processing fee',
  },
  {
    maxVariance: 100.00,
    glCode: '6180',
    glName: 'Bank Fees & Charges',
    description: 'Currency conversion fee',
  },
];

// Stripe fee pattern: 2.9% + $0.30
const STRIPE_FEE_RATE = 0.029;
const STRIPE_FEE_FIXED = 0.30;

/**
 * Analyzes a variance between bank amount and expected amount.
 * Returns the appropriate GL code and whether it's a known fee pattern.
 */
export function analyzeVariance(
  bankAmount: number,
  expectedAmount: number,
  merchantName: string
): {
  isKnownFee: boolean;
  glCode: string;
  glName: string;
  description: string;
} {
  const variance = Math.abs(bankAmount - expectedAmount);
  const merchantLower = (merchantName || '').toLowerCase();

  // Check if variance matches a Stripe fee pattern
  const expectedStripeFee = Math.abs(expectedAmount) * STRIPE_FEE_RATE + STRIPE_FEE_FIXED;
  if (
    merchantLower.includes('stripe') &&
    Math.abs(variance - expectedStripeFee) < 0.02 // within 2 cents
  ) {
    return {
      isKnownFee: true,
      glCode: '6180',
      glName: 'Bank Fees & Charges',
      description: `Stripe processing fee (2.9% + $0.30)`,
    };
  }

  // Check against fee pattern thresholds
  for (const pattern of FEE_PATTERNS) {
    if (variance <= pattern.maxVariance) {
      return {
        isKnownFee: true,
        glCode: pattern.glCode,
        glName: pattern.glName,
        description: pattern.description,
      };
    }
  }

  // Variance too large — not a known fee, needs manual review
  return {
    isKnownFee: false,
    glCode: '2900', // Route to suspense
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
  input: ReconciliationInput
): Promise<ReconciliationResult> {
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
    input.merchantName
  );

  // Create the adjusting journal entry
  const { data: journalEntry, error: jeError } = await supabase
    .from('journal_entries')
    .insert({
      entity_id: input.entityId,
      transaction_id: input.transactionId,
      entry_date: input.date,
      memo: `Auto-reconciliation: ${analysis.description} for ${input.merchantName} ($${absVariance.toFixed(2)})`,
      status: analysis.isKnownFee ? 'posted' : 'draft',
      posted_at: analysis.isKnownFee ? new Date().toISOString() : null,
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

  await supabase.from('journal_lines').insert([
    {
      journal_entry_id: journalEntry.id,
      gl_code: analysis.glCode,
      debit: feeIsDebit ? absVariance : 0,
      credit: feeIsDebit ? 0 : absVariance,
      description: analysis.description,
    },
    {
      journal_entry_id: journalEntry.id,
      gl_code: '1010', // Cash & Bank
      debit: feeIsDebit ? 0 : absVariance,
      credit: feeIsDebit ? absVariance : 0,
      description: `Offset for ${analysis.description}`,
    },
  ]);

  // Log to audit
  await writeAuditLog({
    supabase,
    entityId: input.entityId,
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
      auto_posted: analysis.isKnownFee,
    },
  });

  return {
    matched: analysis.isKnownFee,
    variance: absVariance,
    varianceGlCode: analysis.glCode,
    varianceGlName: analysis.glName,
    journalEntryId: journalEntry.id,
    reasoning: analysis.isKnownFee
      ? `Auto-reconciled: ${analysis.description}. Adjusting entry posted.`
      : `Variance of $${absVariance.toFixed(2)} routed to ${analysis.glName} for manual review.`,
  };
}
