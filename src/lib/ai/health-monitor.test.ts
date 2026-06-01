import { describe, it, expect } from 'vitest';
import { computeHealthScore } from './health-monitor';
import type { HealthAlert } from './health-monitor';

// ============================================
// Test fixtures
// ============================================
function makeAlert(overrides: Partial<HealthAlert> = {}): HealthAlert {
  return {
    entityId: 'entity-1',
    alertType: 'expense_anomaly',
    severity: 'warning',
    title: 'Test Alert',
    description: 'Test description',
    data: {},
    isRead: false,
    isDismissed: false,
    ...overrides,
  };
}

// ============================================
// computeHealthScore
// ============================================
describe('computeHealthScore', () => {
  describe('baseline', () => {
    it('returns 100 when no alerts exist', () => {
      expect(computeHealthScore([])).toBe(100);
    });

    it('returns 100 when all alerts are dismissed', () => {
      const alerts = [
        makeAlert({ severity: 'critical', isDismissed: true }),
        makeAlert({ severity: 'warning', isDismissed: true }),
        makeAlert({ severity: 'info', isDismissed: true }),
      ];
      expect(computeHealthScore(alerts)).toBe(100);
    });
  });

  describe('single alert severity deductions', () => {
    it('deducts 20 points for a critical alert', () => {
      const alerts = [makeAlert({ severity: 'critical' })];
      expect(computeHealthScore(alerts)).toBe(80);
    });

    it('deducts 10 points for a warning alert', () => {
      const alerts = [makeAlert({ severity: 'warning' })];
      expect(computeHealthScore(alerts)).toBe(90);
    });

    it('deducts 3 points for an info alert', () => {
      const alerts = [makeAlert({ severity: 'info' })];
      expect(computeHealthScore(alerts)).toBe(97);
    });
  });

  describe('multiple alerts', () => {
    it('accumulates deductions for mixed severities', () => {
      const alerts = [
        makeAlert({ severity: 'warning' }),
        makeAlert({ severity: 'info' }),
      ];
      // 100 - 10 - 3 = 87
      expect(computeHealthScore(alerts)).toBe(87);
    });

    it('accumulates deductions for multiple critical alerts', () => {
      const alerts = [
        makeAlert({ severity: 'critical' }),
        makeAlert({ severity: 'critical' }),
      ];
      // 100 - 20 - 20 = 60
      expect(computeHealthScore(alerts)).toBe(60);
    });

    it('handles all three severities together', () => {
      const alerts = [
        makeAlert({ severity: 'critical' }),
        makeAlert({ severity: 'warning' }),
        makeAlert({ severity: 'info' }),
      ];
      // 100 - 20 - 10 - 3 = 67
      expect(computeHealthScore(alerts)).toBe(67);
    });
  });

  describe('score clamping', () => {
    it('clamps score to minimum of 0', () => {
      // 6 critical alerts = 100 - 120 = -20 → clamped to 0
      const alerts = Array.from({ length: 6 }, () =>
        makeAlert({ severity: 'critical' })
      );
      expect(computeHealthScore(alerts)).toBe(0);
    });

    it('clamps score to maximum of 100', () => {
      // No active alerts → 100
      expect(computeHealthScore([])).toBeLessThanOrEqual(100);
    });
  });

  describe('dismissed alert filtering', () => {
    it('ignores dismissed alerts in score calculation', () => {
      const alerts = [
        makeAlert({ severity: 'critical', isDismissed: false }),
        makeAlert({ severity: 'critical', isDismissed: true }),
      ];
      // Only the first (non-dismissed) critical counts: 100 - 20 = 80
      expect(computeHealthScore(alerts)).toBe(80);
    });

    it('counts isRead alerts that are not dismissed', () => {
      const alerts = [
        makeAlert({ severity: 'warning', isRead: true, isDismissed: false }),
      ];
      // isRead does not skip the alert; only isDismissed does
      expect(computeHealthScore(alerts)).toBe(90);
    });
  });

  describe('alert types do not affect scoring', () => {
    it('score depends only on severity, not alert type', () => {
      const alertTypes = [
        'cash_flow_decline',
        'expense_anomaly',
        'duplicate_payment',
        'subscription_waste',
        'revenue_concentration',
        'uncategorized_backlog',
        'missing_receipts',
        'burn_rate_warning',
      ] as const;

      for (const alertType of alertTypes) {
        const alerts = [makeAlert({ alertType, severity: 'warning' })];
        expect(computeHealthScore(alerts)).toBe(90);
      }
    });
  });

  describe('realistic scenarios', () => {
    it('healthy entity — only info alerts', () => {
      const alerts = [
        makeAlert({ alertType: 'subscription_waste', severity: 'info' }),
        makeAlert({ alertType: 'subscription_waste', severity: 'info' }),
      ];
      // 100 - 3 - 3 = 94
      expect(computeHealthScore(alerts)).toBe(94);
    });

    it('entity in trouble — multiple critical and warning alerts', () => {
      const alerts = [
        makeAlert({ alertType: 'cash_flow_decline', severity: 'critical' }),
        makeAlert({ alertType: 'burn_rate_warning', severity: 'critical' }),
        makeAlert({ alertType: 'missing_receipts', severity: 'warning' }),
        makeAlert({ alertType: 'uncategorized_backlog', severity: 'warning' }),
        makeAlert({ alertType: 'expense_anomaly', severity: 'warning' }),
      ];
      // 100 - 20 - 20 - 10 - 10 - 10 = 30
      expect(computeHealthScore(alerts)).toBe(30);
    });

    it('mixed dismissed and active alerts', () => {
      const alerts = [
        makeAlert({ severity: 'critical', isDismissed: true }),
        makeAlert({ severity: 'critical', isDismissed: true }),
        makeAlert({ severity: 'warning', isDismissed: false }),
        makeAlert({ severity: 'info', isDismissed: false }),
      ];
      // Only active: 100 - 10 - 3 = 87
      expect(computeHealthScore(alerts)).toBe(87);
    });
  });
});
