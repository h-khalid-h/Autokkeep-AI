import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDefaultPreferences,
  getPreferences,
  updatePreferences,
  resetPreferences,
  type PreferencesDB,
} from '@/lib/preferences/engine';

// ─── Mock Logger ────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createMockDB(options?: {
  selectResult?: { data: Record<string, unknown> | null; error: unknown };
  upsertResult?: { error: unknown };
  deleteResult?: { error: unknown };
}): PreferencesDB {
  const singleFn = vi.fn().mockResolvedValue(
    options?.selectResult ?? { data: null, error: null }
  );
  const eqFnForSelect = vi.fn().mockReturnValue({ single: singleFn });
  const selectFn = vi.fn().mockReturnValue({ eq: eqFnForSelect });

  const upsertFn = vi.fn().mockResolvedValue(
    options?.upsertResult ?? { error: null }
  );

  const deleteEqFn = vi.fn().mockResolvedValue(
    options?.deleteResult ?? { error: null }
  );
  const deleteFn = vi.fn().mockReturnValue({ eq: deleteEqFn });

  return {
    from: vi.fn().mockReturnValue({
      select: selectFn,
      upsert: upsertFn,
      delete: deleteFn,
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('User Preferences Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getDefaultPreferences ──────────────────────────────────────────────

  describe('getDefaultPreferences', () => {
    it('should return sensible defaults for a given userId', () => {
      const prefs = getDefaultPreferences('user-123');

      expect(prefs.userId).toBe('user-123');
      expect(prefs.theme).toBe('system');
      expect(prefs.locale).toBe('en-US');
      expect(prefs.currency).toBe('USD');
      expect(prefs.timezone).toBe('America/New_York');
      expect(prefs.dateFormat).toBe('MM/DD/YYYY');
      expect(prefs.numberFormat).toBe('en-US');
    });

    it('should include all notification preferences set to true by default', () => {
      const prefs = getDefaultPreferences('user-123');

      expect(prefs.notificationPreferences.emailAlerts).toBe(true);
      expect(prefs.notificationPreferences.transactionAlerts).toBe(true);
      expect(prefs.notificationPreferences.reportAlerts).toBe(true);
      expect(prefs.notificationPreferences.weeklyDigest).toBe(true);
      expect(prefs.notificationPreferences.monthEndReminder).toBe(true);
    });

    it('should include all dashboard layout widgets enabled by default', () => {
      const prefs = getDefaultPreferences('user-123');

      expect(prefs.dashboardLayout.showRevenueChart).toBe(true);
      expect(prefs.dashboardLayout.showExpenseBreakdown).toBe(true);
      expect(prefs.dashboardLayout.showRecentTransactions).toBe(true);
      expect(prefs.dashboardLayout.showCashFlow).toBe(true);
      expect(prefs.dashboardLayout.defaultDateRange).toBe('30d');
    });
  });

  // ── getPreferences ────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('should return defaults when no saved preferences exist', async () => {
      const db = createMockDB({ selectResult: { data: null, error: null } });

      const prefs = await getPreferences(db, 'user-456');

      expect(prefs.userId).toBe('user-456');
      expect(prefs.theme).toBe('system');
      expect(prefs.locale).toBe('en-US');
    });

    it('should return saved preferences when they exist', async () => {
      const savedRow = {
        user_id: 'user-789',
        theme: 'dark' as const,
        locale: 'en-GB',
        currency: 'GBP',
        timezone: 'Europe/London',
        date_format: 'DD/MM/YYYY',
        number_format: 'en-GB',
        notification_preferences: {
          emailAlerts: false,
          transactionAlerts: true,
          reportAlerts: false,
          weeklyDigest: true,
          monthEndReminder: false,
        },
        dashboard_layout: {
          showRevenueChart: true,
          showExpenseBreakdown: false,
          showRecentTransactions: true,
          showCashFlow: false,
          defaultDateRange: '7d',
        },
        updated_at: '2025-01-01T00:00:00Z',
      };

      const db = createMockDB({ selectResult: { data: savedRow, error: null } });

      const prefs = await getPreferences(db, 'user-789');

      expect(prefs.userId).toBe('user-789');
      expect(prefs.theme).toBe('dark');
      expect(prefs.locale).toBe('en-GB');
      expect(prefs.currency).toBe('GBP');
      expect(prefs.timezone).toBe('Europe/London');
      expect(prefs.notificationPreferences.emailAlerts).toBe(false);
      expect(prefs.dashboardLayout.showCashFlow).toBe(false);
      expect(prefs.dashboardLayout.defaultDateRange).toBe('7d');
    });

    it('should return defaults when DB query throws', async () => {
      const db = createMockDB({ selectResult: { data: null, error: new Error('Connection failed') } });

      const prefs = await getPreferences(db, 'user-err');

      expect(prefs.userId).toBe('user-err');
      expect(prefs.theme).toBe('system');
    });
  });

  // ── updatePreferences ─────────────────────────────────────────────────

  describe('updatePreferences', () => {
    it('should merge partial updates and upsert to DB', async () => {
      const db = createMockDB();

      const result = await updatePreferences(db, 'user-100', {
        theme: 'dark',
        locale: 'fr-FR',
      });

      expect(result.theme).toBe('dark');
      expect(result.locale).toBe('fr-FR');
      // Other fields should retain defaults
      expect(result.currency).toBe('USD');
      expect(result.userId).toBe('user-100');
      expect(db.from).toHaveBeenCalledWith('user_preferences');
    });

    it('should throw when upsert fails', async () => {
      const db = createMockDB({
        upsertResult: { error: new Error('DB write failed') },
      });

      await expect(
        updatePreferences(db, 'user-fail', { theme: 'light' })
      ).rejects.toThrow('Failed to update preferences');
    });
  });

  // ── resetPreferences ──────────────────────────────────────────────────

  describe('resetPreferences', () => {
    it('should delete saved preferences and return defaults', async () => {
      const db = createMockDB();

      const result = await resetPreferences(db, 'user-reset');

      expect(result.userId).toBe('user-reset');
      expect(result.theme).toBe('system');
      expect(result.locale).toBe('en-US');
      expect(db.from).toHaveBeenCalledWith('user_preferences');
    });
  });
});
