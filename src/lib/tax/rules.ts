// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Country-Specific Tax Rules Registry
// Maps entity country codes to jurisdiction-specific tax rules, thresholds,
// deduction rates, and recommendation generators.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { getComplianceThresholds } from '@/lib/constants/compliance';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TaxRules {
  /** Tax authority name (IRS, HMRC, ATO, CRA, etc.) */
  authority: string;
  /** Default corporate/business tax rate (0-1) */
  defaultTaxRate: number;
  /** Meals & entertainment deduction rate (1.0 = fully deductible, 0.5 = 50%, 0 = not deductible) */
  mealsDeductionRate: number;
  /** Whether income tax applies (false for AE, SA, QA, HK etc.) */
  hasIncomeTax: boolean;
  /** Minimum receipt threshold in local currency */
  receiptThreshold: number;
  /** High-value receipt threshold in local currency */
  highValueReceiptThreshold: number;
  /** Tax year convention: 'calendar' (Jan-Dec) or 'april' (Apr-Mar like UK/IN) or 'july' (Jul-Jun like AU) */
  fiscalConvention: 'calendar' | 'april' | 'july';
  /** Document retention requirement in years */
  retentionYears: number;
  /** Whether vehicle mileage deduction is a common concept */
  hasMileageDeduction: boolean;
  /** Whether home office deduction is a common concept */
  hasHomeOfficeDeduction: boolean;
  /** Primary tax system label (e.g. 'Income Tax', 'Corporation Tax', 'Profits Tax') */
  taxSystemLabel: string;
  /** Additional jurisdiction-specific notes for recommendations */
  jurisdictionNotes: string[];
}

// ─── Default Rules (generic international) ──────────────────────────────────────

const DEFAULT_RULES: TaxRules = {
  authority: 'Tax Authority',
  defaultTaxRate: 0.25,
  mealsDeductionRate: 1.0,
  hasIncomeTax: true,
  receiptThreshold: 75,
  highValueReceiptThreshold: 250,
  fiscalConvention: 'calendar',
  retentionYears: 7,
  hasMileageDeduction: false,
  hasHomeOfficeDeduction: false,
  taxSystemLabel: 'Income Tax',
  jurisdictionNotes: [],
};

// ─── Country-Specific Rules ─────────────────────────────────────────────────────

const COUNTRY_TAX_RULES: Record<string, Partial<TaxRules>> = {
  // ── Americas ──────────────────────────────────────────────────────────────
  US: {
    authority: 'IRS',
    defaultTaxRate: 0.21,
    mealsDeductionRate: 0.5,
    receiptThreshold: 75,
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    hasMileageDeduction: true,
    hasHomeOfficeDeduction: true,
    taxSystemLabel: 'Federal Income Tax',
    jurisdictionNotes: [
      'The IRS standard mileage rate may provide a larger deduction than actual vehicle expenses — maintain a mileage log.',
      'If you work from home, the simplified home office deduction allows up to $1,500/year ($5 × 300 sq ft).',
    ],
  },
  CA: {
    authority: 'CRA',
    defaultTaxRate: 0.15, // Federal small business rate
    mealsDeductionRate: 0.5,
    receiptThreshold: 75, // CAD
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 6,
    hasMileageDeduction: true,
    hasHomeOfficeDeduction: true,
    taxSystemLabel: 'Corporate Income Tax',
    jurisdictionNotes: [
      'CRA allows business-use-of-home deductions proportional to workspace area.',
      'Maintain a vehicle logbook to claim auto expenses — CRA requires detailed records.',
    ],
  },
  BR: {
    authority: 'Receita Federal',
    defaultTaxRate: 0.15,
    mealsDeductionRate: 1.0,
    receiptThreshold: 100, // BRL
    highValueReceiptThreshold: 500,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'IRPJ',
    jurisdictionNotes: [
      'Simples Nacional may apply for qualifying small businesses — check revenue thresholds with your contador.',
    ],
  },
  MX: {
    authority: 'SAT',
    defaultTaxRate: 0.30,
    mealsDeductionRate: 0.915, // 91.5% deductible if business-related
    receiptThreshold: 2000, // MXN
    highValueReceiptThreshold: 5000,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'ISR',
    jurisdictionNotes: [
      'CFDI (electronic invoices) are required for all deductible expenses — ensure you have valid XML receipts.',
    ],
  },

  // ── Europe ────────────────────────────────────────────────────────────────
  GB: {
    authority: 'HMRC',
    defaultTaxRate: 0.25, // Main rate (19% for small profits)
    mealsDeductionRate: 1.0, // Fully deductible if wholly business
    receiptThreshold: 25, // GBP
    highValueReceiptThreshold: 150,
    fiscalConvention: 'april', // Apr 6 – Apr 5
    retentionYears: 6,
    hasMileageDeduction: true,
    hasHomeOfficeDeduction: true,
    taxSystemLabel: 'Corporation Tax',
    jurisdictionNotes: [
      'HMRC approved mileage allowance payments (AMAPs): 45p/mile for first 10,000 miles, 25p thereafter.',
      'Working from home allowance: £6/week (or £26/month) without evidence, or actual costs with records.',
    ],
  },
  DE: {
    authority: 'Finanzamt',
    defaultTaxRate: 0.30, // ~30% effective (15% corp + trade tax + solidarity)
    mealsDeductionRate: 0.7, // 70% deductible for business meals
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 10,
    hasMileageDeduction: true,
    hasHomeOfficeDeduction: true,
    taxSystemLabel: 'Körperschaftsteuer',
    jurisdictionNotes: [
      'German tax law requires 10-year retention of business records (Aufbewahrungspflicht).',
      'Home office deduction (Homeoffice-Pauschale): up to €1,260/year.',
    ],
  },
  FR: {
    authority: 'DGFiP',
    defaultTaxRate: 0.25,
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 10,
    taxSystemLabel: 'Impôt sur les sociétés',
    jurisdictionNotes: [
      'French tax law requires 10-year retention for accounting documents.',
    ],
  },
  NL: {
    authority: 'Belastingdienst',
    defaultTaxRate: 0.256,
    mealsDeductionRate: 0.80, // 80% deductible for business entertainment
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Vennootschapsbelasting',
    jurisdictionNotes: [
      'Dutch entrepreneurs may qualify for zelfstandigenaftrek (self-employed deduction) and startersaftrek (starter deduction).',
    ],
  },
  IE: {
    authority: 'Revenue',
    defaultTaxRate: 0.125, // 12.5% trading rate
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 6,
    taxSystemLabel: 'Corporation Tax',
    jurisdictionNotes: [
      'Irish small companies may qualify for the Start-up Relief for Entrepreneurs (SURE) scheme.',
    ],
  },
  SE: {
    authority: 'Skatteverket',
    defaultTaxRate: 0.206,
    mealsDeductionRate: 1.0,
    receiptThreshold: 500, // SEK
    highValueReceiptThreshold: 2500,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Bolagsskatt',
    jurisdictionNotes: [
      'Swedish sole traders (enskild firma) can claim egenavgifter deduction for social security contributions.',
    ],
  },
  FI: {
    authority: 'Vero',
    defaultTaxRate: 0.20,
    mealsDeductionRate: 0.5,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 6,
    taxSystemLabel: 'Yhteisövero',
    jurisdictionNotes: [],
  },
  EE: {
    authority: 'EMTA',
    defaultTaxRate: 0.20, // Taxed on distribution only
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Tulumaks',
    jurisdictionNotes: [
      'Estonia taxes corporate profits only upon distribution — reinvested profits are tax-free.',
    ],
  },
  CH: {
    authority: 'ESTV/FTA',
    defaultTaxRate: 0.15, // Varies by canton
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // CHF
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 10,
    taxSystemLabel: 'Gewinnsteuer',
    jurisdictionNotes: [
      'Swiss corporate tax rates vary significantly by canton — consult your Treuhänder for applicable rates.',
    ],
  },
  PL: {
    authority: 'KAS',
    defaultTaxRate: 0.19,
    mealsDeductionRate: 1.0,
    receiptThreshold: 200, // PLN
    highValueReceiptThreshold: 1000,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'CIT',
    jurisdictionNotes: [
      'Polish small businesses may qualify for the liniowy (flat 19%) tax rate or ryczałt (lump-sum) taxation.',
    ],
  },
  LV: {
    authority: 'VID',
    defaultTaxRate: 0.20, // On distributed profits
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'UIN',
    jurisdictionNotes: [
      'Latvia taxes corporate profits on distribution, similar to Estonia.',
    ],
  },
  LT: {
    authority: 'VMI',
    defaultTaxRate: 0.15,
    mealsDeductionRate: 1.0,
    receiptThreshold: 50, // EUR
    highValueReceiptThreshold: 250,
    fiscalConvention: 'calendar',
    retentionYears: 10,
    taxSystemLabel: 'Pelno mokestis',
    jurisdictionNotes: [
      'Lithuanian small companies with under 10 employees and €300K revenue may qualify for the reduced 0% or 5% CIT rate.',
    ],
  },

  // ── Middle East ───────────────────────────────────────────────────────────
  AE: {
    authority: 'FTA',
    defaultTaxRate: 0.09, // 9% corporate tax (introduced 2023, 0% below AED 375K)
    mealsDeductionRate: 1.0,
    hasIncomeTax: true, // Corporate tax since June 2023
    receiptThreshold: 500, // AED
    highValueReceiptThreshold: 2000,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Corporate Tax',
    jurisdictionNotes: [
      'UAE corporate tax: 0% on taxable income up to AED 375,000, 9% above. Free zone entities may qualify for 0% rate.',
      'VAT at 5% applies — ensure proper VAT invoices for input tax credit claims.',
    ],
  },
  SA: {
    authority: 'ZATCA',
    defaultTaxRate: 0.20, // 20% on non-GCC, 2.5% Zakat on GCC
    mealsDeductionRate: 1.0,
    receiptThreshold: 500, // SAR
    highValueReceiptThreshold: 2000,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Income Tax / Zakat',
    jurisdictionNotes: [
      'Saudi entities owned by GCC nationals pay Zakat (2.5%) instead of income tax (20%).',
      'VAT at 15% — ensure proper e-invoicing (Fatoora) compliance for deductions.',
    ],
  },
  QA: {
    authority: 'GTA',
    defaultTaxRate: 0.10,
    mealsDeductionRate: 1.0,
    receiptThreshold: 500, // QAR
    highValueReceiptThreshold: 2000,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Corporate Income Tax',
    jurisdictionNotes: [
      'Qatar has no VAT currently. Corporate tax of 10% applies to foreign-owned entities.',
    ],
  },
  EG: {
    authority: 'ETA',
    defaultTaxRate: 0.225, // 22.5% standard
    mealsDeductionRate: 1.0,
    receiptThreshold: 1500, // EGP
    highValueReceiptThreshold: 5000,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'Corporate Income Tax',
    jurisdictionNotes: [
      'Egypt requires e-invoicing for B2B transactions — ensure compliance with ETA e-invoicing mandates.',
    ],
  },

  // ── Asia-Pacific ──────────────────────────────────────────────────────────
  AU: {
    authority: 'ATO',
    defaultTaxRate: 0.25, // Base rate (30% for large companies)
    mealsDeductionRate: 0.5, // 50% for entertainment
    receiptThreshold: 82.50, // AUD (GST-inclusive)
    highValueReceiptThreshold: 300,
    fiscalConvention: 'july', // Jul 1 – Jun 30
    retentionYears: 5,
    hasMileageDeduction: true,
    hasHomeOfficeDeduction: true,
    taxSystemLabel: 'Company Tax',
    jurisdictionNotes: [
      'ATO cents-per-km method: 85 cents/km (2023-24) — maintain a logbook for higher claims.',
      'Working from home: fixed rate of 67 cents/hour, or actual cost method with records.',
    ],
  },
  IN: {
    authority: 'CBDT',
    defaultTaxRate: 0.25, // Domestic companies (22% + surcharge)
    mealsDeductionRate: 0.5,
    receiptThreshold: 5000, // INR
    highValueReceiptThreshold: 20000,
    fiscalConvention: 'april', // Apr 1 – Mar 31
    retentionYears: 8,
    taxSystemLabel: 'Income Tax',
    jurisdictionNotes: [
      'TDS (Tax Deducted at Source) must be collected on specified payments — ensure TDS compliance on vendor payments.',
      'GST input tax credit requires valid GSTIN on purchase invoices.',
    ],
  },
  JP: {
    authority: 'NTA',
    defaultTaxRate: 0.234, // ~23.4% effective (varies by size/location)
    mealsDeductionRate: 0.5, // 50% for entertainment (small companies get higher limit)
    receiptThreshold: 10000, // JPY
    highValueReceiptThreshold: 50000,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Hōjinzei',
    jurisdictionNotes: [
      'Japan Invoice System (since Oct 2023): qualified invoices required for consumption tax credit.',
    ],
  },
  SG: {
    authority: 'IRAS',
    defaultTaxRate: 0.17,
    mealsDeductionRate: 1.0,
    receiptThreshold: 100, // SGD
    highValueReceiptThreshold: 500,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'Corporate Income Tax',
    jurisdictionNotes: [
      'Singapore offers partial tax exemption: 75% on first S$10K, 50% on next S$190K of chargeable income.',
    ],
  },
  HK: {
    authority: 'IRD',
    defaultTaxRate: 0.165, // 16.5% (8.25% on first HK$2M)
    mealsDeductionRate: 1.0,
    hasIncomeTax: true,
    receiptThreshold: 500, // HKD
    highValueReceiptThreshold: 2000,
    fiscalConvention: 'april', // Apr 1 – Mar 31
    retentionYears: 7,
    taxSystemLabel: 'Profits Tax',
    jurisdictionNotes: [
      'Two-tier profits tax: 8.25% on first HK$2M, 16.5% on remainder — ensure correct tier application.',
    ],
  },

  // ── Africa ────────────────────────────────────────────────────────────────
  ZA: {
    authority: 'SARS',
    defaultTaxRate: 0.27,
    mealsDeductionRate: 1.0,
    receiptThreshold: 1000, // ZAR
    highValueReceiptThreshold: 5000,
    fiscalConvention: 'calendar',
    retentionYears: 5,
    taxSystemLabel: 'Income Tax',
    jurisdictionNotes: [
      'SARS e-Filing: ensure all assessed income and provisional tax payments are up to date.',
    ],
  },
  NG: {
    authority: 'FIRS',
    defaultTaxRate: 0.30,
    mealsDeductionRate: 1.0,
    receiptThreshold: 10000, // NGN
    highValueReceiptThreshold: 50000,
    fiscalConvention: 'calendar',
    retentionYears: 6,
    taxSystemLabel: 'Companies Income Tax',
    jurisdictionNotes: [
      'Nigeria CIT exemptions may apply for companies with turnover below ₦25M.',
    ],
  },
  KE: {
    authority: 'KRA',
    defaultTaxRate: 0.30,
    mealsDeductionRate: 1.0,
    receiptThreshold: 10000, // KES
    highValueReceiptThreshold: 50000,
    fiscalConvention: 'calendar',
    retentionYears: 7,
    taxSystemLabel: 'Corporate Income Tax',
    jurisdictionNotes: [
      'KRA iTax system: ensure timely filing of monthly VAT returns and annual income tax returns.',
    ],
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get tax rules for a given country code.
 * Falls back to sensible defaults for unsupported countries.
 */
export function getTaxRules(countryCode?: string | null): TaxRules {
  const compliance = getComplianceThresholds(countryCode);
  const countryOverrides = countryCode ? COUNTRY_TAX_RULES[countryCode] : undefined;

  return {
    ...DEFAULT_RULES,
    receiptThreshold: compliance.RECEIPT_REQUIRED_THRESHOLD,
    highValueReceiptThreshold: compliance.HIGH_VALUE_RECEIPT_THRESHOLD,
    retentionYears: compliance.RETENTION_YEARS,
    ...countryOverrides,
  };
}

/**
 * Get the tax authority display name for a country.
 */
export function getTaxAuthorityName(countryCode?: string | null): string {
  return getTaxRules(countryCode).authority;
}

/**
 * Get country-specific recommendation text for high-value missing receipts.
 */
export function getMissingReceiptWarning(
  count: number,
  threshold: number,
  countryCode?: string | null
): string {
  const rules = getTaxRules(countryCode);
  const plural = count !== 1 ? 's' : '';
  return `⚠️ ${count} expense${plural} over ${threshold} missing receipts — these are high-priority for ${rules.authority} audit compliance.`;
}

/**
 * Get country-specific meals deduction recommendation.
 */
export function getMealsDeductionNote(
  amount: number,
  formattedAmount: string,
  formattedDeductible: string,
  countryCode?: string | null
): string | null {
  const rules = getTaxRules(countryCode);
  if (amount <= 0) return null;

  if (rules.mealsDeductionRate >= 1.0) {
    return `Meals & entertainment expenses of ${formattedAmount} are fully deductible for business purposes.`;
  }
  if (rules.mealsDeductionRate <= 0) {
    return `Meals & entertainment expenses of ${formattedAmount} are generally not deductible in your jurisdiction.`;
  }
  const pct = Math.round(rules.mealsDeductionRate * 100);
  return `Meals & entertainment expenses of ${formattedAmount} — note: only ${pct}% is deductible per ${rules.authority} rules. Estimated deductible portion: ${formattedDeductible}.`;
}
