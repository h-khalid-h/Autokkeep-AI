import { describe, it, expect } from 'vitest';
import {
  suggestCategorizationRules,
  normalizeMerchantName,
  type RuleSuggestion,
} from './suggestion-engine';

// ─── Normalization Tests ────────────────────────────────────────────────────

describe('normalizeMerchantName', () => {
  it('should lowercase and trim', () => {
    expect(normalizeMerchantName('  STARBUCKS  ')).toBe('starbucks');
  });

  it('should remove trailing numeric IDs', () => {
    expect(normalizeMerchantName('UBER EATS 12345')).toBe('uber eats');
  });

  it('should remove trailing hash codes', () => {
    expect(normalizeMerchantName('STARBUCKS #1234')).toBe('starbucks');
    expect(normalizeMerchantName('UBER EATS #ABC-123')).toBe('uber eats');
  });

  it('should remove SQ* prefix', () => {
    expect(normalizeMerchantName('SQ *COFFEE SHOP')).toBe('coffee shop');
    expect(normalizeMerchantName('sq * bakery')).toBe('bakery');
  });

  it('should collapse multiple spaces', () => {
    expect(normalizeMerchantName('SOME   MERCHANT   NAME')).toBe('some merchant name');
  });
});

// ─── Suggestion Engine Tests ────────────────────────────────────────────────

describe('suggestCategorizationRules', () => {
  const createTx = (merchant: string, humanCategory: string, aiCategory = '') => ({
    merchant_name: merchant,
    category_human: humanCategory,
    category_ai: aiCategory,
  });

  it('should return empty array for empty input', () => {
    const result = suggestCategorizationRules([], []);
    expect(result).toEqual([]);
  });

  it('should return empty array for null-ish input', () => {
    const result = suggestCategorizationRules(
      null as unknown as Parameters<typeof suggestCategorizationRules>[0],
      []
    );
    expect(result).toEqual([]);
  });

  it('should not suggest rules for single transactions', () => {
    const txs = [createTx('STARBUCKS', '6200-food')];
    const result = suggestCategorizationRules(txs, []);
    expect(result).toEqual([]);
  });

  it('should not suggest rules for groups with fewer than 3 transactions', () => {
    const txs = [
      createTx('STARBUCKS', '6200-food'),
      createTx('STARBUCKS', '6200-food'),
    ];
    const result = suggestCategorizationRules(txs, []);
    expect(result).toEqual([]);
  });

  it('should suggest high confidence rule for consistent categorization (>80%)', () => {
    const txs = [
      createTx('STARBUCKS #123', '6200-food', 'Meals & Entertainment'),
      createTx('STARBUCKS #456', '6200-food', 'Meals & Entertainment'),
      createTx('STARBUCKS #789', '6200-food', 'Meals & Entertainment'),
      createTx('Starbucks #111', '6200-food', 'Meals & Entertainment'),
      createTx('STARBUCKS #222', '6200-food', 'Meals & Entertainment'),
    ];

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(1);
    expect(result[0].merchantPattern).toBe('starbucks');
    expect(result[0].suggestedGlCode).toBe('6200-food');
    expect(result[0].confidence).toBe(90);
    expect(result[0].matchCount).toBe(5);
    expect(result[0].exampleMerchants.length).toBeGreaterThan(0);
  });

  it('should suggest medium confidence rule when 60-80% consistent', () => {
    const txs = [
      createTx('UBER', '6300-travel', 'Transportation'),
      createTx('UBER', '6300-travel', 'Transportation'),
      createTx('UBER', '6300-travel', 'Transportation'),
      createTx('UBER', '6100-other', 'Other'),
      createTx('UBER', '6100-other', 'Other'),
    ];

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(1);
    expect(result[0].merchantPattern).toBe('uber');
    expect(result[0].suggestedGlCode).toBe('6300-travel');
    expect(result[0].confidence).toBe(70);
    expect(result[0].matchCount).toBe(5);
  });

  it('should filter out merchants with inconsistent categorization (<60%)', () => {
    const txs = [
      createTx('AMAZON', '6200-food'),
      createTx('AMAZON', '6300-travel'),
      createTx('AMAZON', '6100-supplies'),
      createTx('AMAZON', '6400-tech'),
      createTx('AMAZON', '6500-office'),
    ];

    const result = suggestCategorizationRules(txs, []);
    expect(result).toEqual([]);
  });

  it('should exclude merchants that already have existing rules', () => {
    const txs = [
      createTx('STARBUCKS', '6200-food'),
      createTx('STARBUCKS', '6200-food'),
      createTx('STARBUCKS', '6200-food'),
    ];

    const existingRules = [{ match_value: 'starbucks', gl_code: '6200-food' }];

    const result = suggestCategorizationRules(txs, existingRules);
    expect(result).toEqual([]);
  });

  it('should exclude merchants matching existing rules case-insensitively', () => {
    const txs = [
      createTx('STARBUCKS #123', '6200-food'),
      createTx('STARBUCKS #456', '6200-food'),
      createTx('STARBUCKS #789', '6200-food'),
    ];

    const existingRules = [{ match_value: 'STARBUCKS', gl_code: '6200-food' }];

    const result = suggestCategorizationRules(txs, existingRules);
    expect(result).toEqual([]);
  });

  it('should sort by confidence descending then matchCount descending', () => {
    const txs = [
      // High confidence, 3 matches
      createTx('STARBUCKS', '6200-food'),
      createTx('STARBUCKS', '6200-food'),
      createTx('STARBUCKS', '6200-food'),

      // High confidence, 5 matches (should rank higher)
      createTx('AMAZON', '6300-supplies'),
      createTx('AMAZON', '6300-supplies'),
      createTx('AMAZON', '6300-supplies'),
      createTx('AMAZON', '6300-supplies'),
      createTx('AMAZON', '6300-supplies'),

      // Medium confidence, 5 matches (should rank last)
      createTx('UBER', '6400-travel'),
      createTx('UBER', '6400-travel'),
      createTx('UBER', '6400-travel'),
      createTx('UBER', '6100-other'),
      createTx('UBER', '6100-other'),
    ];

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(3);
    expect(result[0].merchantPattern).toBe('amazon');
    expect(result[0].confidence).toBe(90);
    expect(result[0].matchCount).toBe(5);
    expect(result[1].merchantPattern).toBe('starbucks');
    expect(result[1].confidence).toBe(90);
    expect(result[1].matchCount).toBe(3);
    expect(result[2].merchantPattern).toBe('uber');
    expect(result[2].confidence).toBe(70);
  });

  it('should cap results at 20 suggestions', () => {
    // Create 25 distinct merchants with 3 consistent transactions each
    const txs: ReturnType<typeof createTx>[] = [];
    for (let i = 0; i < 25; i++) {
      const merchant = `MERCHANT_${String(i).padStart(3, '0')}`;
      txs.push(createTx(merchant, `GL-${i}`));
      txs.push(createTx(merchant, `GL-${i}`));
      txs.push(createTx(merchant, `GL-${i}`));
    }

    const result = suggestCategorizationRules(txs, []);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('should group merchants with trailing IDs together', () => {
    const txs = [
      createTx('UBER EATS #12345', '6200-food'),
      createTx('UBER EATS #67890', '6200-food'),
      createTx('UBER EATS #99999', '6200-food'),
    ];

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(1);
    expect(result[0].merchantPattern).toBe('uber eats');
    expect(result[0].exampleMerchants).toContain('UBER EATS #12345');
  });

  it('should skip transactions with missing merchant_name or category_human', () => {
    const txs = [
      createTx('', '6200-food'),
      createTx('STARBUCKS', ''),
      { merchant_name: '', category_human: '', category_ai: '' },
    ];

    const result = suggestCategorizationRules(txs, []);
    expect(result).toEqual([]);
  });

  it('should use category_ai as suggestedGlName fallback', () => {
    const txs = [
      createTx('STARBUCKS', '6200', 'Meals & Entertainment'),
      createTx('STARBUCKS', '6200', 'Meals & Entertainment'),
      createTx('STARBUCKS', '6200', 'Meals & Entertainment'),
    ];

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(1);
    expect(result[0].suggestedGlName).toBe('Meals & Entertainment');
  });

  it('should limit example merchants to 5', () => {
    const txs: ReturnType<typeof createTx>[] = [];
    for (let i = 0; i < 10; i++) {
      txs.push(createTx(`STARBUCKS #${1000 + i}`, '6200-food'));
    }

    const result = suggestCategorizationRules(txs, []);

    expect(result).toHaveLength(1);
    expect(result[0].exampleMerchants.length).toBeLessThanOrEqual(5);
  });
});
