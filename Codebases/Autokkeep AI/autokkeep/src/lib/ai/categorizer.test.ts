import { describe, it, expect } from 'vitest';
import { categorizeDeterministic } from './categorizer';
import type { TransactionInput, CategorizationRule } from './categorizer';

// ============================================
// Test fixtures
// ============================================
const makeRule = (overrides: Partial<CategorizationRule> = {}): CategorizationRule => ({
  id: 'rule-1',
  vendor_pattern: 'starbucks',
  gl_code: '6200',
  gl_name: 'Meals & Entertainment',
  match_type: 'contains',
  priority: 10,
  ...overrides,
});

const makeTx = (overrides: Partial<TransactionInput> = {}): TransactionInput => ({
  id: 'tx-1',
  merchant: 'STARBUCKS #12345 SEATTLE',
  amount: 5.50,
  date: '2026-01-15',
  ...overrides,
});

// ============================================
// categorizeDeterministic
// ============================================
describe('categorizeDeterministic', () => {
  describe('contains match', () => {
    it('matches merchant containing pattern (case-insensitive)', () => {
      const rule = makeRule({ vendor_pattern: 'starbucks', match_type: 'contains' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).not.toBeNull();
      expect(result!.glCode).toBe('6200');
      expect(result!.engine).toBe('deterministic');
      expect(result!.confidence).toBe(100);
    });

    it('matches against merchantRaw when merchant doesnt match', () => {
      const rule = makeRule({ vendor_pattern: 'original', match_type: 'contains' });
      const tx = makeTx({ merchant: 'MASKED', merchantRaw: 'ORIGINAL MERCHANT' });
      const result = categorizeDeterministic(tx, [rule]);
      expect(result).not.toBeNull();
    });
  });

  describe('exact match', () => {
    it('matches exact merchant name (case-insensitive)', () => {
      const rule = makeRule({ vendor_pattern: 'starbucks #12345 seattle', match_type: 'exact' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).not.toBeNull();
      expect(result!.ruleMatchType).toBe('exact_match');
    });

    it('does not match partial strings for exact', () => {
      const rule = makeRule({ vendor_pattern: 'starbucks', match_type: 'exact' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).toBeNull();
    });
  });

  describe('regex match', () => {
    it('matches using regex pattern', () => {
      const rule = makeRule({ vendor_pattern: 'star.*seattle', match_type: 'regex' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).not.toBeNull();
      expect(result!.ruleMatchType).toBe('pattern');
    });

    it('handles invalid regex gracefully (returns no match)', () => {
      const rule = makeRule({ vendor_pattern: '[invalid', match_type: 'regex' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).toBeNull(); // Invalid regex should not crash
    });
  });

  describe('MCC code matching', () => {
    it('matches by MCC code when vendor pattern doesnt match', () => {
      const rule = makeRule({
        vendor_pattern: 'nonexistent',
        mcc_code: '5411',
        match_type: 'contains',
      });
      const tx = makeTx({ merchant: 'UNKNOWN STORE', mcc: '5411' });
      const result = categorizeDeterministic(tx, [rule]);
      expect(result).not.toBeNull();
      expect(result!.ruleMatchType).toBe('mcc');
    });

    it('MCC matching is case-insensitive', () => {
      const rule = makeRule({
        vendor_pattern: 'nonexistent',
        mcc_code: '5411',
        match_type: 'contains',
      });
      const tx = makeTx({ merchant: 'UNKNOWN', mcc: '5411' });
      const result = categorizeDeterministic(tx, [rule]);
      expect(result).not.toBeNull();
    });
  });

  describe('priority ordering', () => {
    it('applies higher priority rules first', () => {
      const rules = [
        makeRule({ id: 'low', vendor_pattern: 'star', match_type: 'contains', priority: 1, gl_code: '9999' }),
        makeRule({ id: 'high', vendor_pattern: 'starbucks', match_type: 'contains', priority: 100, gl_code: '6200' }),
      ];
      const result = categorizeDeterministic(makeTx(), rules);
      expect(result).not.toBeNull();
      expect(result!.glCode).toBe('6200');
    });
  });

  describe('no match', () => {
    it('returns null when no rules match', () => {
      const rule = makeRule({ vendor_pattern: 'mcdonalds', match_type: 'contains' });
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).toBeNull();
    });

    it('returns null with empty rules array', () => {
      const result = categorizeDeterministic(makeTx(), []);
      expect(result).toBeNull();
    });
  });

  describe('result shape', () => {
    it('returns complete CategorizationResult', () => {
      const rule = makeRule();
      const result = categorizeDeterministic(makeTx(), [rule]);
      expect(result).not.toBeNull();
      expect(result!.glCode).toBe('6200');
      expect(result!.glName).toBe('Meals & Entertainment');
      expect(result!.confidence).toBe(100);
      expect(result!.engine).toBe('deterministic');
      expect(result!.sourceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result!.alternatives).toEqual([]);
    });
  });
});
