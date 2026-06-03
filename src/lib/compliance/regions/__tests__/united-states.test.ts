import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  TransactionForCompliance,
  EntityComplianceConfig,
} from '../../types';
import { unitedStatesPlugin } from '../united-states';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionForCompliance> = {}): TransactionForCompliance {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    amount: 50,
    currency: 'USD',
    date: '2025-06-01',
    merchant_name: 'Acme Corp',
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
    region: 'united_states',
    currency: 'USD',
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('United States Compliance Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Default to a date that does NOT trigger estimated tax or FY-end reminders
    vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Metadata ───────────────────────────────────────────────────────────────

  it('should expose correct plugin metadata', () => {
    expect(unitedStatesPlugin.region).toBe('united_states');
    expect(unitedStatesPlugin.name).toBe('United States Compliance Module');
    expect(unitedStatesPlugin.rules).toHaveLength(6);
    expect(unitedStatesPlugin.rules.map((r) => r.id)).toEqual([
      'US-001', 'US-002', 'US-003', 'US-004', 'US-005', 'US-006',
    ]);
  });

  // ─── US-001: Receipt Substantiation ─────────────────────────────────────────

  describe('US-001: Receipt Substantiation (>$75)', () => {
    it('should produce WARNING for expense >$75 and ≤$250 without receipt', () => {
      const tx = makeTx({ id: 'tx-001', amount: 100, document_status: 'missing' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.transactionId).toBe('tx-001');
      expect(v!.message).toContain('$100.00');
      expect(v!.message).toContain('$75');
    });

    it('should produce VIOLATION for expense >$250 without receipt', () => {
      const tx = makeTx({ id: 'tx-002', amount: 300, document_status: null });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-001');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('$300.00');
      expect(v!.message).toContain('$250');
    });

    it('should NOT flag expense ≤$75 without receipt', () => {
      const tx = makeTx({ id: 'tx-003', amount: 75, document_status: 'missing' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-001');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag expense >$75 WITH receipt', () => {
      const tx = makeTx({ id: 'tx-004', amount: 200, document_status: 'found' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-001');
      expect(v).toHaveLength(0);
    });

    it('should skip non-USD transactions', () => {
      const tx = makeTx({ amount: 300, currency: 'EUR', document_status: 'missing' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-001');
      expect(v).toHaveLength(0);
    });
  });

  // ─── US-002: Meals Deductibility ──────────────────────────────────────────────

  describe('US-002: Meals Deductibility Review', () => {
    const mealCategories = ['Meals', 'Entertainment', 'Dining', 'Restaurant', 'Food & Drink'];

    it.each(mealCategories)('should flag category "%s" as INFO', (category) => {
      const tx = makeTx({ id: 'tx-meal', category_human: category });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.transactionId).toBe('tx-meal');
    });

    it('should match meals keyword in category_ai when category_human is null', () => {
      const tx = makeTx({ category_ai: 'Business Dining', category_human: null });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-002');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should NOT flag non-meals categories', () => {
      const tx = makeTx({ category_human: 'Office Supplies' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-002');
      expect(v).toHaveLength(0);
    });
  });

  // ─── US-003: 1099-NEC Threshold Monitoring ───────────────────────────────────

  describe('US-003: 1099-NEC Threshold Monitoring', () => {
    it('should produce VIOLATION when vendor cumulative payments ≥$600', () => {
      const txs = [
        makeTx({ merchant_name: 'Freelancer LLC', amount: 350, currency: 'USD' }),
        makeTx({ merchant_name: 'Freelancer LLC', amount: 300, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('violation');
      expect(v!.message).toContain('$650.00');
      expect(v!.message).toContain('2 transaction(s)');
    });

    it('should produce WARNING when vendor cumulative payments ≥$400 and <$600', () => {
      const txs = [
        makeTx({ merchant_name: 'Designer Co', amount: 250, currency: 'USD' }),
        makeTx({ merchant_name: 'Designer Co', amount: 200, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-003');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.message).toContain('$450.00');
      expect(v!.message).toContain('approaching');
    });

    it('should NOT flag vendor with cumulative payments <$400', () => {
      const txs = [
        makeTx({ merchant_name: 'Small Vendor', amount: 100, currency: 'USD' }),
        makeTx({ merchant_name: 'Small Vendor', amount: 100, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-003');
      expect(v).toHaveLength(0);
    });

    it('should normalize vendor names for grouping (case-insensitive)', () => {
      const txs = [
        makeTx({ merchant_name: 'Acme Corp', amount: 350, currency: 'USD' }),
        makeTx({ merchant_name: 'ACME CORP', amount: 300, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-003');
      // Both should be grouped under one vendor
      expect(v).toHaveLength(1);
      expect(v[0].severity).toBe('violation');
    });

    it('should skip non-USD and zero/negative amount transactions', () => {
      const txs = [
        makeTx({ merchant_name: 'Euro Vendor', amount: 700, currency: 'EUR' }),
        makeTx({ merchant_name: 'Refund Co', amount: -500, currency: 'USD' }),
        makeTx({ merchant_name: 'Refund Co', amount: 0, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-003');
      expect(v).toHaveLength(0);
    });

    it('should skip transactions with no merchant name', () => {
      const txs = [
        makeTx({ merchant_name: null, amount: 700, currency: 'USD' }),
        makeTx({ merchant_name: '', amount: 700, currency: 'USD' }),
      ];
      const result = unitedStatesPlugin.check(txs, makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-003');
      expect(v).toHaveLength(0);
    });
  });

  // ─── US-004: Business Purpose Documentation ──────────────────────────────────

  describe('US-004: Business Purpose Documentation', () => {
    it('should produce WARNING for expense >$75 without notes', () => {
      const tx = makeTx({ id: 'tx-no-notes', amount: 100, notes: null });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
      expect(v!.transactionId).toBe('tx-no-notes');
      expect(v!.message).toContain('lacks business purpose');
    });

    it('should produce WARNING for expense >$75 with empty/whitespace notes', () => {
      const tx = makeTx({ id: 'tx-empty-notes', amount: 100, notes: '   ' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-004');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('warning');
    });

    it('should NOT flag expense >$75 with valid notes', () => {
      const tx = makeTx({ amount: 200, notes: 'Client dinner' });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-004');
      expect(v).toHaveLength(0);
    });

    it('should NOT flag expense ≤$75 without notes', () => {
      const tx = makeTx({ amount: 50, notes: null });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-004');
      expect(v).toHaveLength(0);
    });

    it('should skip non-USD transactions', () => {
      const tx = makeTx({ amount: 200, currency: 'GBP', notes: null });
      const result = unitedStatesPlugin.check([tx], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-004');
      expect(v).toHaveLength(0);
    });
  });

  // ─── US-005: Estimated Tax Payment Reminder ──────────────────────────────────

  describe('US-005: Estimated Tax Payment Reminder', () => {
    it('should trigger INFO when within 30 days of Apr 15 due date', () => {
      // Set date to March 20 — 26 days before Apr 15
      vi.setSystemTime(new Date('2025-03-20T12:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('04/15');
    });

    it('should trigger INFO when within 30 days of Jun 15 due date', () => {
      // Set date to June 1 — 14 days before Jun 15
      vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('06/15');
    });

    it('should trigger INFO when within 30 days of Sep 15 due date', () => {
      // Set date to Sep 1 — 14 days before Sep 15
      vi.setSystemTime(new Date('2025-09-01T12:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.find((v) => v.ruleId === 'US-005');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('09/15');
    });

    it('should trigger INFO for Jan 15 when in late December (year boundary)', () => {
      // Set date to Dec 20 — ~26 days before Jan 15 of next year
      vi.setSystemTime(new Date('2025-12-20T12:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.find(
        (v) => v.ruleId === 'US-005' && v.message.includes('01/15')
      );
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('2026'); // Next year for Jan 15
    });

    it('should NOT trigger when more than 30 days from any due date', () => {
      // Aug 1 — not within 30 days of any due date
      vi.setSystemTime(new Date('2025-08-01T12:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.filter((v) => v.ruleId === 'US-005');
      expect(v).toHaveLength(0);
    });

    it('should trigger on the exact due date (0 days remaining)', () => {
      vi.setSystemTime(new Date('2025-04-15T00:00:00Z'));

      const result = unitedStatesPlugin.check([], makeConfig());

      const v = result.violations.find(
        (v) => v.ruleId === 'US-005' && v.message.includes('04/15')
      );
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });
  });

  // ─── US-006: Fiscal Year-End Reporting ────────────────────────────────────────

  describe('US-006: Fiscal Year-End Reporting', () => {
    it('should trigger INFO when within 60 days of fiscal year-end', () => {
      // FY end is Sep 30; set date to Aug 15 — ~46 days away
      vi.setSystemTime(new Date('2025-08-15T12:00:00Z'));

      const config = makeConfig({ fiscalYearStart: '09-30' });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'US-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
      expect(v!.message).toContain('09/30');
      expect(v!.message).toContain('year-end');
    });

    it('should trigger for Dec 31 calendar year-end', () => {
      // Set date to Nov 15 — ~46 days from Dec 31
      vi.setSystemTime(new Date('2025-11-15T12:00:00Z'));

      const config = makeConfig({ fiscalYearStart: '12-31' });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'US-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });

    it('should NOT trigger when more than 60 days from fiscal year-end', () => {
      // FY end is Dec 31; set date to May 1 — >200 days away
      vi.setSystemTime(new Date('2025-05-01T12:00:00Z'));

      const config = makeConfig({ fiscalYearStart: '12-31' });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'US-006');
      expect(v).toHaveLength(0);
    });

    it('should NOT trigger when no fiscalYearStart is configured', () => {
      const config = makeConfig({ fiscalYearStart: undefined });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'US-006');
      expect(v).toHaveLength(0);
    });

    it('should handle invalid fiscal year date format gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const config = makeConfig({ fiscalYearStart: 'invalid' });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.filter((v) => v.ruleId === 'US-006');
      expect(v).toHaveLength(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should roll to next year when fiscal year-end date has passed', () => {
      // FY end is Mar 31; set date to Feb 15 of 2026 — should look at Mar 31 2026
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));

      const config = makeConfig({ fiscalYearStart: '03-31' });
      const result = unitedStatesPlugin.check([], config);

      const v = result.violations.find((v) => v.ruleId === 'US-006');
      expect(v).toBeDefined();
      expect(v!.severity).toBe('info');
    });
  });

  // ─── Score Calculation ────────────────────────────────────────────────────────

  describe('Score calculation', () => {
    it('should compute score as 100 - (violations × 15) - (warnings × 5) - (info × 1)', () => {
      // Create transactions that produce exactly:
      // 1 violation (>$250 no receipt)
      // 1 warning (>$75 ≤$250 no receipt — already counted above, use US-004 instead)
      // 1 info (meals category)
      const txs = [
        // US-001 violation: >$250 no receipt
        makeTx({ id: 'v1', amount: 300, document_status: 'missing', notes: 'has notes' }),
        // US-004 warning: >$75 no notes (but has receipt)
        makeTx({ id: 'w1', amount: 100, document_status: 'found', notes: null }),
        // US-002 info: meals category
        makeTx({ id: 'i1', amount: 30, category_human: 'Meals', document_status: 'found', notes: 'lunch' }),
      ];

      const result = unitedStatesPlugin.check(txs, makeConfig());

      // The $300 no-receipt tx also triggers US-004 (no notes? no, it has notes)
      // So we expect: US-001 violation (1), US-001 warning (none, it's >250 so violation),
      // Actually re-check: amount 300 > 250 → violation on US-001
      // w1: amount 100 > 75, notes null → US-004 warning
      // i1: category 'Meals' → US-002 info

      // But v1 also triggers US-001 warning? No, it's >250 so severity='violation'
      // v1 with document_status='missing' and amount=300 → US-001 violation
      // v1 with notes='has notes' → no US-004
      // w1 with document_status='found' → no US-001
      // w1 with notes=null and amount=100 → US-004 warning

      const violationCount = result.violations.filter((v) => v.severity === 'violation').length;
      const warningCount = result.violations.filter((v) => v.severity === 'warning').length;
      const infoCount = result.violations.filter((v) => v.severity === 'info').length;

      const expectedScore = Math.max(0, 100 - violationCount * 15 - warningCount * 5 - infoCount * 1);
      expect(result.score).toBe(expectedScore);
    });

    it('should return 100 for clean data with no issues', () => {
      const txs = [
        makeTx({ amount: 50, document_status: 'found', notes: 'Office pens', category_human: 'Office Supplies' }),
        makeTx({ amount: 30, document_status: 'found', notes: 'Printer ink', category_human: 'Office Supplies' }),
      ];

      const result = unitedStatesPlugin.check(txs, makeConfig());

      expect(result.violations).toHaveLength(0);
      expect(result.score).toBe(100);
    });

    it('should clamp score at 0 for many violations', () => {
      // Create 10 transactions each >$250 without receipts → 10 violations × 15 = 150 → clamped to 0
      const txs = Array.from({ length: 10 }, (_, i) =>
        makeTx({
          id: `tx-heavy-${i}`,
          amount: 500,
          document_status: 'missing',
          notes: 'has notes', // Avoid US-004 too
          merchant_name: `Vendor ${i}`, // Different vendors to avoid US-003
        })
      );

      const result = unitedStatesPlugin.check(txs, makeConfig());

      expect(result.score).toBe(0);
    });
  });

  // ─── Clean Data / Happy Path ──────────────────────────────────────────────────

  describe('Clean data returns high score', () => {
    it('should return score 100 and zero violations for fully compliant transactions', () => {
      const txs = [
        makeTx({
          amount: 200,
          currency: 'USD',
          document_status: 'found',
          notes: 'Team meeting supplies',
          category_human: 'Office Supplies',
          merchant_name: 'Staples',
        }),
        makeTx({
          amount: 45,
          currency: 'USD',
          document_status: 'found',
          notes: 'Printer toner',
          category_human: 'Office Equipment',
          merchant_name: 'Best Buy',
        }),
      ];

      const result = unitedStatesPlugin.check(txs, makeConfig());

      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.region).toBe('united_states');
      expect(result.checkedAt).toBeTruthy();
      expect(result.summary).toContain('0 issue(s) found');
    });
  });

  // ─── Result Shape ─────────────────────────────────────────────────────────────

  describe('Result structure', () => {
    it('should return properly shaped ComplianceCheckResult', () => {
      const result = unitedStatesPlugin.check([], makeConfig());

      expect(result).toHaveProperty('region', 'united_states');
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
