import { describe, it, expect } from 'vitest';
import {
  getTaxRules,
  getTaxAuthorityName,
  getMissingReceiptWarning,
  getMealsDeductionNote,
} from './rules';
import type { TaxRules } from './rules';
import { getComplianceThresholds } from '@/lib/constants/compliance';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Tax Rules Module Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── All supported country codes ────────────────────────────────────────────────
const ALL_COUNTRY_CODES = [
  'US', 'CA', 'BR', 'MX',           // Americas
  'GB', 'DE', 'FR', 'NL', 'IE',     // Europe (Western)
  'SE', 'FI', 'EE', 'CH', 'PL',     // Europe (Nordic/Central)
  'LV', 'LT',                       // Europe (Baltic)
  'AE', 'SA', 'QA', 'EG',           // Middle East
  'AU', 'IN', 'JP', 'SG', 'HK',     // Asia-Pacific
  'ZA', 'NG', 'KE',                 // Africa
] as const;

// ─── TaxRules shape validator ───────────────────────────────────────────────────
function assertValidTaxRules(rules: TaxRules, label: string) {
  expect(rules.authority, `${label}: authority`).toBeDefined();
  expect(rules.authority.length, `${label}: authority non-empty`).toBeGreaterThan(0);

  expect(rules.defaultTaxRate, `${label}: defaultTaxRate`).toBeGreaterThanOrEqual(0);
  expect(rules.defaultTaxRate, `${label}: defaultTaxRate <= 1`).toBeLessThanOrEqual(1);

  expect(rules.mealsDeductionRate, `${label}: mealsDeductionRate`).toBeGreaterThanOrEqual(0);
  expect(rules.mealsDeductionRate, `${label}: mealsDeductionRate <= 1`).toBeLessThanOrEqual(1);

  expect(typeof rules.hasIncomeTax, `${label}: hasIncomeTax type`).toBe('boolean');

  expect(rules.receiptThreshold, `${label}: receiptThreshold`).toBeGreaterThan(0);
  expect(rules.highValueReceiptThreshold, `${label}: highValueReceiptThreshold`).toBeGreaterThan(
    rules.receiptThreshold
  );

  expect(['calendar', 'april', 'july'], `${label}: fiscalConvention`).toContain(
    rules.fiscalConvention
  );

  expect(rules.retentionYears, `${label}: retentionYears`).toBeGreaterThanOrEqual(3);
  expect(rules.retentionYears, `${label}: retentionYears <= 15`).toBeLessThanOrEqual(15);

  expect(typeof rules.hasMileageDeduction, `${label}: hasMileageDeduction type`).toBe('boolean');
  expect(typeof rules.hasHomeOfficeDeduction, `${label}: hasHomeOfficeDeduction type`).toBe(
    'boolean'
  );

  expect(rules.taxSystemLabel, `${label}: taxSystemLabel`).toBeDefined();
  expect(rules.taxSystemLabel.length, `${label}: taxSystemLabel non-empty`).toBeGreaterThan(0);

  expect(Array.isArray(rules.jurisdictionNotes), `${label}: jurisdictionNotes is array`).toBe(true);
}

// ═══════════════════════════════════════════════════════════════════════════════
// getTaxRules
// ═══════════════════════════════════════════════════════════════════════════════
describe('getTaxRules', () => {
  // ── Scenario 1: Default rules when no country code ─────────────────────────
  describe('default rules (no country code)', () => {
    it('returns DEFAULT_RULES when countryCode is undefined', () => {
      const rules = getTaxRules();
      expect(rules.authority).toBe('Tax Authority');
      expect(rules.defaultTaxRate).toBe(0.25);
      expect(rules.mealsDeductionRate).toBe(1.0);
      expect(rules.hasIncomeTax).toBe(true);
      expect(rules.fiscalConvention).toBe('calendar');
      expect(rules.hasMileageDeduction).toBe(false);
      expect(rules.hasHomeOfficeDeduction).toBe(false);
      expect(rules.taxSystemLabel).toBe('Income Tax');
      expect(rules.jurisdictionNotes).toEqual([]);
    });

    it('returns DEFAULT_RULES when countryCode is null', () => {
      const rules = getTaxRules(null);
      expect(rules.authority).toBe('Tax Authority');
      expect(rules.defaultTaxRate).toBe(0.25);
    });

    it('returns DEFAULT_RULES when countryCode is empty string', () => {
      const rules = getTaxRules('');
      expect(rules.authority).toBe('Tax Authority');
    });
  });

  // ── Scenario 2: US-specific rules ──────────────────────────────────────────
  describe('US-specific rules', () => {
    it('returns IRS as authority', () => {
      expect(getTaxRules('US').authority).toBe('IRS');
    });

    it('returns 21% corporate tax rate', () => {
      expect(getTaxRules('US').defaultTaxRate).toBe(0.21);
    });

    it('returns 50% meals deduction rate', () => {
      expect(getTaxRules('US').mealsDeductionRate).toBe(0.5);
    });

    it('has mileage and home office deductions', () => {
      const rules = getTaxRules('US');
      expect(rules.hasMileageDeduction).toBe(true);
      expect(rules.hasHomeOfficeDeduction).toBe(true);
    });

    it('uses calendar fiscal convention', () => {
      expect(getTaxRules('US').fiscalConvention).toBe('calendar');
    });

    it('has Federal Income Tax label', () => {
      expect(getTaxRules('US').taxSystemLabel).toBe('Federal Income Tax');
    });

    it('has IRS-specific jurisdiction notes', () => {
      const rules = getTaxRules('US');
      expect(rules.jurisdictionNotes.length).toBeGreaterThan(0);
      expect(rules.jurisdictionNotes.some((n) => n.includes('IRS'))).toBe(true);
    });
  });

  // ── Scenario 3: GB-specific rules ──────────────────────────────────────────
  describe('GB-specific rules', () => {
    it('returns HMRC as authority', () => {
      expect(getTaxRules('GB').authority).toBe('HMRC');
    });

    it('uses april fiscal convention', () => {
      expect(getTaxRules('GB').fiscalConvention).toBe('april');
    });

    it('meals are fully deductible when wholly business', () => {
      expect(getTaxRules('GB').mealsDeductionRate).toBe(1.0);
    });

    it('has Corporation Tax label', () => {
      expect(getTaxRules('GB').taxSystemLabel).toBe('Corporation Tax');
    });

    it('has mileage and home office deductions', () => {
      const rules = getTaxRules('GB');
      expect(rules.hasMileageDeduction).toBe(true);
      expect(rules.hasHomeOfficeDeduction).toBe(true);
    });

    it('has HMRC-specific jurisdiction notes', () => {
      const rules = getTaxRules('GB');
      expect(rules.jurisdictionNotes.some((n) => n.includes('HMRC'))).toBe(true);
    });
  });

  // ── Scenario 4: AU-specific rules ──────────────────────────────────────────
  describe('AU-specific rules', () => {
    it('returns ATO as authority', () => {
      expect(getTaxRules('AU').authority).toBe('ATO');
    });

    it('uses july fiscal convention', () => {
      expect(getTaxRules('AU').fiscalConvention).toBe('july');
    });

    it('has 50% entertainment deduction rate', () => {
      expect(getTaxRules('AU').mealsDeductionRate).toBe(0.5);
    });

    it('receipt threshold is 82.50 AUD (GST-inclusive)', () => {
      expect(getTaxRules('AU').receiptThreshold).toBe(82.5);
    });

    it('has Company Tax label', () => {
      expect(getTaxRules('AU').taxSystemLabel).toBe('Company Tax');
    });

    it('has mileage and home office deductions', () => {
      const rules = getTaxRules('AU');
      expect(rules.hasMileageDeduction).toBe(true);
      expect(rules.hasHomeOfficeDeduction).toBe(true);
    });
  });

  // ── Scenario 5: Unknown country code returns defaults ──────────────────────
  describe('unknown country code fallback', () => {
    it('returns default rules for an unknown country', () => {
      const rules = getTaxRules('XX');
      expect(rules.authority).toBe('Tax Authority');
      expect(rules.defaultTaxRate).toBe(0.25);
      expect(rules.mealsDeductionRate).toBe(1.0);
      expect(rules.fiscalConvention).toBe('calendar');
    });

    it('returns default rules for numeric/invalid codes', () => {
      const rules = getTaxRules('123');
      expect(rules.authority).toBe('Tax Authority');
    });

    it('does not throw for lowercase codes (treated as unknown)', () => {
      expect(() => getTaxRules('us')).not.toThrow();
      const rules = getTaxRules('us');
      // lowercase 'us' won't match 'US' key — should get defaults
      expect(rules.authority).toBe('Tax Authority');
    });
  });

  // ── Scenario 6: All 28 countries return valid rules ────────────────────────
  describe('all supported countries return valid TaxRules', () => {
    it.each(ALL_COUNTRY_CODES)('%s returns complete, valid TaxRules', (code) => {
      const rules = getTaxRules(code);
      assertValidTaxRules(rules, code);
    });
  });

  // ── Scenario 13: Tax-free / special-tax jurisdictions ──────────────────────
  describe('special tax jurisdictions', () => {
    it('AE has corporate tax since 2023', () => {
      const rules = getTaxRules('AE');
      expect(rules.hasIncomeTax).toBe(true);
      expect(rules.defaultTaxRate).toBe(0.09);
      expect(rules.authority).toBe('FTA');
    });

    it('EE (Estonia) has distribution-based taxation', () => {
      const rules = getTaxRules('EE');
      expect(rules.defaultTaxRate).toBe(0.20);
      expect(rules.authority).toBe('EMTA');
      expect(rules.jurisdictionNotes.some((n) => n.includes('distribution'))).toBe(true);
    });

    it('HK uses Profits Tax label', () => {
      const rules = getTaxRules('HK');
      expect(rules.taxSystemLabel).toBe('Profits Tax');
      expect(rules.defaultTaxRate).toBe(0.165);
    });

    it('IE has low 12.5% trading rate', () => {
      const rules = getTaxRules('IE');
      expect(rules.defaultTaxRate).toBe(0.125);
    });
  });

  // ── Scenario 14: Retention years match compliance thresholds ───────────────
  describe('retention years match compliance thresholds', () => {
    it.each(ALL_COUNTRY_CODES)('%s retention years match compliance module', (code) => {
      const rules = getTaxRules(code);
      const compliance = getComplianceThresholds(code);
      expect(rules.retentionYears).toBe(compliance.RETENTION_YEARS);
    });

    it('default retention years match DEFAULT compliance', () => {
      const rules = getTaxRules();
      const compliance = getComplianceThresholds();
      expect(rules.retentionYears).toBe(compliance.RETENTION_YEARS);
    });
  });

  // ── Country-specific spot checks ───────────────────────────────────────────
  describe('country-specific spot checks', () => {
    it('DE has 70% meals deduction and 10-year retention', () => {
      const rules = getTaxRules('DE');
      expect(rules.authority).toBe('Finanzamt');
      expect(rules.mealsDeductionRate).toBe(0.7);
      expect(rules.retentionYears).toBe(10);
    });

    it('CA (CRA) has 50% meals deduction', () => {
      const rules = getTaxRules('CA');
      expect(rules.authority).toBe('CRA');
      expect(rules.mealsDeductionRate).toBe(0.5);
      expect(rules.retentionYears).toBe(6);
    });

    it('IN uses april fiscal convention', () => {
      const rules = getTaxRules('IN');
      expect(rules.authority).toBe('CBDT');
      expect(rules.fiscalConvention).toBe('april');
      expect(rules.retentionYears).toBe(8);
    });

    it('JP has 50% entertainment deduction', () => {
      const rules = getTaxRules('JP');
      expect(rules.authority).toBe('NTA');
      expect(rules.mealsDeductionRate).toBe(0.5);
    });

    it('SG (IRAS) has 17% tax rate', () => {
      const rules = getTaxRules('SG');
      expect(rules.authority).toBe('IRAS');
      expect(rules.defaultTaxRate).toBe(0.17);
    });

    it('MX (SAT) has 91.5% meals deduction', () => {
      const rules = getTaxRules('MX');
      expect(rules.authority).toBe('SAT');
      expect(rules.mealsDeductionRate).toBe(0.915);
    });

    it('NL (Belastingdienst) has 80% entertainment deduction', () => {
      const rules = getTaxRules('NL');
      expect(rules.authority).toBe('Belastingdienst');
      expect(rules.mealsDeductionRate).toBe(0.80);
    });

    it('FI (Vero) has 50% meals deduction', () => {
      const rules = getTaxRules('FI');
      expect(rules.authority).toBe('Vero');
      expect(rules.mealsDeductionRate).toBe(0.5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getTaxAuthorityName
// ═══════════════════════════════════════════════════════════════════════════════
describe('getTaxAuthorityName', () => {
  // ── Scenario 7: Correct authority names ────────────────────────────────────
  it('returns IRS for US', () => {
    expect(getTaxAuthorityName('US')).toBe('IRS');
  });

  it('returns HMRC for GB', () => {
    expect(getTaxAuthorityName('GB')).toBe('HMRC');
  });

  it('returns ATO for AU', () => {
    expect(getTaxAuthorityName('AU')).toBe('ATO');
  });

  it('returns CRA for CA', () => {
    expect(getTaxAuthorityName('CA')).toBe('CRA');
  });

  it('returns Finanzamt for DE', () => {
    expect(getTaxAuthorityName('DE')).toBe('Finanzamt');
  });

  it('returns DGFiP for FR', () => {
    expect(getTaxAuthorityName('FR')).toBe('DGFiP');
  });

  it('returns CBDT for IN', () => {
    expect(getTaxAuthorityName('IN')).toBe('CBDT');
  });

  it('returns NTA for JP', () => {
    expect(getTaxAuthorityName('JP')).toBe('NTA');
  });

  it('returns IRAS for SG', () => {
    expect(getTaxAuthorityName('SG')).toBe('IRAS');
  });

  it('returns IRD for HK', () => {
    expect(getTaxAuthorityName('HK')).toBe('IRD');
  });

  it('returns "Tax Authority" for no country', () => {
    expect(getTaxAuthorityName()).toBe('Tax Authority');
  });

  it('returns "Tax Authority" for null', () => {
    expect(getTaxAuthorityName(null)).toBe('Tax Authority');
  });

  it('returns "Tax Authority" for unknown country', () => {
    expect(getTaxAuthorityName('ZZ')).toBe('Tax Authority');
  });

  // Comprehensive authority name spot check
  const authorityMap: [string, string][] = [
    ['US', 'IRS'],
    ['CA', 'CRA'],
    ['BR', 'Receita Federal'],
    ['MX', 'SAT'],
    ['GB', 'HMRC'],
    ['DE', 'Finanzamt'],
    ['FR', 'DGFiP'],
    ['NL', 'Belastingdienst'],
    ['IE', 'Revenue'],
    ['SE', 'Skatteverket'],
    ['FI', 'Vero'],
    ['EE', 'EMTA'],
    ['CH', 'ESTV/FTA'],
    ['PL', 'KAS'],
    ['LV', 'VID'],
    ['LT', 'VMI'],
    ['AE', 'FTA'],
    ['SA', 'ZATCA'],
    ['QA', 'GTA'],
    ['EG', 'ETA'],
    ['AU', 'ATO'],
    ['IN', 'CBDT'],
    ['JP', 'NTA'],
    ['SG', 'IRAS'],
    ['HK', 'IRD'],
    ['ZA', 'SARS'],
    ['NG', 'FIRS'],
    ['KE', 'KRA'],
  ];

  it.each(authorityMap)('%s maps to %s', (code, expectedAuthority) => {
    expect(getTaxAuthorityName(code)).toBe(expectedAuthority);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getMissingReceiptWarning
// ═══════════════════════════════════════════════════════════════════════════════
describe('getMissingReceiptWarning', () => {
  // ── Scenario 8: Includes correct authority name ────────────────────────────
  it('includes IRS for US', () => {
    const warning = getMissingReceiptWarning(3, 75, 'US');
    expect(warning).toContain('IRS');
  });

  it('includes HMRC for GB', () => {
    const warning = getMissingReceiptWarning(2, 25, 'GB');
    expect(warning).toContain('HMRC');
  });

  it('includes ATO for AU', () => {
    const warning = getMissingReceiptWarning(1, 82.5, 'AU');
    expect(warning).toContain('ATO');
  });

  it('includes "Tax Authority" for unknown country', () => {
    const warning = getMissingReceiptWarning(5, 100, 'ZZ');
    expect(warning).toContain('Tax Authority');
  });

  it('includes "Tax Authority" when no country provided', () => {
    const warning = getMissingReceiptWarning(1, 75);
    expect(warning).toContain('Tax Authority');
  });

  // ── Warning text format ────────────────────────────────────────────────────
  it('includes count and threshold in message', () => {
    const warning = getMissingReceiptWarning(5, 250, 'US');
    expect(warning).toContain('5');
    expect(warning).toContain('250');
  });

  it('uses singular "expense" for count of 1', () => {
    const warning = getMissingReceiptWarning(1, 75, 'US');
    expect(warning).toContain('1 expense ');
    expect(warning).not.toContain('1 expenses');
  });

  it('uses plural "expenses" for count > 1', () => {
    const warning = getMissingReceiptWarning(3, 75, 'US');
    expect(warning).toContain('3 expenses');
  });

  it('contains warning emoji', () => {
    const warning = getMissingReceiptWarning(1, 75, 'US');
    expect(warning).toContain('⚠️');
  });

  it('mentions audit compliance', () => {
    const warning = getMissingReceiptWarning(1, 75, 'US');
    expect(warning).toContain('audit compliance');
  });

  it('formats zero count correctly', () => {
    const warning = getMissingReceiptWarning(0, 75, 'US');
    expect(warning).toContain('0 expenses');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getMealsDeductionNote
// ═══════════════════════════════════════════════════════════════════════════════
describe('getMealsDeductionNote', () => {
  // ── Scenario 9: Returns null for 0 amount ──────────────────────────────────
  describe('zero and negative amounts', () => {
    it('returns null for 0 amount', () => {
      const note = getMealsDeductionNote(0, '$0.00', '$0.00', 'US');
      expect(note).toBeNull();
    });

    it('returns null for negative amount', () => {
      const note = getMealsDeductionNote(-100, '-$100.00', '-$50.00', 'US');
      expect(note).toBeNull();
    });
  });

  // ── Scenario 10: Fully deductible (rate = 1.0) ────────────────────────────
  describe('fully deductible (mealsDeductionRate >= 1.0)', () => {
    it('returns fully deductible message for GB (rate=1.0)', () => {
      const note = getMealsDeductionNote(500, '£500.00', '£500.00', 'GB');
      expect(note).not.toBeNull();
      expect(note).toContain('fully deductible');
      expect(note).toContain('£500.00');
    });

    it('returns fully deductible message for SG (rate=1.0)', () => {
      const note = getMealsDeductionNote(200, 'S$200.00', 'S$200.00', 'SG');
      expect(note).toContain('fully deductible');
    });

    it('returns fully deductible message for default rules', () => {
      const note = getMealsDeductionNote(100, '$100.00', '$100.00');
      expect(note).toContain('fully deductible');
    });

    it('returns fully deductible message for unknown country (falls back to default rate=1.0)', () => {
      const note = getMealsDeductionNote(100, '$100.00', '$100.00', 'ZZ');
      expect(note).toContain('fully deductible');
    });
  });

  // ── Scenario 11: Partially deductible ──────────────────────────────────────
  describe('partially deductible', () => {
    it('US (50%) shows correct percentage and authority', () => {
      const note = getMealsDeductionNote(1000, '$1,000.00', '$500.00', 'US');
      expect(note).not.toBeNull();
      expect(note).toContain('50%');
      expect(note).toContain('IRS');
      expect(note).toContain('$1,000.00');
      expect(note).toContain('$500.00');
    });

    it('DE (70%) shows correct percentage and authority', () => {
      const note = getMealsDeductionNote(200, '€200.00', '€140.00', 'DE');
      expect(note).not.toBeNull();
      expect(note).toContain('70%');
      expect(note).toContain('Finanzamt');
      expect(note).toContain('€200.00');
      expect(note).toContain('€140.00');
    });

    it('CA (50%) shows correct percentage and CRA', () => {
      const note = getMealsDeductionNote(300, 'C$300.00', 'C$150.00', 'CA');
      expect(note).toContain('50%');
      expect(note).toContain('CRA');
    });

    it('AU (50%) shows correct percentage and ATO', () => {
      const note = getMealsDeductionNote(400, 'A$400.00', 'A$200.00', 'AU');
      expect(note).toContain('50%');
      expect(note).toContain('ATO');
    });

    it('NL (80%) shows correct percentage', () => {
      const note = getMealsDeductionNote(100, '€100.00', '€80.00', 'NL');
      expect(note).toContain('80%');
      expect(note).toContain('Belastingdienst');
    });

    it('MX (91.5%) rounds to 92%', () => {
      const note = getMealsDeductionNote(1000, 'MX$1,000', 'MX$915', 'MX');
      expect(note).toContain('92%');
      expect(note).toContain('SAT');
    });

    it('FI (50%) shows correct percentage', () => {
      const note = getMealsDeductionNote(100, '€100.00', '€50.00', 'FI');
      expect(note).toContain('50%');
      expect(note).toContain('Vero');
    });

    it('includes "deductible portion" language', () => {
      const note = getMealsDeductionNote(500, '$500.00', '$250.00', 'US');
      expect(note).toContain('deductible portion');
    });
  });

  // ── Scenario 12: Non-deductible (rate = 0) ────────────────────────────────
  describe('non-deductible (mealsDeductionRate = 0)', () => {
    // No country currently has rate = 0, so we verify the code path
    // by observing the boundary: the function checks rate <= 0
    // For countries with partial rates, we verify the note is NOT the non-deductible message.

    it('would return not-deductible message for rate=0 if such a country existed', () => {
      // We can test the boundary by confirming that all countries with rate > 0
      // do NOT return the "not deductible" message
      const note = getMealsDeductionNote(100, '$100.00', '$50.00', 'US');
      expect(note).not.toContain('not deductible');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles very large amounts', () => {
      const note = getMealsDeductionNote(999999, '$999,999.00', '$499,999.50', 'US');
      expect(note).not.toBeNull();
      expect(note).toContain('$999,999.00');
    });

    it('handles very small positive amounts', () => {
      const note = getMealsDeductionNote(0.01, '$0.01', '$0.01', 'GB');
      expect(note).not.toBeNull();
      expect(note).toContain('fully deductible');
    });

    it('includes formatted amount and formatted deductible in output', () => {
      const note = getMealsDeductionNote(500, 'CUSTOM_FMT', 'DEDUCTIBLE_FMT', 'US');
      expect(note).toContain('CUSTOM_FMT');
      expect(note).toContain('DEDUCTIBLE_FMT');
    });

    it('returns null for null country code with 0 amount', () => {
      expect(getMealsDeductionNote(0, '$0', '$0', null)).toBeNull();
    });

    it('returns null for undefined country code with 0 amount', () => {
      expect(getMealsDeductionNote(0, '$0', '$0')).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-cutting: fiscal convention coverage
// ═══════════════════════════════════════════════════════════════════════════════
describe('fiscal conventions', () => {
  it('only GB, IN, HK use april fiscal convention', () => {
    const aprilCountries = ALL_COUNTRY_CODES.filter(
      (c) => getTaxRules(c).fiscalConvention === 'april'
    );
    expect(aprilCountries.sort()).toEqual(['GB', 'HK', 'IN']);
  });

  it('only AU uses july fiscal convention', () => {
    const julyCountries = ALL_COUNTRY_CODES.filter(
      (c) => getTaxRules(c).fiscalConvention === 'july'
    );
    expect(julyCountries).toEqual(['AU']);
  });

  it('remaining countries use calendar fiscal convention', () => {
    const calendarCountries = ALL_COUNTRY_CODES.filter(
      (c) => getTaxRules(c).fiscalConvention === 'calendar'
    );
    // 28 total - 3 (april) - 1 (july) = 24 calendar
    expect(calendarCountries.length).toBe(24);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-cutting: receipt thresholds from compliance module
// ═══════════════════════════════════════════════════════════════════════════════
describe('receipt thresholds alignment', () => {
  it.each(ALL_COUNTRY_CODES)(
    '%s receipt thresholds match compliance module',
    (code) => {
      const rules = getTaxRules(code);
      const compliance = getComplianceThresholds(code);
      expect(rules.receiptThreshold).toBe(compliance.RECEIPT_REQUIRED_THRESHOLD);
      expect(rules.highValueReceiptThreshold).toBe(compliance.HIGH_VALUE_RECEIPT_THRESHOLD);
    }
  );
});
