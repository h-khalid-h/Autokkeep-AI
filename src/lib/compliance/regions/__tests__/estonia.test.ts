import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { estoniaPlugin } from '../estonia';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    currency: 'EUR',
    date: '2025-06-01',
    merchant_name: 'Acme OÜ',
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
    region: 'estonia',
    currency: 'EUR',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Estonia Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to a date that does NOT trigger VAT filing or annual report reminders
    vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(estoniaPlugin.region).toBe('estonia');
    expect(estoniaPlugin.name).toBe('Estonia Compliance Module');
    expect(estoniaPlugin.rules).toHaveLength(6);
    expect(estoniaPlugin.rules.map((r) => r.id)).toEqual([
      'EE-001', 'EE-002', 'EE-003', 'EE-004', 'EE-005', 'EE-006',
    ]);
  });

  // ─── EE-001: E-Invoice Required (B2B > €1,000) ─────────────────────────────

  describe('EE-001: E-Invoice Required (B2B > €1,000)', () => {
    it('should produce VIOLATION for EUR expense >€1000 without e-invoice', () => {
      const tx = makeTx({ id: 'tx-001', amount: 1500, currency: 'EUR', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.transactionId).toBe('tx-001');
      expect(v!.message).toContain('€1500.00');
    });

    it('should NOT flag EUR expense >€1000 WITH e-invoice', () => {
      const tx = makeTx({ id: 'tx-002', amount: 2000, currency: 'EUR', document_status: 'found' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag EUR expense ≤€1000 without e-invoice', () => {
      const tx = makeTx({ id: 'tx-003', amount: 1000, currency: 'EUR', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-EUR transactions', () => {
      const tx = makeTx({ amount: 5000, currency: 'USD', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── EE-002: VAT Rate Validation ──────────────────────────────────────────────

  describe('EE-002: VAT Rate Validation', () => {
    it('should produce WARNING for unrecognized VAT category', () => {
      const tx = makeTx({ id: 'tx-vat', category_human: 'vat_15' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('vat_15');
    });

    it('should NOT flag valid VAT categories', () => {
      const validCategories = ['vat_standard_20', 'vat_reduced_9', 'vat_exempt_0', 'vat_20', 'vat_9', 'vat_0'];
      for (const cat of validCategories) {
        const tx = makeTx({ category_human: cat });
        const result = estoniaPlugin.check([tx], makeConfig());

        const v = result.violations.filter((v) => v.ruleId === 'EE-002');
        expect(v).toHaveLength(0);
      }
    });

    it('should NOT flag non-VAT categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-002');
      expect(v).toHaveLength(0);
    });

    it('should check category_ai when category_human is null', () => {
      const tx = makeTx({ category_human: null, category_ai: 'vat_25' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });
  });

  // ─── EE-003: EU VAT Reverse Charge ───────────────────────────────────────────

  describe('EE-003: EU VAT Reverse Charge', () => {
    it('should produce WARNING for intra-EU non-EUR purchase without reverse charge', () => {
      const tx = makeTx({ id: 'tx-eu', currency: 'PLN', amount: 500, category_human: 'software_license' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('PLN');
    });

    it('should NOT flag intra-EU purchase WITH reverse charge categorization', () => {
      const tx = makeTx({ currency: 'SEK', amount: 500, category_human: 'reverse_charge_services' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag EUR transactions', () => {
      const tx = makeTx({ currency: 'EUR', amount: 500, category_human: 'software' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-EU currencies', () => {
      const tx = makeTx({ currency: 'USD', amount: 500, category_human: 'software' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag zero or negative amounts', () => {
      const tx = makeTx({ currency: 'PLN', amount: 0, category_human: 'software' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── EE-004: Receipt/Invoice Required (> €20) ──────────────────────────────

  describe('EE-004: Receipt/Invoice Required (> €20)', () => {
    it('should produce VIOLATION for EUR expense >€100 without receipt', () => {
      const tx = makeTx({ id: 'tx-doc1', amount: 150, currency: 'EUR', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('€150.00');
    });

    it('should produce WARNING for EUR expense >€20 and ≤€100 without receipt', () => {
      const tx = makeTx({ id: 'tx-doc2', amount: 50, currency: 'EUR', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag EUR expense ≤€20 without receipt', () => {
      const tx = makeTx({ amount: 20, currency: 'EUR', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag EUR expense >€20 WITH receipt', () => {
      const tx = makeTx({ amount: 500, currency: 'EUR', document_status: 'found' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-EUR transactions', () => {
      const tx = makeTx({ amount: 200, currency: 'USD', document_status: 'missing' });
      const result = estoniaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── EE-005: Quarterly VAT Filing Reminder ──────────────────────────────────

  describe('EE-005: Quarterly VAT Filing Reminder', () => {
    it('should trigger INFO for e-residency entity in VAT filing month (Jan) before 20th', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      const config = makeConfig({ registrationType: 'e-residency' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'EE-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('Quarterly VAT filing');
    });

    it('should trigger INFO for e-residency entity in VAT filing month (Apr) before 20th', () => {
      vi.setSystemTime(new Date('2025-04-10T12:00:00Z'));
      const config = makeConfig({ registrationType: 'e-residency' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'EE-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should trigger INFO for e-residency entity in VAT filing month (Jul) on 20th', () => {
      vi.setSystemTime(new Date('2025-07-20T12:00:00Z'));
      const config = makeConfig({ registrationType: 'e-residency' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'EE-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should NOT trigger for e-residency entity in VAT filing month AFTER 20th', () => {
      vi.setSystemTime(new Date('2025-01-21T12:00:00Z'));
      const config = makeConfig({ registrationType: 'e-residency' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'EE-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger for e-residency entity outside VAT filing months', () => {
      vi.setSystemTime(new Date('2025-02-10T12:00:00Z'));
      const config = makeConfig({ registrationType: 'e-residency' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'EE-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger for non-e-residency entities', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      const config = makeConfig({ registrationType: 'standard' });
      const result = estoniaPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'EE-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger when registrationType is undefined', () => {
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
      const config = makeConfig();
      const result = estoniaPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'EE-005');
      expect(v).toHaveLength(0);
    });
  });

  // ─── EE-006: Annual Report Deadline ──────────────────────────────────────────

  describe('EE-006: Annual Report Deadline', () => {
    it('should trigger WARNING in late May (May 15–31)', () => {
      vi.setSystemTime(new Date('2025-05-20T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-006');
      expect(v).toBeDefined();
      expect(v!.message).toContain('June 30');
    });

    it('should trigger in June', () => {
      vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-006');
      expect(v).toBeDefined();
      expect(v!.message).toContain('June 30');
    });

    it('should trigger VIOLATION when ≤7 days remaining (late June)', () => {
      vi.setSystemTime(new Date('2025-06-25T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it('should trigger WARNING when >7 days remaining (early June)', () => {
      vi.setSystemTime(new Date('2025-06-10T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'EE-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT trigger before May 15', () => {
      vi.setSystemTime(new Date('2025-05-14T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger in July or later', () => {
      vi.setSystemTime(new Date('2025-07-01T12:00:00Z'));
      const result = estoniaPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'EE-006');
      expect(v).toHaveLength(0);
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5)', () => {
      const txs = [
        // EE-001 violation: >€1000 no e-invoice
        makeTx({ id: 'v1', amount: 1500, currency: 'EUR', document_status: 'missing', notes: 'test' }),
        // EE-003 warning: intra-EU non-EUR without reverse charge
        makeTx({ id: 'w1', amount: 200, currency: 'PLN', document_status: 'found', category_human: 'software' }),
      ];

      const result = estoniaPlugin.check(txs, makeConfig());

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 15, currency: 'EUR', document_status: 'found', category_human: 'Office Supplies' }),
        makeTx({ amount: 10, currency: 'EUR', document_status: 'found', category_human: 'Stationery' }),
      ];

      const result = estoniaPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          amount: 2000,
          currency: 'EUR',
          document_status: 'missing',
        })
      );

      const result = estoniaPlugin.check(txs, makeConfig());
      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 15,
          currency: 'EUR',
          document_status: 'found',
          category_human: 'Office Supplies',
          merchant_name: 'Staples OÜ',
        }),
        makeTx({
          amount: 10,
          currency: 'EUR',
          document_status: 'found',
          category_human: 'Stationery',
          merchant_name: 'Paper Co',
        }),
      ];

      const result = estoniaPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('estonia');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = estoniaPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'estonia');
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
