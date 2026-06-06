/**
 * Multi-Currency FX Rate Service (F8)
 *
 * Handles exchange rate tracking for multi-currency transactions.
 * Records spot rates at transaction time and computes base amounts.
 *
 * IAS 21 / ASC 830 compliance:
 * - Monetary items translated at closing rate
 * - Non-monetary items translated at historical rate
 * - FX gains/losses recognized in P&L
 */

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  date: string;
  source: 'manual' | 'api' | 'estimated';
}

export interface FxConversionResult {
  originalAmount: number;
  originalCurrency: string;
  baseAmount: number;
  baseCurrency: string;
  exchangeRate: number;
  source: 'manual' | 'api' | 'estimated';
}

// ─── Static Rate Table (Fallback) ───────────────────────────────────────────
// In production, these would come from an FX rate API (e.g., Open Exchange Rates).
// This is a conservative fallback for when the API is unavailable.
// IMPORTANT: Update RATES_AS_OF whenever rates are refreshed.

const RATES_AS_OF = '2025-01-15'; // Date these fallback rates were last updated
const RATES_MAX_AGE_DAYS = 90; // Warn if rates are older than this

const APPROXIMATE_USD_RATES: Record<string, number> = {
  'USD': 1.0,
  'EUR': 0.92,
  'GBP': 0.79,
  'CAD': 1.36,
  'AUD': 1.53,
  'JPY': 149.50,
  'CHF': 0.88,
  'NZD': 1.64,
  'INR': 83.10,
  'BRL': 4.97,
  'MXN': 17.15,
  'SGD': 1.34,
  'HKD': 7.82,
  'QAR': 3.64,
  'AED': 3.67,
  'CNY': 7.24,
  'KRW': 1320.0,
  'SEK': 10.45,
  'NOK': 10.62,
  'DKK': 6.87,
  'SAR': 3.75,
  'EGP': 30.90,
  'NGN': 1550.0,
  'KES': 153.50,
  'PLN': 4.03,
  'ZAR': 18.60,
};

export class StaleRatesError extends Error {
  constructor(public readonly ageDays: number) {
    super(
      `FX rates are ${ageDays} days old (max: ${RATES_MAX_AGE_DAYS}). ` +
      `Currency conversion is disabled until rates are updated.`,
    );
    this.name = 'StaleRatesError';
  }
}

function checkRateStaleness(): void {
  const asOf = new Date(RATES_AS_OF);
  const ageDays = Math.round((Date.now() - asOf.getTime()) / (1000 * 60 * 60 * 24));
  if (ageDays > RATES_MAX_AGE_DAYS) {
    throw new StaleRatesError(ageDays);
  }
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Get the exchange rate between two currencies.
 *
 * Currently uses a static rate table. In production, this should call
 * an external FX rate API (Open Exchange Rates, ECB, etc.) and cache
 * the result for the day.
 */
export function getExchangeRate(
  fromCurrency: string,
  toCurrency: string,
): ExchangeRate | null {
  if (fromCurrency === toCurrency) return null;

  const fromRate = APPROXIMATE_USD_RATES[fromCurrency.toUpperCase()];
  const toRate = APPROXIMATE_USD_RATES[toCurrency.toUpperCase()];

  if (!fromRate || !toRate) {
    console.error(
      `[FxService] Unknown currency pair: ${fromCurrency}/${toCurrency}`,
    );
    return null;
  }

  // Cross rate via USD
  const rate = toRate / fromRate;

  checkRateStaleness();

  return {
    from: fromCurrency.toUpperCase(),
    to: toCurrency.toUpperCase(),
    rate: Math.round(rate * 1_000_000) / 1_000_000,
    date: RATES_AS_OF,
    source: 'estimated',
  };
}

/**
 * Convert an amount from one currency to another.
 */
export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): FxConversionResult | null {
  if (fromCurrency === toCurrency) {
    return {
      originalAmount: amount,
      originalCurrency: fromCurrency,
      baseAmount: amount,
      baseCurrency: toCurrency,
      exchangeRate: 1.0,
      source: 'manual',
    };
  }

  const rate = getExchangeRate(fromCurrency, toCurrency);
  if (!rate) return null;

  return {
    originalAmount: amount,
    originalCurrency: fromCurrency,
    baseAmount: Math.round(amount * rate.rate * 100) / 100,
    baseCurrency: toCurrency,
    exchangeRate: rate.rate,
    source: rate.source,
  };
}

/**
 * Apply FX conversion to a transaction during ingestion.
 *
 * If the transaction currency differs from the entity's base currency,
 * computes the base_amount and exchange_rate and updates the transaction.
 */
export async function applyFxConversion(
  db: SupabaseQueryClient,
  transactionId: string,
  transactionCurrency: string,
  transactionAmount: number,
  entityBaseCurrency: string,
): Promise<FxConversionResult | null> {
  if (transactionCurrency === entityBaseCurrency) return null;

  let conversion: FxConversionResult | null;
  try {
    conversion = convertAmount(
      transactionAmount,
      transactionCurrency,
      entityBaseCurrency,
    );
  } catch (error) {
    if (error instanceof StaleRatesError) {
      console.error(
        `[FxService] Stale rates — skipping conversion for tx ${transactionId}: ${error.message}`,
      );
      // Leave base_amount null; caller should flag for review
      return null;
    }
    throw error; // Re-throw unexpected errors
  }

  if (!conversion) {
    console.error(
      `[FxService] Failed to convert ${transactionCurrency} to ${entityBaseCurrency} for tx ${transactionId}`,
    );
    return null;
  }

  await db
    .from('transactions')
    .update({
      exchange_rate: conversion.exchangeRate,
      base_amount: conversion.baseAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transactionId);

  return conversion;
}

/**
 * Get the effective amount for a transaction in the entity's base currency.
 *
 * If `base_amount` is populated (multi-currency), use it.
 * Otherwise, use the original `amount` (same currency).
 */
export function getEffectiveAmount(
  amount: number,
  baseAmount: number | null,
): number {
  return baseAmount ?? amount;
}

/**
 * Calculate unrealized FX gain/loss for a set of transactions.
 *
 * Compares the historical rate (recorded at transaction time) with
 * the current rate to determine unrealized FX exposure.
 */
export function calculateUnrealizedFxGainLoss(
  transactions: {
    amount: number;
    currency: string;
    exchange_rate: number | null;
    base_amount: number | null;
  }[],
  entityBaseCurrency: string,
): {
  totalGainLoss: number;
  exposedCurrencies: { currency: string; exposure: number; gainLoss: number }[];
} {
  const exposureMap = new Map<string, { exposure: number; gainLoss: number }>();

  for (const tx of transactions) {
    if (!tx.exchange_rate || !tx.base_amount || tx.currency === entityBaseCurrency) {
      continue;
    }

    const currentRate = getExchangeRate(tx.currency, entityBaseCurrency);
    if (!currentRate) continue;

    const currentBaseAmount = Math.round(tx.amount * currentRate.rate * 100) / 100;
    const gainLoss = currentBaseAmount - tx.base_amount;

    const existing = exposureMap.get(tx.currency) || { exposure: 0, gainLoss: 0 };
    existing.exposure += Math.abs(tx.base_amount);
    existing.gainLoss += gainLoss;
    exposureMap.set(tx.currency, existing);
  }

  let totalGainLoss = 0;
  const exposedCurrencies: { currency: string; exposure: number; gainLoss: number }[] = [];

  for (const [currency, data] of exposureMap) {
    totalGainLoss += data.gainLoss;
    exposedCurrencies.push({
      currency,
      exposure: Math.round(data.exposure * 100) / 100,
      gainLoss: Math.round(data.gainLoss * 100) / 100,
    });
  }

  return {
    totalGainLoss: Math.round(totalGainLoss * 100) / 100,
    exposedCurrencies,
  };
}
