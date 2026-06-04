import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { qatarPlugin } from '../qatar';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    currency: 'QAR',
    date: '2025-06-01',
    merchant_name: 'Acme Qatar LLC',
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
    region: 'qatar',
    currency: 'QAR',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Qatar Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to a date that does NOT trigger Q4 license renewal reminder
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(qatarPlugin.region).toBe('qatar');
    expect(qatarPlugin.name).toBe('Qatar Compliance Module');
    expect(qatarPlugin.rules).toHaveLength(6);
    expect(qatarPlugin.rules.map((r) => r.id)).toEqual([
      'QA-001', 'QA-002', 'QA-003', 'QA-004', 'QA-005', 'QA-006',
    ]);
  });

  // ─── QA-001: No Income Tax ────────────────────────────────────────────────

  describe('QA-001: No Income Tax', () => {
    it('should produce VIOLATION for income_tax categorization', () => {
      const tx = makeTx({ id: 'tx-it1', category_human: 'income_tax_payment' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('no income tax');
    });

    it('should produce VIOLATION for corporate_tax categorization', () => {
      const tx = makeTx({ id: 'tx-ct', category_human: 'corporate_tax' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it('should produce VIOLATION for tax_deduction categorization', () => {
      const tx = makeTx({ id: 'tx-td', category_ai: 'tax_deduction_applied', category_human: null });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it('should NOT flag non-tax categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── QA-002: VAT 5% Validation ───────────────────────────────────────────

  describe('QA-002: VAT 5% Validation', () => {
    it('should produce WARNING for non-5% VAT category', () => {
      const tx = makeTx({ id: 'tx-vat1', category_human: 'vat_10' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('5%');
    });

    it('should produce WARNING for vat_20 category', () => {
      const tx = makeTx({ id: 'tx-vat2', category_ai: 'vat_20', category_human: null });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag vat_5 category', () => {
      const tx = makeTx({ category_human: 'vat_5_applied' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-002');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag vat_exempt category', () => {
      const tx = makeTx({ category_human: 'vat_exempt_goods' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-002');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-VAT categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-002');
      expect(v).toHaveLength(0);
    });
  });

  // ─── QA-003: Excise Tax on Specific Goods ─────────────────────────────────

  describe('QA-003: Excise Tax on Specific Goods', () => {
    it('should produce WARNING for tobacco product without excise tag', () => {
      const tx = makeTx({ id: 'tx-exc1', merchant_name: 'Tobacco Shop', category_human: 'retail' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('100%');
      expect(v!.message).toContain('tobacco');
    });

    it('should flag energy drinks (Red Bull)', () => {
      const tx = makeTx({ id: 'tx-exc2', merchant_name: 'Red Bull Supplier', category_human: 'beverages' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-003');
      expect(v).toBeDefined();
      expect(v!.message).toContain('100%');
    });

    it('should flag carbonated drinks (soda) at 50%', () => {
      const tx = makeTx({ id: 'tx-exc3', category_human: 'soda_purchase', merchant_name: 'Grocery' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-003');
      expect(v).toBeDefined();
      expect(v!.message).toContain('50%');
    });

    it('should NOT flag excise goods WITH excise tag', () => {
      const tx = makeTx({ merchant_name: 'Tobacco Shop', category_human: 'excise_tobacco' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-excise goods', () => {
      const tx = makeTx({ merchant_name: 'Paper Store', category_human: 'stationery' });
      const result = qatarPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── QA-004: Business License Renewal ─────────────────────────────────────

  describe('QA-004: Business License Renewal', () => {
    it('should trigger INFO in October (Q4)', () => {
      vi.setSystemTime(new Date('2025-10-15T12:00:00Z'));
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('license renewal');
    });

    it('should trigger INFO in November', () => {
      vi.setSystemTime(new Date('2025-11-01T12:00:00Z'));
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should trigger INFO in December', () => {
      vi.setSystemTime(new Date('2025-12-15T12:00:00Z'));
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-004');
      expect(v).toBeDefined();
    });

    it('should NOT trigger before October', () => {
      vi.setSystemTime(new Date('2025-09-30T12:00:00Z'));
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger in January', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── QA-005: QAR Currency Requirement ─────────────────────────────────────

  describe('QA-005: QAR Currency Requirement', () => {
    it('should produce WARNING when >20% of transactions are non-QAR', () => {
      const txs = [
        makeTx({ currency: 'QAR' }),
        makeTx({ id: 'tx-usd1', currency: 'USD' }),
        makeTx({ id: 'tx-usd2', currency: 'EUR' }),
      ];
      const result = qatarPlugin.check(txs, makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'QA-005' && v.severity === 'warning');
      expect(v).toBeDefined();
      expect(v!.message).toContain('not in QAR');
    });

    it('should produce INFO per non-QAR transaction', () => {
      const txs = [
        makeTx({ currency: 'QAR' }),
        makeTx({ id: 'tx-usd', currency: 'USD' }),
        makeTx({ id: 'tx-eur', currency: 'EUR' }),
      ];
      const result = qatarPlugin.check(txs, makeConfig());

      const infoViolations = result.violations.filter((v) => v.ruleId === 'QA-005' && v.severity === 'info');
      expect(infoViolations.length).toBe(2);
    });

    it('should NOT produce WARNING when ≤20% of transactions are non-QAR', () => {
      const txs = [
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ id: 'tx-usd', currency: 'USD' }),
      ];
      const result = qatarPlugin.check(txs, makeConfig());

      const warningV = result.violations.filter((v) => v.ruleId === 'QA-005' && v.severity === 'warning');
      expect(warningV).toHaveLength(0);
    });

    it('should still produce INFO for non-QAR when ≤20%', () => {
      const txs = [
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
        makeTx({ id: 'tx-usd', currency: 'USD' }),
      ];
      const result = qatarPlugin.check(txs, makeConfig());

      const infoV = result.violations.filter((v) => v.ruleId === 'QA-005' && v.severity === 'info');
      expect(infoV.length).toBe(1);
    });

    it('should NOT flag when all transactions are QAR', () => {
      const txs = [
        makeTx({ currency: 'QAR' }),
        makeTx({ currency: 'QAR' }),
      ];
      const result = qatarPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag when no transactions', () => {
      const result = qatarPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'QA-005');
      expect(v).toHaveLength(0);
    });
  });

  // ─── QA-006: Zakat Obligations ────────────────────────────────────────────

  describe('QA-006: Zakat Obligations', () => {
    it('should produce INFO for qatari_entity', () => {
      const config = makeConfig({ registrationType: 'qatari_entity' });
      const result = qatarPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'QA-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('Zakat');
    });

    it('should produce INFO for gcc_entity', () => {
      const config = makeConfig({ registrationType: 'gcc_entity' });
      const result = qatarPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'QA-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should NOT flag non-Qatari/GCC entities', () => {
      const config = makeConfig({ registrationType: 'foreign_entity' });
      const result = qatarPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'QA-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag when registrationType is undefined', () => {
      const config = makeConfig();
      const result = qatarPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'QA-006');
      expect(v).toHaveLength(0);
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5)', () => {
      const txs = [
        // QA-001 violation: income tax categorization
        makeTx({ id: 'v1', category_human: 'income_tax_payment' }),
        // QA-002 warning: wrong VAT rate
        makeTx({ id: 'w1', category_human: 'vat_20' }),
      ];

      const result = qatarPlugin.check(txs, makeConfig());

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 50, currency: 'QAR', document_status: 'found', category_human: 'Office Supplies' }),
        makeTx({ amount: 30, currency: 'QAR', document_status: 'found', category_human: 'Stationery' }),
      ];

      const result = qatarPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          category_human: 'income_tax_deduction',
        })
      );

      const result = qatarPlugin.check(txs, makeConfig());
      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 200,
          currency: 'QAR',
          document_status: 'found',
          category_human: 'Office Supplies',
          merchant_name: 'Qatar Office Co',
        }),
        makeTx({
          amount: 45,
          currency: 'QAR',
          document_status: 'found',
          category_human: 'Equipment',
          merchant_name: 'Tech Store Qatar',
        }),
      ];

      const result = qatarPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('qatar');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = qatarPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'qatar');
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
