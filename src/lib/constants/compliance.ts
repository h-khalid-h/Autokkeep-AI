/**
 * Country-specific compliance thresholds.
 * Centralizes all regulatory values to prevent drift across modules.
 *
 * Receipt thresholds are in LOCAL CURRENCY for each country.
 * Vendor reporting thresholds indicate when formal reporting is required
 * (e.g., IRS 1099-NEC at $600, HMRC CIS, etc.).
 */
export const COMPLIANCE_THRESHOLDS = {
  /** United States — IRS rules */
  US: {
    VENDOR_REPORTING_THRESHOLD: 600,        // IRS 1099-NEC filing threshold (USD)
    RECEIPT_REQUIRED_THRESHOLD: 75,         // IRS §274 substantiation (USD)
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // Higher scrutiny tier (USD)
    RETENTION_YEARS: 7,                     // IRS retention requirement
  },
  /** United Kingdom — HMRC rules */
  GB: {
    VENDOR_REPORTING_THRESHOLD: Infinity,   // No 1099-equivalent (CIS is construction-only)
    RECEIPT_REQUIRED_THRESHOLD: 25,         // GBP — HMRC simplified expenses threshold
    HIGH_VALUE_RECEIPT_THRESHOLD: 150,      // GBP
    RETENTION_YEARS: 6,                     // HMRC requirement
  },
  /** Germany — Finanzamt rules */
  DE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR — Kleinbetragsrechnungen limit
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 10,                    // Aufbewahrungspflicht
  },
  /** France — DGFiP rules */
  FR: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 10,
  },
  /** Netherlands — Belastingdienst rules */
  NL: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 7,
  },
  /** Ireland — Revenue rules */
  IE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 6,
  },
  /** Canada — CRA rules */
  CA: {
    VENDOR_REPORTING_THRESHOLD: Infinity,   // No 1099-equivalent; T4A is employer-only
    RECEIPT_REQUIRED_THRESHOLD: 75,         // CAD
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // CAD
    RETENTION_YEARS: 6,
  },
  /** Australia — ATO rules */
  AU: {
    VENDOR_REPORTING_THRESHOLD: Infinity,   // TPAR exists but is limited scope
    RECEIPT_REQUIRED_THRESHOLD: 82.50,      // AUD — GST-inclusive threshold
    HIGH_VALUE_RECEIPT_THRESHOLD: 300,      // AUD
    RETENTION_YEARS: 5,
  },
  /** India — CBDT rules */
  IN: {
    VENDOR_REPORTING_THRESHOLD: 30000,      // INR — TDS threshold for professionals (§194J)
    RECEIPT_REQUIRED_THRESHOLD: 5000,       // INR
    HIGH_VALUE_RECEIPT_THRESHOLD: 20000,    // INR
    RETENTION_YEARS: 8,
  },
  /** Japan — NTA rules */
  JP: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 10000,      // JPY
    HIGH_VALUE_RECEIPT_THRESHOLD: 50000,    // JPY
    RETENTION_YEARS: 7,
  },
  /** Singapore — IRAS rules */
  SG: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 100,        // SGD
    HIGH_VALUE_RECEIPT_THRESHOLD: 500,      // SGD
    RETENTION_YEARS: 5,
  },
  /** Hong Kong — IRD rules */
  HK: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 500,        // HKD
    HIGH_VALUE_RECEIPT_THRESHOLD: 2000,     // HKD
    RETENTION_YEARS: 7,
  },
  /** Switzerland — ESTV/FTA rules */
  CH: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // CHF
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // CHF
    RETENTION_YEARS: 10,
  },
  /** UAE — FTA rules */
  AE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 500,        // AED
    HIGH_VALUE_RECEIPT_THRESHOLD: 2000,     // AED
    RETENTION_YEARS: 7,
  },
  /** Saudi Arabia — ZATCA rules */
  SA: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 500,        // SAR
    HIGH_VALUE_RECEIPT_THRESHOLD: 2000,     // SAR
    RETENTION_YEARS: 7,
  },
  /** Qatar — GTA rules */
  QA: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 500,        // QAR
    HIGH_VALUE_RECEIPT_THRESHOLD: 2000,     // QAR
    RETENTION_YEARS: 7,
  },
  /** Sweden — Skatteverket rules */
  SE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 500,        // SEK
    HIGH_VALUE_RECEIPT_THRESHOLD: 2500,     // SEK
    RETENTION_YEARS: 7,
  },
  /** Estonia — EMTA rules */
  EE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 7,
  },
  /** Finland — Vero rules */
  FI: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 6,
  },
  /** Poland — KAS rules */
  PL: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 200,        // PLN
    HIGH_VALUE_RECEIPT_THRESHOLD: 1000,     // PLN
    RETENTION_YEARS: 5,
  },
  /** Latvia — VID rules */
  LV: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 5,
  },
  /** Lithuania — VMI rules */
  LT: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 50,         // EUR
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // EUR
    RETENTION_YEARS: 10,
  },
  /** Brazil — Receita Federal rules */
  BR: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 100,        // BRL
    HIGH_VALUE_RECEIPT_THRESHOLD: 500,      // BRL
    RETENTION_YEARS: 5,
  },
  /** Mexico — SAT rules */
  MX: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 2000,       // MXN
    HIGH_VALUE_RECEIPT_THRESHOLD: 5000,     // MXN
    RETENTION_YEARS: 5,
  },
  /** South Africa — SARS rules */
  ZA: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 1000,       // ZAR
    HIGH_VALUE_RECEIPT_THRESHOLD: 5000,     // ZAR
    RETENTION_YEARS: 5,
  },
  /** Nigeria — FIRS rules */
  NG: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 10000,      // NGN
    HIGH_VALUE_RECEIPT_THRESHOLD: 50000,    // NGN
    RETENTION_YEARS: 6,
  },
  /** Kenya — KRA rules */
  KE: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 10000,      // KES
    HIGH_VALUE_RECEIPT_THRESHOLD: 50000,    // KES
    RETENTION_YEARS: 7,
  },
  /** Egypt — ETA rules */
  EG: {
    VENDOR_REPORTING_THRESHOLD: Infinity,
    RECEIPT_REQUIRED_THRESHOLD: 1500,       // EGP
    HIGH_VALUE_RECEIPT_THRESHOLD: 5000,     // EGP
    RETENTION_YEARS: 5,
  },
  /** Default — used for countries without specific rules */
  DEFAULT: {
    VENDOR_REPORTING_THRESHOLD: Infinity,   // No vendor reporting threshold
    RECEIPT_REQUIRED_THRESHOLD: 75,         // General best practice
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,
    RETENTION_YEARS: 7,                     // Conservative default
  },
} as const;

/**
 * Get compliance thresholds for a given country code.
 * Falls back to DEFAULT for countries without specific rules.
 */
export function getComplianceThresholds(countryCode?: string | null) {
  if (countryCode && countryCode in COMPLIANCE_THRESHOLDS) {
    return COMPLIANCE_THRESHOLDS[countryCode as keyof typeof COMPLIANCE_THRESHOLDS];
  }
  return COMPLIANCE_THRESHOLDS.DEFAULT;
}

// ─── Backward Compatibility ──────────────────────────────────────────────────
// These named exports are kept for existing consumers that import them directly.
// New code should prefer `getComplianceThresholds(country)`.
export const IRS_1099_THRESHOLD = COMPLIANCE_THRESHOLDS.US.VENDOR_REPORTING_THRESHOLD;
export const RECEIPT_REQUIRED_THRESHOLD = COMPLIANCE_THRESHOLDS.US.RECEIPT_REQUIRED_THRESHOLD;
export const HIGH_VALUE_RECEIPT_THRESHOLD = COMPLIANCE_THRESHOLDS.US.HIGH_VALUE_RECEIPT_THRESHOLD;
export const IRS_RETENTION_YEARS = COMPLIANCE_THRESHOLDS.US.RETENTION_YEARS;
