// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — FX Gain / Loss Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Computes unrealized FX gains/losses for an entity by comparing the original
// exchange rate at transaction time vs. the current rate for each foreign-
// currency transaction.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { fxRateProvider } from './fx-rates';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── Public Interfaces ─────────────────────────────────────────────────────────

export interface FXGainLossItem {
  foreignCurrency: string;
  originalAmount: number;
  originalRate: number;
  currentRate: number;
  baseAmountAtOriginal: number;
  baseAmountAtCurrent: number;
  unrealizedGainLoss: number;
}

export interface FXGainLossResult {
  entityId: string;
  entityName: string;
  baseCurrency: string;
  asOfDate: string;
  items: FXGainLossItem[];
  totalUnrealizedGainLoss: number;
}

// ─── Internal Types ─────────────────────────────────────────────────────────────

interface ForeignTxRow {
  currency: string;
  amount: number;
  exchange_rate: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Rounds to 2 decimal places to avoid floating-point drift.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Main Calculator ────────────────────────────────────────────────────────────

/**
 * Calculate unrealized FX gains/losses for an entity.
 *
 * For every approved/synced transaction where the transaction currency
 * differs from the entity's base currency, we compute:
 *   - base amount at original rate  = amount × originalRate
 *   - base amount at current rate   = amount × currentRate
 *   - unrealized gain/loss          = currentBase − originalBase
 *
 * Positive = gain (foreign currency appreciated), Negative = loss.
 */
export async function calculateFXGainLoss(
  db: SupabaseQueryClient,
  entityId: string,
  asOfDate?: string
): Promise<FXGainLossResult> {
  // 1. Fetch entity info
  const { data: entity, error: entityError } = await db
    .from('entities')
    .select('name, base_currency')
    .eq('id', entityId)
    .single();

  if (entityError || !entity) {
    throw new Error('Entity not found');
  }

  const entityName = entity.name as string;
  const baseCurrency = (entity.base_currency as string).toUpperCase();
  const dateStr = asOfDate || new Date().toISOString().slice(0, 10);

  // 2. Fetch foreign-currency transactions
  //    (where tx currency ≠ entity base_currency)
  const { data: transactions, error: txError } = await db
    .from('transactions')
    .select('currency, amount, exchange_rate')
    .eq('entity_id', entityId)
    .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.SYNCED])
    .neq('currency', baseCurrency)
    .is('deleted_at', null);

  if (txError) {
    throw new Error(`Failed to query transactions: ${txError.message}`);
  }

  const rows = (transactions || []) as ForeignTxRow[];

  if (rows.length === 0) {
    return {
      entityId,
      entityName,
      baseCurrency,
      asOfDate: dateStr,
      items: [],
      totalUnrealizedGainLoss: 0,
    };
  }

  // 3. Collect unique foreign currencies and fetch current rates
  const foreignCurrencies = [...new Set(rows.map((r) => r.currency.toUpperCase()))];
  const currentRates = await fxRateProvider.getRates(baseCurrency, foreignCurrencies);
  const currentRateMap = new Map<string, number>();
  for (const fxRate of currentRates) {
    // We need FROM→TO where FROM = foreign, TO = base.
    // getRates returns base→target, so rate = 1/rate for foreign→base.
    // Actually, wait: getRates(baseCurrency, targets) gives us baseCurrency→target rates.
    // To convert foreign → base, we need the inverse: 1/rate.
    // E.g., base=USD, target=EUR, rate=0.92 means 1 USD = 0.92 EUR.
    // To convert 100 EUR → USD: 100 / 0.92 = 108.70 USD.
    // But the transaction's exchange_rate is stored as "1 foreign = X base",
    // so we should compute the inverse rate for consistency.
    currentRateMap.set(fxRate.to, fxRate.rate);
  }

  // 4. Compute gain/loss for each transaction
  const items: FXGainLossItem[] = [];
  let totalGainLossCents = 0;

  for (const row of rows) {
    const foreignCcy = row.currency.toUpperCase();
    const originalRate = row.exchange_rate; // stored as: 1 foreignCcy = X baseCurrency
    const amount = row.amount;

    // Current rate: getRates gave us baseCurrency→foreignCcy rate.
    // We need foreignCcy→baseCurrency: that's 1/rate.
    const baseToForeign = currentRateMap.get(foreignCcy);
    if (baseToForeign == null || baseToForeign === 0) continue;
    const currentRate = round2(1 / baseToForeign);

    const baseAmountAtOriginal = round2(Math.abs(amount) * originalRate);
    const baseAmountAtCurrent = round2(Math.abs(amount) * currentRate);
    const unrealizedGainLoss = round2(baseAmountAtCurrent - baseAmountAtOriginal);

    items.push({
      foreignCurrency: foreignCcy,
      originalAmount: amount,
      originalRate,
      currentRate,
      baseAmountAtOriginal,
      baseAmountAtCurrent,
      unrealizedGainLoss,
    });

    totalGainLossCents += Math.round(unrealizedGainLoss * 100);
  }

  return {
    entityId,
    entityName,
    baseCurrency,
    asOfDate: dateStr,
    items,
    totalUnrealizedGainLoss: Math.round(totalGainLossCents) / 100,
  };
}
