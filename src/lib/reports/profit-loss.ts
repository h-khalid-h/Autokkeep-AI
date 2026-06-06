// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Profit & Loss Statement Generator Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Generates a structured P&L report from approved/synced transactions and
// the chart of accounts. Uses integer-cents arithmetic to avoid floating-point
// rounding issues common in financial calculations.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── Public Interfaces ─────────────────────────────────────────────────────────

export interface PnLLineItem {
  code: string;
  name: string;
  amount: number; // positive for revenue, positive for expenses
  type: 'revenue' | 'expense';
  children?: PnLLineItem[];
}

export interface ProfitAndLossReport {
  entityName: string;
  entityCurrency: string;
  periodStart: string; // ISO date
  periodEnd: string;
  generatedAt: string;
  revenue: PnLLineItem[];
  totalRevenue: number;
  expenses: PnLLineItem[];
  totalExpenses: number;
  netIncome: number;
  comparisonPeriod?: {
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
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

/**
 * Computes the previous period dates of equal length given start and end.
 */
function computePreviousPeriod(
  periodStart: string,
  periodEnd: string
): { prevStart: string; prevEnd: string } {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const durationMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 1); // day before current start
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  };
}

/**
 * Fetches transactions and CoA, then aggregates into line items.
 * Returns { revenueItems, expenseItems, totalRevenueCents, totalExpensesCents }.
 */
async function aggregatePeriod(
  db: SupabaseQueryClient,
  entityId: string,
  periodStart: string,
  periodEnd: string,
  coaMap: Map<string, CoARow>
): Promise<{
  revenueItems: PnLLineItem[];
  expenseItems: PnLLineItem[];
  totalRevenueCents: number;
  totalExpensesCents: number;
}> {
  // Fetch approved/synced transactions in the date range
  const { data: transactions, error: txError } = await db
    .from('transactions')
    .select('amount, category_human, category_ai')
    .eq('entity_id', entityId)
    .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.SYNCED])
    .gte('date', periodStart)
    .lte('date', periodEnd)
    .is('deleted_at', null);

  if (txError) {
    throw new Error(`Failed to query transactions: ${txError.message}`);
  }

  const rows = (transactions || []) as TransactionRow[];

  // Group by GL code using integer cents
  const glTotals = new Map<string, number>(); // code → cents (raw signed)

  for (const tx of rows) {
    const glCode = tx.category_human || tx.category_ai;
    if (!glCode) continue;

    const cents = toCents(tx.amount);
    glTotals.set(glCode, (glTotals.get(glCode) || 0) + cents);
  }

  // Classify each GL code as revenue or expense
  const revenueItems: PnLLineItem[] = [];
  const expenseItems: PnLLineItem[] = [];
  let totalRevenueCents = 0;
  let totalExpensesCents = 0;

  // Sort by GL code for consistent ordering
  const sortedCodes = [...glTotals.keys()].sort();

  for (const code of sortedCodes) {
    const rawCents = glTotals.get(code)!;
    const coa = coaMap.get(code);

    if (!coa) continue; // Skip codes not in the chart of accounts

    if (coa.type === 'revenue') {
      // Revenue: negative amounts (credits) → show as positive
      const amount = fromCents(Math.abs(rawCents));
      revenueItems.push({
        code,
        name: coa.name,
        amount,
        type: 'revenue',
      });
      totalRevenueCents += Math.abs(rawCents);
    } else if (coa.type === 'expense') {
      // Expenses: positive amounts (debits) → show as positive
      const amount = fromCents(Math.abs(rawCents));
      expenseItems.push({
        code,
        name: coa.name,
        amount,
        type: 'expense',
      });
      totalExpensesCents += Math.abs(rawCents);
    }
    // Skip asset, liability, equity — not part of P&L
  }

  return { revenueItems, expenseItems, totalRevenueCents, totalExpensesCents };
}

// ─── Main Generator ────────────────────────────────────────────────────────────

export async function generateProfitAndLoss(
  db: SupabaseQueryClient,
  entityId: string,
  periodStart: string,
  periodEnd: string,
  options?: { comparePrevious?: boolean }
): Promise<ProfitAndLossReport> {
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

  // 3. Aggregate current period
  const current = await aggregatePeriod(db, entityId, periodStart, periodEnd, coaMap);

  const report: ProfitAndLossReport = {
    entityName: entityData.name,
    entityCurrency: entityData.base_currency,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    revenue: current.revenueItems,
    totalRevenue: fromCents(current.totalRevenueCents),
    expenses: current.expenseItems,
    totalExpenses: fromCents(current.totalExpensesCents),
    netIncome: fromCents(current.totalRevenueCents - current.totalExpensesCents),
  };

  // 4. Optionally compute comparison period
  if (options?.comparePrevious) {
    const { prevStart, prevEnd } = computePreviousPeriod(periodStart, periodEnd);
    const prev = await aggregatePeriod(db, entityId, prevStart, prevEnd, coaMap);

    report.comparisonPeriod = {
      periodStart: prevStart,
      periodEnd: prevEnd,
      totalRevenue: fromCents(prev.totalRevenueCents),
      totalExpenses: fromCents(prev.totalExpensesCents),
      netIncome: fromCents(prev.totalRevenueCents - prev.totalExpensesCents),
    };
  }

  return report;
}
