import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { hongKongPlugin } from '../hong-kong';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    currency: 'HKD',
    date: '2025-06-01',
    merchant_name: 'Acme HK Ltd',
    category_ai: 'Office Supplies',
    category_human: null,
    document_status: 'found',
    gl_code: 'G100',
    notes: 'Business supplies',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<EntityComplianceConfig> = {}): EntityComplianceConfig {
  return {
    entityId: 'entity-001',
    region: 'hong_kong',
    currency: 'HKD',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Hong Kong Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to a date that does NOT trigger annual filing season (Apr/May)
    vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(hongKongPlugin.region).toBe('hong_kong');
    expect(hongKongPlugin.name).toBe('Hong Kong Compliance Module');
    expect(hongKongPlugin.rules).toHaveLength(6);
    expect(hongKongPlugin.rules.map((r) => r.id)).toEqual([
      'HK-001', 'HK-002', 'HK-003', 'HK-004', 'HK-005', 'HK-006',
    ]);
  });

  // ─── HK-001: Profits Tax Rate Validation ───────────────────────────────────

  describe('HK-001: Profits Tax Rate Validation', () => {
    it('should produce INFO for transaction categorized as profits_tax', () => {
      const tx = makeTx({ id: 'tx-pt1', category_human: 'profits_tax_payment' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.transactionId).toBe('tx-pt1');
      expect(v!.message).toContain('8.25%');
      expect(v!.message).toContain('16.5%');
    });

    it('should produce INFO for transaction categorized as corporate_tax', () => {
      const tx = makeTx({ id: 'tx-ct', category_ai: 'corporate_tax', category_human: null });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should NOT flag non-tax categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── HK-002: No VAT/GST System ────────────────────────────────────────────

  describe('HK-002: No VAT/GST System', () => {
    it('should produce VIOLATION for transaction with VAT category', () => {
      const tx = makeTx({ id: 'tx-vat', category_human: 'vat_20' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('no VAT/GST system');
    });

    it('should produce VIOLATION for transaction with GST category', () => {
      const tx = makeTx({ id: 'tx-gst', category_human: 'gst_applied' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it('should produce VIOLATION for transaction with sales_tax category', () => {
      const tx = makeTx({ id: 'tx-st', category_ai: 'sales_tax_collected', category_human: null });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it('should NOT flag non-VAT/GST categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-002');
      expect(v).toHaveLength(0);
    });
  });

  // ─── HK-003: MPF Employer Contribution ────────────────────────────────────

  describe('HK-003: MPF Employer Contribution', () => {
    it('should produce WARNING for payroll without MPF contribution', () => {
      const tx = makeTx({ id: 'tx-pay', category_human: 'salary_payment' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('5%');
    });

    it('should flag payroll category via category_ai', () => {
      const tx = makeTx({ id: 'tx-payroll', category_ai: 'payroll_expense', category_human: null });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag payroll when MPF contribution exists', () => {
      const txs = [
        makeTx({ category_human: 'salary_payment' }),
        makeTx({ category_human: 'mpf_contribution' }),
      ];
      const result = hongKongPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag payroll when provident_fund entry exists', () => {
      const txs = [
        makeTx({ category_human: 'wages_payment' }),
        makeTx({ category_human: 'provident_fund_employer' }),
      ];
      const result = hongKongPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-payroll categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── HK-004: Salaries Tax Withholding ────────────────────────────────────

  describe('HK-004: Salaries Tax Withholding', () => {
    it('should produce INFO for payroll without salaries tax withholding', () => {
      const tx = makeTx({ id: 'tx-sal', category_human: 'salary_payment' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('salaries tax withholding');
    });

    it('should NOT flag payroll when salaries_tax withholding exists', () => {
      const txs = [
        makeTx({ category_human: 'payroll_expense' }),
        makeTx({ category_human: 'salaries_tax_withholding' }),
      ];
      const result = hongKongPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag payroll when tax_withholding entry exists', () => {
      const txs = [
        makeTx({ category_human: 'salary_payment' }),
        makeTx({ category_human: 'tax_withholding_employee' }),
      ];
      const result = hongKongPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-payroll categories', () => {
      const tx = makeTx({ category_human: 'Office Rent' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── HK-005: Annual Filing Deadline ──────────────────────────────────────

  describe('HK-005: Annual Filing Deadline', () => {
    it('should trigger WARNING in April', () => {
      vi.setSystemTime(new Date('2025-04-15T12:00:00Z'));
      const result = hongKongPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('filing season');
    });

    it('should trigger WARNING in May', () => {
      vi.setSystemTime(new Date('2025-05-10T12:00:00Z'));
      const result = hongKongPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT trigger outside April/May', () => {
      vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
      const result = hongKongPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger in March', () => {
      vi.setSystemTime(new Date('2025-03-15T12:00:00Z'));
      const result = hongKongPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-005');
      expect(v).toHaveLength(0);
    });
  });

  // ─── HK-006: Offshore Income Exemption ──────────────────────────────────

  describe('HK-006: Offshore Income Exemption', () => {
    it('should produce WARNING for offshore income in HKD', () => {
      const tx = makeTx({ id: 'tx-off', category_human: 'offshore_revenue', currency: 'HKD' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('offshore');
      expect(v!.message).toContain('HKD');
    });

    it('should flag overseas_income category in HKD', () => {
      const tx = makeTx({ id: 'tx-oi', category_ai: 'overseas_income', category_human: null, currency: 'HKD' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'HK-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag offshore income in non-HKD currency', () => {
      const tx = makeTx({ category_human: 'offshore_revenue', currency: 'USD' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-offshore categories', () => {
      const tx = makeTx({ category_human: 'domestic_revenue', currency: 'HKD' });
      const result = hongKongPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'HK-006');
      expect(v).toHaveLength(0);
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5)', () => {
      const txs = [
        // HK-002 violation: VAT category
        makeTx({ id: 'v1', category_human: 'vat_10' }),
        // HK-006 warning: offshore in HKD
        makeTx({ id: 'w1', category_human: 'offshore_income', currency: 'HKD' }),
      ];

      const result = hongKongPlugin.check(txs, makeConfig());

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 50, currency: 'HKD', document_status: 'found', category_human: 'Office Supplies' }),
        makeTx({ amount: 30, currency: 'HKD', document_status: 'found', category_human: 'Stationery' }),
      ];

      const result = hongKongPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          category_human: 'vat_applied',
        })
      );

      const result = hongKongPlugin.check(txs, makeConfig());
      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 200,
          currency: 'HKD',
          document_status: 'found',
          category_human: 'Office Supplies',
          merchant_name: 'HK Office Co',
        }),
        makeTx({
          amount: 45,
          currency: 'HKD',
          document_status: 'found',
          category_human: 'Equipment',
          merchant_name: 'Tech Store HK',
        }),
      ];

      const result = hongKongPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('hong_kong');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = hongKongPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'hong_kong');
      expect(result).toHaveProperty('checkedAt');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('summary');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.score).toBe('number');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });
});
