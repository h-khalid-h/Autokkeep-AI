import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { japanPlugin } from '../japan';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 5000,
    currency: 'JPY',
    date: '2025-06-01',
    merchant_name: 'Acme Japan KK',
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
    region: 'japan',
    currency: 'JPY',
    fiscalYearStart: '04-01', // Standard Japanese fiscal year
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Japan Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(japanPlugin.region).toBe('japan');
    expect(japanPlugin.name).toBe('Japan Compliance Module');
    expect(japanPlugin.rules).toHaveLength(6);
    expect(japanPlugin.rules.map((r) => r.id)).toEqual([
      'JP-001', 'JP-002', 'JP-003', 'JP-004', 'JP-005', 'JP-006',
    ]);
  });

  // ─── JP-001: Consumption Tax Rate Validation ──────────────────────────────

  describe('JP-001: Consumption Tax Rate Validation', () => {
    it('should produce WARNING for food-related item with 10% consumption tax', () => {
      const tx = makeTx({ id: 'tx-ct1', category_human: 'consumption_tax_10', merchant_name: 'Bento Shop' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('food-related');
      expect(v!.message).toContain('8%');
    });

    it('should flag via food keyword in category (e.g., ct_food_10)', () => {
      const tx = makeTx({ id: 'tx-ct2', category_human: 'ct_food_10', merchant_name: 'General Store' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag food items at 8% rate', () => {
      const tx = makeTx({ category_human: 'consumption_tax_8', merchant_name: 'Grocery Store' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-food items at 10%', () => {
      const tx = makeTx({ category_human: 'consumption_tax_10', merchant_name: 'Electronics Corp' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-consumption-tax categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies', merchant_name: 'Bento Shop' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── JP-002: Qualified Invoice Registration Number ────────────────────────

  describe('JP-002: Qualified Invoice Registration Number', () => {
    it('should produce WARNING for JPY >¥10000 without qualified invoice', () => {
      const tx = makeTx({ id: 'tx-inv1', amount: 15000, currency: 'JPY', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('qualified invoice');
    });

    it('should NOT flag JPY >¥10000 WITH document', () => {
      const tx = makeTx({ amount: 50000, currency: 'JPY', document_status: 'found' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-002');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag JPY ≤¥10000', () => {
      const tx = makeTx({ amount: 10000, currency: 'JPY', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-002');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-JPY transactions', () => {
      const tx = makeTx({ amount: 50000, currency: 'USD', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-002');
      expect(v).toHaveLength(0);
    });
  });

  // ─── JP-003: Withholding Tax on Contractors ───────────────────────────────

  describe('JP-003: Withholding Tax on Contractors', () => {
    it('should produce WARNING for contractor payment in JPY under ¥1M', () => {
      const tx = makeTx({ id: 'tx-wh1', amount: 500000, currency: 'JPY', category_human: 'contractor_fee' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('10.21%');
    });

    it('should use higher rate for payments ≥¥1M', () => {
      const tx = makeTx({ id: 'tx-wh2', amount: 1500000, currency: 'JPY', category_human: 'freelancer_payment' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('20.42%');
    });

    it('should flag consultant payments', () => {
      const tx = makeTx({ id: 'tx-wh3', amount: 300000, currency: 'JPY', category_ai: 'consultant_fee', category_human: null });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-003');
      expect(v).toBeDefined();
    });

    it('should NOT flag non-JPY contractor payments', () => {
      const tx = makeTx({ amount: 500000, currency: 'USD', category_human: 'contractor_fee' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-contractor categories', () => {
      const tx = makeTx({ amount: 500000, currency: 'JPY', category_human: 'Office Supplies' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── JP-004: Fiscal Year Alignment ────────────────────────────────────────

  describe('JP-004: Fiscal Year Alignment', () => {
    it('should produce INFO when fiscal year start is not April', () => {
      const config = makeConfig({ fiscalYearStart: '01-01' });
      const result = japanPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'JP-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('01-01');
    });

    it('should NOT flag standard April 1 fiscal year', () => {
      const config = makeConfig({ fiscalYearStart: '04-01' });
      const result = japanPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'JP-004');
      expect(v).toHaveLength(0);
    });

    it('should produce WARNING for transactions with invalid dates', () => {
      const tx = makeTx({ id: 'tx-bad-date', date: 'not-a-date' });
      const config = makeConfig({ fiscalYearStart: '04-01' });
      const result = japanPlugin.check([tx], config);

      const v = result.violations.find((v) => v.ruleId === 'JP-004' && v.severity === 'warning');
      expect(v).toBeDefined();
      expect(v!.message).toContain('invalid date');
    });

    it('should NOT flag transactions with valid dates', () => {
      const tx = makeTx({ date: '2025-06-15' });
      const config = makeConfig({ fiscalYearStart: '04-01' });
      const result = japanPlugin.check([tx], config);

      const v = result.violations.filter((v) => v.ruleId === 'JP-004');
      expect(v).toHaveLength(0);
    });

    it('should default to April when no fiscalYearStart is provided', () => {
      const config = makeConfig({ fiscalYearStart: undefined });
      const result = japanPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'JP-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── JP-005: Electronic Record-Keeping (Denshichobo) ─────────────────────

  describe('JP-005: Electronic Record-Keeping (Denshichobo)', () => {
    it('should produce WARNING for JPY >¥30000 without documentation', () => {
      const tx = makeTx({ id: 'tx-dk1', amount: 50000, currency: 'JPY', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-005' && v.severity === 'warning');
      expect(v).toBeDefined();
      expect(v!.message).toContain('Denshichobo');
    });

    it('should produce INFO per-transaction for missing docs', () => {
      const tx = makeTx({ id: 'tx-dk2', amount: 50000, currency: 'JPY', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-005' && v.severity === 'info');
      expect(v).toBeDefined();
      expect(v!.transactionId).toBe('tx-dk2');
    });

    it('should NOT flag JPY >¥30000 WITH documentation', () => {
      const tx = makeTx({ amount: 50000, currency: 'JPY', document_status: 'found' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag JPY ≤¥30000 without documentation', () => {
      const tx = makeTx({ amount: 30000, currency: 'JPY', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-JPY transactions', () => {
      const tx = makeTx({ amount: 50000, currency: 'USD', document_status: 'missing' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-005');
      expect(v).toHaveLength(0);
    });
  });

  // ─── JP-006: Cross-Border Digital Service Tax ─────────────────────────────

  describe('JP-006: Cross-Border Digital Service Tax', () => {
    it('should produce INFO for digital service from foreign provider (non-JPY)', () => {
      const tx = makeTx({ id: 'tx-cb1', category_human: 'software_license', currency: 'USD', merchant_name: 'DevTools Inc' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('cross-border digital service');
    });

    it('should flag SaaS from known foreign provider (e.g., Google)', () => {
      const tx = makeTx({ id: 'tx-cb2', category_human: 'saas_subscription', currency: 'JPY', merchant_name: 'Google Cloud' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should flag cloud subscription from Microsoft', () => {
      const tx = makeTx({ id: 'tx-cb3', category_human: 'cloud_hosting', currency: 'JPY', merchant_name: 'Microsoft Azure' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'JP-006');
      expect(v).toBeDefined();
    });

    it('should NOT flag digital service from domestic provider in JPY', () => {
      const tx = makeTx({ category_human: 'software_license', currency: 'JPY', merchant_name: 'Tokyo Software KK' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-digital-service categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies', currency: 'USD', merchant_name: 'Amazon' });
      const result = japanPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'JP-006');
      expect(v).toHaveLength(0);
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5)', () => {
      const txs = [
        // JP-002 warning: JPY >¥10k without invoice
        makeTx({ id: 'w1', amount: 15000, currency: 'JPY', document_status: 'missing' }),
        // JP-003 warning: contractor payment
        makeTx({ id: 'w2', amount: 200000, currency: 'JPY', category_human: 'contractor_fee' }),
      ];

      const result = japanPlugin.check(txs, makeConfig());

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 5000, currency: 'JPY', document_status: 'found', category_human: 'Office Supplies' }),
        makeTx({ amount: 3000, currency: 'JPY', document_status: 'found', category_human: 'Stationery' }),
      ];

      const result = japanPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      const txs = Array.from({ length: 20 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          amount: 50000,
          currency: 'JPY',
          document_status: 'missing',
          category_human: 'contractor_fee',
        })
      );

      const result = japanPlugin.check(txs, makeConfig());
      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 5000,
          currency: 'JPY',
          document_status: 'found',
          category_human: 'Office Supplies',
          merchant_name: 'Tokyo Office KK',
        }),
        makeTx({
          amount: 3000,
          currency: 'JPY',
          document_status: 'found',
          category_human: 'Equipment',
          merchant_name: 'Osaka Tech',
        }),
      ];

      const result = japanPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('japan');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = japanPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'japan');
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
