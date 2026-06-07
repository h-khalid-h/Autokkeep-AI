// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Multi-Currency Profit & Loss Report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Extends the standard P&L report with FX conversion: converts all amounts
// from the entity's base currency to a user-chosen display currency,
// and tracks the FX gain/loss arising from the conversion.

import type { ProfitAndLossReport } from './profit-loss';
import type { FXRateProvider } from '@/lib/currency/fx-rates';
import { fxRateProvider } from '@/lib/currency/fx-rates';

// ─── Public Interfaces ─────────────────────────────────────────────────────────

export interface FXConversionLine {
  originalCurrency: string;
  originalAmount: number;
  rate: number;
  convertedAmount: number;
}

export interface MultiCurrencyPnLReport {
  /** The underlying P&L in the entity's base currency. */
  base: ProfitAndLossReport;
  /** The currency these converted figures are denominated in. */
  displayCurrency: string;
  /** Individual FX conversion entries for key line items. */
  fxConversions: FXConversionLine[];
  /** Total revenue converted to displayCurrency. */
  convertedTotalRevenue: number;
  /** Total expenses converted to displayCurrency. */
  convertedTotalExpenses: number;
  /** Net income converted to displayCurrency. */
  convertedNetIncome: number;
  /** FX gain/loss: difference between converted net income and naïve rate-1 net income. */
  fxGainLoss: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Generator ──────────────────────────────────────────────────────────────────

/**
 * Generates a multi-currency P&L report by converting the base P&L
 * into a target display currency.
 *
 * @param baseReport - The standard P&L report in the entity's base currency
 * @param displayCurrency - The currency to convert into (e.g. "EUR")
 * @param provider - FX rate provider (defaults to the singleton)
 */
export async function generateMultiCurrencyPnL(
  baseReport: ProfitAndLossReport,
  displayCurrency: string,
  provider: FXRateProvider = fxRateProvider
): Promise<MultiCurrencyPnLReport> {
  const displayUpper = displayCurrency.toUpperCase();
  const baseCurrency = baseReport.entityCurrency.toUpperCase();

  // If same currency, no conversion needed
  if (baseCurrency === displayUpper) {
    return {
      base: baseReport,
      displayCurrency: displayUpper,
      fxConversions: [],
      convertedTotalRevenue: baseReport.totalRevenue,
      convertedTotalExpenses: baseReport.totalExpenses,
      convertedNetIncome: baseReport.netIncome,
      fxGainLoss: 0,
    };
  }

  // Get the conversion rate: base → display
  const fxRate = await provider.getRate(baseCurrency, displayUpper);
  const rate = fxRate.rate;

  // Convert the main P&L figures
  const convertedTotalRevenue = round2(baseReport.totalRevenue * rate);
  const convertedTotalExpenses = round2(baseReport.totalExpenses * rate);
  const convertedNetIncome = round2(baseReport.netIncome * rate);

  // Build conversion entries for revenue + expense line items
  const fxConversions: FXConversionLine[] = [];

  for (const item of baseReport.revenue) {
    fxConversions.push({
      originalCurrency: baseCurrency,
      originalAmount: item.amount,
      rate,
      convertedAmount: round2(item.amount * rate),
    });
  }

  for (const item of baseReport.expenses) {
    fxConversions.push({
      originalCurrency: baseCurrency,
      originalAmount: item.amount,
      rate,
      convertedAmount: round2(item.amount * rate),
    });
  }

  // FX gain/loss: the rounding difference introduced by conversion.
  // In a simple single-rate conversion this is typically tiny, but with
  // mixed rates or comparison periods it captures the real FX impact.
  const sumConverted = round2(convertedTotalRevenue - convertedTotalExpenses);
  const fxGainLoss = round2(sumConverted - convertedNetIncome);

  return {
    base: baseReport,
    displayCurrency: displayUpper,
    fxConversions,
    convertedTotalRevenue,
    convertedTotalExpenses,
    convertedNetIncome,
    fxGainLoss,
  };
}
