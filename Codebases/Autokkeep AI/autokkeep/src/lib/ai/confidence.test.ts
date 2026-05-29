import { describe, it, expect } from 'vitest';
import {
  WEIGHTS,
  AUTO_COMMIT_THRESHOLD,
  HIGH_RISK_AMOUNT,
  calculateRuleScore,
  calculateDocScore,
  computeCompositeScore,
  triageTransaction,
} from './confidence';

// ============================================
// Constants
// ============================================
describe('Constants', () => {
  it('weights sum to 1.0', () => {
    expect(WEIGHTS.W_LLM + WEIGHTS.W_RULE + WEIGHTS.W_DOC).toBeCloseTo(1.0);
  });

  it('auto-commit threshold is 0.95', () => {
    expect(AUTO_COMMIT_THRESHOLD).toBe(0.95);
  });

  it('high-risk amount is $250', () => {
    expect(HIGH_RISK_AMOUNT).toBe(250);
  });
});

// ============================================
// calculateRuleScore
// ============================================
describe('calculateRuleScore', () => {
  it('returns 1.0 for exact_match', () => {
    expect(calculateRuleScore('exact_match')).toBe(1.0);
  });

  it('returns 0.7 for pattern', () => {
    expect(calculateRuleScore('pattern')).toBe(0.7);
  });

  it('returns 0.5 for mcc', () => {
    expect(calculateRuleScore('mcc')).toBe(0.5);
  });

  it('returns 0.0 for none', () => {
    expect(calculateRuleScore('none')).toBe(0.0);
  });
});

// ============================================
// calculateDocScore
// ============================================
describe('calculateDocScore', () => {
  it('returns 1.0 when document exists', () => {
    expect(calculateDocScore(true)).toBe(1.0);
  });

  it('returns 0.0 when no document', () => {
    expect(calculateDocScore(false)).toBe(0.0);
  });
});

// ============================================
// computeCompositeScore
// ============================================
describe('computeCompositeScore', () => {
  it('computes C_s = (0.5 * P) + (0.3 * S) + (0.2 * M)', () => {
    const result = computeCompositeScore(1.0, 1.0, 1.0);
    expect(result.compositeScore).toBeCloseTo(1.0, 4);
  });

  it('returns 0 when all inputs are 0', () => {
    const result = computeCompositeScore(0, 0, 0);
    expect(result.compositeScore).toBe(0);
  });

  it('handles only LLM confidence', () => {
    const result = computeCompositeScore(0.8, 0, 0);
    expect(result.compositeScore).toBeCloseTo(0.4, 4);
  });

  it('handles only rule match', () => {
    const result = computeCompositeScore(0, 1.0, 0);
    expect(result.compositeScore).toBeCloseTo(0.3, 4);
  });

  it('handles only document', () => {
    const result = computeCompositeScore(0, 0, 1.0);
    expect(result.compositeScore).toBeCloseTo(0.2, 4);
  });

  it('clamps negative values to 0', () => {
    const result = computeCompositeScore(-0.5, -1.0, -2.0);
    expect(result.compositeScore).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    const result = computeCompositeScore(5.0, 3.0, 2.0);
    expect(result.compositeScore).toBeCloseTo(1.0, 4);
  });

  it('generates reasoning with correct labels', () => {
    const high = computeCompositeScore(0.9, 1.0, 1.0);
    expect(high.reasoning).toContain('high LLM confidence');
    expect(high.reasoning).toContain('exact rule match');
    expect(high.reasoning).toContain('corroborated');

    const low = computeCompositeScore(0.3, 0, 0);
    expect(low.reasoning).toContain('low LLM confidence');
    expect(low.reasoning).toContain('no matching rule');
    expect(low.reasoning).toContain('no supporting document');
  });

  it('rounds to 4 decimal places', () => {
    // 0.5 * 0.33 + 0.3 * 0.77 + 0.2 * 0 = 0.165 + 0.231 = 0.396
    const result = computeCompositeScore(0.33, 0.77, 0);
    const decimalStr = result.compositeScore.toString();
    const decimals = decimalStr.split('.')[1] || '';
    expect(decimals.length).toBeLessThanOrEqual(4);
  });
});

// ============================================
// triageTransaction
// ============================================
describe('triageTransaction', () => {
  describe('auto_commit path', () => {
    it('auto-commits with perfect scores', () => {
      const result = triageTransaction(1.0, 'exact_match', true, 50);
      expect(result.decision).toBe('auto_commit');
      expect(result.targetStatus).toBe('auto_categorized');
      expect(result.notificationChannel).toBe('none');
    });

    it('auto-commits at exactly 0.95 threshold', () => {
      // C_s = 0.5*1.0 + 0.3*1.0 + 0.2*0.75 = 0.5 + 0.3 + 0.15 = 0.95
      const result = triageTransaction(1.0, 'exact_match', true, 100);
      expect(result.decision).toBe('auto_commit');
    });

    it('auto-commits high-value transactions when confidence is sufficient', () => {
      const result = triageTransaction(1.0, 'exact_match', true, 10000);
      expect(result.decision).toBe('auto_commit');
    });
  });

  describe('escrow_suspense path', () => {
    it('routes to escrow for low confidence, small amount', () => {
      const result = triageTransaction(0.7, 'pattern', false, 50);
      expect(result.decision).toBe('escrow_suspense');
      expect(result.targetStatus).toBe('escrow_suspense');
      expect(result.notificationChannel).toBe('weekly_digest');
    });

    it('routes to escrow for moderate confidence, under $250', () => {
      const result = triageTransaction(0.8, 'none', false, 249.99);
      expect(result.decision).toBe('escrow_suspense');
    });
  });

  describe('freeze_review path', () => {
    it('freezes high-value transactions with low confidence', () => {
      const result = triageTransaction(0.5, 'none', false, 500);
      expect(result.decision).toBe('freeze_review');
      expect(result.targetStatus).toBe('human_review');
      expect(result.notificationChannel).toBe('immediate_card');
    });

    it('freezes at exactly $250 threshold', () => {
      const result = triageTransaction(0.7, 'none', false, 250);
      expect(result.decision).toBe('freeze_review');
    });

    it('handles negative amounts (credits/refunds) using Math.abs', () => {
      const result = triageTransaction(0.5, 'none', false, -500);
      expect(result.decision).toBe('freeze_review');
    });

    it('handles negative amounts below threshold', () => {
      const result = triageTransaction(0.5, 'none', false, -100);
      expect(result.decision).toBe('escrow_suspense');
    });
  });

  describe('confidence breakdown', () => {
    it('includes all score components in result', () => {
      const result = triageTransaction(0.8, 'mcc', true, 100);
      expect(result.confidence.pLlm).toBe(0.8);
      expect(result.confidence.sRule).toBe(0.5); // mcc → 0.5
      expect(result.confidence.mDoc).toBe(1.0);
      expect(result.confidence.compositeScore).toBeCloseTo(0.75, 4); // 0.4 + 0.15 + 0.2
      expect(result.confidence.reasoning).toBeTruthy();
    });
  });
});
