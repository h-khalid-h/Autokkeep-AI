// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Balance Sheet Generator Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Generates a structured Balance Sheet report from approved/synced transactions
// and the chart of accounts. Uses integer-cents arithmetic to avoid
// floating-point rounding issues common in financial calculations.
//
// The accounting equation: Assets = Liabilities + Equity + Retained Earnings

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── Public Interfaces ─────────────────────────────────────────────────────────

export interface BalanceSheetLineItem {
  code: string;
  name: string;
  amount: number;
  type: 'asset' | 'liability' | 'equity';
  children?: BalanceSheetLineItem[];
}

export interface BalanceSheetReport {
  entityName: string;
  entityCurrency: string;
  asOfDate: string; // ISO date
  generatedAt: string;
  assets: BalanceSheetLineItem[];
  totalAssets: number;
  liabilities: BalanceSheetLineItem[];
  totalLiabilities: number;
  equity: BalanceSheetLineItem[];
  totalEquity: number;
  // assets = liabilities + equity + retainedEarnings (accounting equation)
  isBalanced: boolean;
  retainedEarnings: number; // computed from revenue - expenses
}

// ─── Internal Types ────────────────────────────────────────────────────────────

interface TransactionRow {
  amount: number;
  category_human: string | null;
  category_ai: string | null;
}

interface CoARow {
  code: string;
  name: string;
  type: string; // 'revenue' | 'expense' | 'asset' | 'liability' | 'equity'
  parent_id: string | null;
}

interface EntityRow {
  name: string;
  base_currency: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts a floating-point dollar amount to integer cents safely.
 */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Converts integer cents back to a dollar amount with 2 decimal places.
 */
function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

// ─── Main Generator ────────────────────────────────────────────────────────────

export async function generateBalanceSheet(
  db: SupabaseQueryClient,
  entityId: string,
  asOfDate: string,
): Promise<BalanceSheetReport> {
  // 1. Fetch entity info
  const { data: entity, error: entityError } = await db
    .from('entities')
    .select('name, base_currency')
    .eq('id', entityId)
    .single();

  if (entityError || !entity) {
    throw new Error('Entity not found');
  }

  const entityData = entity as EntityRow;

  // 2. Fetch chart of accounts for this entity (active only)
  const { data: coaRows, error: coaError } = await db
    .from('chart_of_accounts')
    .select('code, name, type, parent_id')
    .eq('entity_id', entityId)
    .eq('is_active', true);

  if (coaError) {
    throw new Error(`Failed to query chart of accounts: ${coaError.message}`);
  }

  const coaMap = new Map<string, CoARow>();
  for (const row of (coaRows || []) as CoARow[]) {
    coaMap.set(row.code, row);
  }

  // 3. Fetch ALL approved/synced transactions up to asOfDate
  const { data: transactions, error: txError } = await db
    .from('transactions')
    .select('amount, category_human, category_ai')
    .eq('entity_id', entityId)
    .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.SYNCED])
    .lte('date', asOfDate)
    .is('deleted_at', null);

  if (txError) {
    throw new Error(`Failed to query transactions: ${txError.message}`);
  }

  const rows = (transactions || []) as TransactionRow[];

  // 4. Group by GL code using integer cents
  const glTotals = new Map<string, number>(); // code → cents (raw signed)

  for (const tx of rows) {
    const glCode = tx.category_human || tx.category_ai;
    if (!glCode) continue;

    const cents = toCents(tx.amount);
    glTotals.set(glCode, (glTotals.get(glCode) || 0) + cents);
  }

  // 5. Classify each GL code based on CoA type
  const assets: BalanceSheetLineItem[] = [];
  const liabilities: BalanceSheetLineItem[] = [];
  const equity: BalanceSheetLineItem[] = [];
  let totalAssetsCents = 0;
  let totalLiabilitiesCents = 0;
  let totalEquityCents = 0;
  let totalRevenueCents = 0;
  let totalExpensesCents = 0;

  // Sort by GL code for consistent ordering
  const sortedCodes = [...glTotals.keys()].sort();

  for (const code of sortedCodes) {
    const rawCents = glTotals.get(code)!;
    const coa = coaMap.get(code);

    if (!coa) continue; // Skip codes not in the chart of accounts

    switch (coa.type) {
      case 'asset': {
        // Assets: debit-normal → positive amounts increase assets
        const amount = fromCents(rawCents);
        assets.push({
          code,
          name: coa.name,
          amount,
          type: 'asset',
        });
        totalAssetsCents += rawCents;
        break;
      }
      case 'liability': {
        // Liabilities: credit-normal → negative amounts (credits) increase liabilities
        // Display as positive for the report
        const amount = fromCents(Math.abs(rawCents));
        liabilities.push({
          code,
          name: coa.name,
          amount,
          type: 'liability',
        });
        totalLiabilitiesCents += Math.abs(rawCents);
        break;
      }
      case 'equity': {
        // Equity: credit-normal → negative amounts (credits) increase equity
        // Display as positive for the report
        const amount = fromCents(Math.abs(rawCents));
        equity.push({
          code,
          name: coa.name,
          amount,
          type: 'equity',
        });
        totalEquityCents += Math.abs(rawCents);
        break;
      }
      case 'revenue': {
        // Revenue contributes to retained earnings
        // Revenue: credit-normal → negative amounts = revenue
        totalRevenueCents += Math.abs(rawCents);
        break;
      }
      case 'expense': {
        // Expenses reduce retained earnings
        // Expenses: debit-normal → positive amounts = expenses
        totalExpensesCents += Math.abs(rawCents);
        break;
      }
    }
  }

  // 6. Compute retained earnings = total revenue - total expenses
  const retainedEarningsCents = totalRevenueCents - totalExpensesCents;

  // 7. Check accounting equation: Assets = Liabilities + Equity + Retained Earnings
  // Allow within 1 cent tolerance for rounding
  const lhsCents = totalAssetsCents;
  const rhsCents = totalLiabilitiesCents + totalEquityCents + retainedEarningsCents;
  const isBalanced = Math.abs(lhsCents - rhsCents) <= 1;

  return {
    entityName: entityData.name,
    entityCurrency: entityData.base_currency,
    asOfDate,
    generatedAt: new Date().toISOString(),
    assets,
    totalAssets: fromCents(totalAssetsCents),
    liabilities,
    totalLiabilities: fromCents(totalLiabilitiesCents),
    equity,
    totalEquity: fromCents(totalEquityCents),
    isBalanced,
    retainedEarnings: fromCents(retainedEarningsCents),
  };
}
