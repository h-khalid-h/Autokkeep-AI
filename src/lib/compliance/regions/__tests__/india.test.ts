import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { indiaPlugin } from '../india';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    currency: 'INR',
    date: '2025-06-01',
    merchant_name: 'Acme India Pvt Ltd',
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
    region: 'india',
    currency: 'INR',
    taxId: '22AAAAA0000A1Z5', // Valid GSTIN
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('India Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(indiaPlugin.region).toBe('india');
    expect(indiaPlugin.name).toBe('India Compliance Module');
    expect(indiaPlugin.rules).toHaveLength(7);
    expect(indiaPlugin.rules.map((r) => r.id)).toEqual([
      'IN-001', 'IN-002', 'IN-003', 'IN-004', 'IN-005', 'IN-006', 'IN-007',
    ]);
  });

  // ─── IN-001: GST Rate Validation ──────────────────────────────────────────

  describe('IN-001: GST Rate Validation', () => {
    it('should produce VIOLATION for invalid GST rate', () => {
      const tx = makeTx({ id: 'tx-gst1', category_human: 'gst_15' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('15%');
      expect(v!.message).toContain('not a valid Indian GST slab');
    });

    it('should produce VIOLATION for another invalid GST rate (gst_10)', () => {
      const tx = makeTx({ id: 'tx-gst2', category_ai: 'gst_10', category_human: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
    });

    it.each([0, 5, 12, 18, 28])('should NOT flag valid GST rate %d%%', (rate) => {
      const tx = makeTx({ category_human: `gst_${rate}` });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-GST categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-002: GSTIN Format Validation ──────────────────────────────────────

  describe('IN-002: GSTIN Format Validation', () => {
    it('should produce VIOLATION for invalid GSTIN format', () => {
      const config = makeConfig({ taxId: 'INVALID123' });
      const result = indiaPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'IN-002' && v.severity === 'violation');
      expect(v).toBeDefined();
      expect(v!.message).toContain('INVALID123');
    });

    it('should produce WARNING when no GSTIN is configured', () => {
      const config = makeConfig({ taxId: undefined });
      const result = indiaPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'IN-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('No GSTIN configured');
    });

    it('should NOT flag valid GSTIN format', () => {
      const config = makeConfig({ taxId: '22AAAAA0000A1Z5' });
      const result = indiaPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'IN-002');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-003: HSN/SAC Code Requirement ────────────────────────────────────

  describe('IN-003: HSN/SAC Code Requirement', () => {
    it('should produce WARNING for INR >₹5000 without GL code', () => {
      const tx = makeTx({ id: 'tx-hsn', amount: 10000, currency: 'INR', gl_code: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('HSN/SAC');
    });

    it('should NOT flag INR >₹5000 WITH GL code', () => {
      const tx = makeTx({ amount: 10000, currency: 'INR', gl_code: 'HSN8471' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag INR ≤₹5000 without GL code', () => {
      const tx = makeTx({ amount: 5000, currency: 'INR', gl_code: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-003');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-INR transactions', () => {
      const tx = makeTx({ amount: 10000, currency: 'USD', gl_code: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-004: TDS on Contractor Payments ──────────────────────────────────

  describe('IN-004: TDS on Contractor Payments', () => {
    it('should produce WARNING for contractor payment >₹30000', () => {
      const tx = makeTx({ id: 'tx-tds', amount: 50000, currency: 'INR', category_human: 'contractor_payment' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('TDS');
    });

    it('should flag freelancer payments >₹30000', () => {
      const tx = makeTx({ id: 'tx-fl', amount: 40000, currency: 'INR', category_human: 'freelancer_fee' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should flag consultant payments via category_ai', () => {
      const tx = makeTx({ id: 'tx-con', amount: 35000, currency: 'INR', category_ai: 'consultant_fee', category_human: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-004');
      expect(v).toBeDefined();
    });

    it('should NOT flag contractor payment ≤₹30000', () => {
      const tx = makeTx({ amount: 30000, currency: 'INR', category_human: 'contractor_payment' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-INR contractor payments', () => {
      const tx = makeTx({ amount: 50000, currency: 'USD', category_human: 'contractor_payment' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-contractor categories', () => {
      const tx = makeTx({ amount: 50000, currency: 'INR', category_human: 'Office Supplies' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-005: PAN Validation for High-Value Transactions ──────────────────

  describe('IN-005: PAN Validation for High-Value Transactions', () => {
    it('should produce WARNING for INR >₹50000 without documentation', () => {
      const tx = makeTx({ id: 'tx-pan1', amount: 60000, currency: 'INR', document_status: 'missing' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-005' && v.severity === 'warning');
      expect(v).toBeDefined();
      expect(v!.message).toContain('₹50,000');
    });

    it('should also produce INFO per-transaction detail for high-value transactions', () => {
      const tx = makeTx({ id: 'tx-pan2', amount: 60000, currency: 'INR', document_status: 'missing' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-005' && v.severity === 'info');
      expect(v).toBeDefined();
      expect(v!.transactionId).toBe('tx-pan2');
    });

    it('should NOT flag INR >₹50000 WITH documentation', () => {
      const tx = makeTx({ amount: 60000, currency: 'INR', document_status: 'found' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag INR ≤₹50000 without documentation', () => {
      const tx = makeTx({ amount: 50000, currency: 'INR', document_status: 'missing' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-005');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-INR transactions', () => {
      const tx = makeTx({ amount: 60000, currency: 'USD', document_status: 'missing' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-005');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-006: E-Invoicing Mandate ─────────────────────────────────────────

  describe('IN-006: E-Invoicing Mandate', () => {
    it('should produce VIOLATION for e_invoice_mandatory entity with missing invoices', () => {
      const tx = makeTx({ id: 'tx-ei', amount: 15000, currency: 'INR', document_status: 'missing' });
      const config = makeConfig({ registrationType: 'e_invoice_mandatory' });
      const result = indiaPlugin.check([tx], config);

      const v = result.violations.find((v) => v.ruleId === 'IN-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('e-invoices');
    });

    it('should NOT flag when registrationType is not e_invoice_mandatory', () => {
      const tx = makeTx({ amount: 15000, currency: 'INR', document_status: 'missing' });
      const config = makeConfig({ registrationType: 'standard' });
      const result = indiaPlugin.check([tx], config);

      const v = result.violations.filter((v) => v.ruleId === 'IN-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag when all invoices are present', () => {
      const tx = makeTx({ amount: 15000, currency: 'INR', document_status: 'found' });
      const config = makeConfig({ registrationType: 'e_invoice_mandatory' });
      const result = indiaPlugin.check([tx], config);

      const v = result.violations.filter((v) => v.ruleId === 'IN-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag INR ≤₹10000 without invoice for e_invoice_mandatory', () => {
      const tx = makeTx({ amount: 10000, currency: 'INR', document_status: 'missing' });
      const config = makeConfig({ registrationType: 'e_invoice_mandatory' });
      const result = indiaPlugin.check([tx], config);

      const v = result.violations.filter((v) => v.ruleId === 'IN-006');
      expect(v).toHaveLength(0);
    });
  });

  // ─── IN-007: Reverse Charge Mechanism (RCM) ─────────────────────────────

  describe('IN-007: Reverse Charge Mechanism (RCM)', () => {
    it('should produce WARNING for legal service without RCM tag', () => {
      const tx = makeTx({ id: 'tx-rcm1', category_human: 'legal_services' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-007');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('Reverse Charge');
    });

    it('should flag goods_transport service without RCM tag', () => {
      const tx = makeTx({ id: 'tx-rcm2', category_ai: 'goods_transport_agency', category_human: null });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-007');
      expect(v).toBeDefined();
    });

    it('should flag by merchant name containing RCM keyword', () => {
      const tx = makeTx({ id: 'tx-rcm3', merchant_name: 'Security Guard Services', category_human: 'general' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'IN-007');
      expect(v).toBeDefined();
    });

    it('should NOT flag RCM service WITH rcm/reverse_charge tag', () => {
      const tx = makeTx({ category_human: 'legal_services_rcm' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-007');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag RCM service WITH reverse_charge tag', () => {
      const tx = makeTx({ category_human: 'reverse_charge_legal' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-007');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag non-RCM categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies', merchant_name: 'Stationery Shop' });
      const result = indiaPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'IN-007');
      expect(v).toHaveLength(0);
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5)', () => {
      const txs = [
        // IN-001 violation: invalid GST rate
        makeTx({ id: 'v1', category_human: 'gst_15' }),
        // IN-004 warning: contractor >30k
        makeTx({ id: 'w1', amount: 40000, currency: 'INR', category_human: 'contractor_payment' }),
      ];

      const result = indiaPlugin.check(txs, makeConfig());

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 50, currency: 'INR', document_status: 'found', category_human: 'Office Supplies', gl_code: 'G100' }),
        makeTx({ amount: 30, currency: 'INR', document_status: 'found', category_human: 'Stationery', gl_code: 'G101' }),
      ];

      const result = indiaPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          category_human: `gst_${7 + i}`, // All invalid GST rates
        })
      );

      const result = indiaPlugin.check(txs, makeConfig());
      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 200,
          currency: 'INR',
          document_status: 'found',
          category_human: 'Office Supplies',
          merchant_name: 'Paper Mart',
          gl_code: 'HSN4820',
        }),
        makeTx({
          amount: 45,
          currency: 'INR',
          document_status: 'found',
          category_human: 'Equipment',
          merchant_name: 'Tech India',
          gl_code: 'HSN8471',
        }),
      ];

      const result = indiaPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('india');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = indiaPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'india');
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
