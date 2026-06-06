/**
 * Country-specific compliance thresholds.
 * Centralizes all regulatory values to prevent drift across modules.
 */
export const COMPLIANCE_THRESHOLDS = {
  /** United States — IRS rules */
  US: {
    VENDOR_REPORTING_THRESHOLD: 600,        // IRS 1099-NEC filing threshold
    RECEIPT_REQUIRED_THRESHOLD: 75,         // IRS §274 substantiation
    HIGH_VALUE_RECEIPT_THRESHOLD: 250,      // Higher scrutiny tier
    RETENTION_YEARS: 7,                     // IRS retention requirement
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
