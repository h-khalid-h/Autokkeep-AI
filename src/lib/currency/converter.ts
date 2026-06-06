// ============================================
// CURRENCY FORMATTING & CONVERSION UTILITIES
// Country-agnostic: supports any currency with proper locale formatting
// ============================================

export interface CurrencyAmount {
  amount: number;
  currency: string;
  baseCurrency?: string;
  exchangeRate?: number;
  convertedAmount?: number;
}

// Supported currencies with symbols and locales
const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string; decimals: number }> = {
  USD: { symbol: '$', locale: 'en-US', decimals: 2 },
  EUR: { symbol: '€', locale: 'de-DE', decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', decimals: 2 },
  AED: { symbol: 'د.إ', locale: 'ar-AE', decimals: 2 },
  SAR: { symbol: '﷼', locale: 'ar-SA', decimals: 2 },
  EGP: { symbol: 'ج.م', locale: 'ar-EG', decimals: 2 },
  CAD: { symbol: 'CA$', locale: 'en-CA', decimals: 2 },
  AUD: { symbol: 'A$', locale: 'en-AU', decimals: 2 },
  INR: { symbol: '₹', locale: 'en-IN', decimals: 2 },
  JPY: { symbol: '¥', locale: 'ja-JP', decimals: 0 },
  CHF: { symbol: 'CHF', locale: 'de-CH', decimals: 2 },
  SGD: { symbol: 'S$', locale: 'en-SG', decimals: 2 },
  HKD: { symbol: 'HK$', locale: 'en-HK', decimals: 2 },
  QAR: { symbol: 'QR', locale: 'ar-QA', decimals: 2 },
  SEK: { symbol: 'kr', locale: 'sv-SE', decimals: 2 },
  PLN: { symbol: 'zł', locale: 'pl-PL', decimals: 2 },
  BRL: { symbol: 'R$', locale: 'pt-BR', decimals: 2 },
  MXN: { symbol: 'MX$', locale: 'es-MX', decimals: 2 },
  ZAR: { symbol: 'R', locale: 'en-ZA', decimals: 2 },
  NGN: { symbol: '₦', locale: 'en-NG', decimals: 2 },
  KES: { symbol: 'KSh', locale: 'en-KE', decimals: 2 },
};

/**
 * Format a monetary amount with proper locale and currency symbol.
 * Uses Intl.NumberFormat for locale-aware display.
 */
export function formatCurrency(amount: number, currency?: string | null): string {
  // E11: Guard against empty/undefined currency which causes Intl.NumberFormat RangeError
  const safeCurrency = currency && currency.trim() ? currency.trim().toUpperCase() : 'USD';

  const config = CURRENCY_CONFIG[safeCurrency];
  if (config) {
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(amount);
  }
  // Fallback for unknown currencies
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
  }).format(amount);
}

/**
 * Get display name for a currency code (e.g. "USD" → "US Dollar").
 */
export function getCurrencyName(code: string): string {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'currency' });
    return names.of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}

/**
 * Get list of supported currencies with codes, names, and symbols.
 */
export function getSupportedCurrencies(): Array<{ code: string; name: string; symbol: string }> {
  return Object.entries(CURRENCY_CONFIG).map(([code, config]) => ({
    code,
    name: getCurrencyName(code),
    symbol: config.symbol,
  }));
}

/**
 * Convert amount between currencies using an exchange rate.
 * Returns the converted amount rounded to 2 decimal places.
 */
export function convertCurrency(
  amount: number,
  exchangeRate: number
): number {
  return Math.round(amount * exchangeRate * 100) / 100;
}

/**
 * Format a percentage change with + prefix for positive values.
 * Example: 12.5 → "+12.5%", -3.2 → "-3.2%"
 */
export function formatPercentChange(change: number): string {
  const prefix = change > 0 ? '+' : '';
  return `${prefix}${change.toFixed(1)}%`;
}

/**
 * Format a compact number (e.g., 1200 → "1.2K", 3400000 → "3.4M").
 */
export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}
