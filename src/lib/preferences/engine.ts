// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — User Preferences Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Manages per-user preferences for theme, locale, notifications, and
// dashboard layout. Stored in the user_preferences table with JSON columns.

import { createLogger } from '@/lib/logger';

const log = createLogger('preferences-engine');

// ─── Types ──────────────────────────────────────────────────────────────────────

export type ThemePreference = 'light' | 'dark' | 'system';

export interface NotificationPreferences {
  emailAlerts: boolean;
  transactionAlerts: boolean;
  reportAlerts: boolean;
  weeklyDigest: boolean;
  monthEndReminder: boolean;
}

export interface DashboardLayout {
  showRevenueChart: boolean;
  showExpenseBreakdown: boolean;
  showRecentTransactions: boolean;
  showCashFlow: boolean;
  defaultDateRange: string;
}

export interface UserPreferences {
  userId: string;
  theme: ThemePreference;
  locale: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  numberFormat: string;
  notificationPreferences: NotificationPreferences;
  dashboardLayout: DashboardLayout;
  updatedAt: string;
}

// ─── Database Row Type ──────────────────────────────────────────────────────────

interface PreferencesRow {
  user_id: string;
  theme: ThemePreference;
  locale: string;
  currency: string;
  timezone: string;
  date_format: string;
  number_format: string;
  notification_preferences: NotificationPreferences;
  dashboard_layout: DashboardLayout;
  updated_at: string;
}

// ─── Minimal DB interface for testability ───────────────────────────────────────

export interface PreferencesDB {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: PreferencesRow | null; error: unknown }>;
      };
    };
    upsert: (data: Record<string, unknown>, options?: { onConflict?: string }) => Promise<{ error: unknown }>;
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: unknown }>;
    };
  };
}

// ─── Defaults ───────────────────────────────────────────────────────────────────

export function getDefaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    theme: 'system',
    locale: 'en-US',
    currency: 'USD',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    numberFormat: 'en-US',
    notificationPreferences: {
      emailAlerts: true,
      transactionAlerts: true,
      reportAlerts: true,
      weeklyDigest: true,
      monthEndReminder: true,
    },
    dashboardLayout: {
      showRevenueChart: true,
      showExpenseBreakdown: true,
      showRecentTransactions: true,
      showCashFlow: true,
      defaultDateRange: '30d',
    },
    updatedAt: new Date().toISOString(),
  };
}

// ─── Get Preferences ────────────────────────────────────────────────────────────

export async function getPreferences(
  db: PreferencesDB,
  userId: string
): Promise<UserPreferences> {
  try {
    const { data, error } = await db
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      log.debug('No saved preferences found, returning defaults', { userId });
      return getDefaultPreferences(userId);
    }

    return mapRowToPreferences(data);
  } catch (err) {
    log.warn('Failed to fetch preferences, returning defaults', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return getDefaultPreferences(userId);
  }
}

// ─── Update Preferences ─────────────────────────────────────────────────────────

export async function updatePreferences(
  db: PreferencesDB,
  userId: string,
  partial: Partial<Omit<UserPreferences, 'userId' | 'updatedAt'>>
): Promise<UserPreferences> {
  // Get current preferences to merge with partial update
  const current = await getPreferences(db, userId);
  const merged: UserPreferences = {
    ...current,
    ...partial,
    userId,
    notificationPreferences: {
      ...current.notificationPreferences,
      ...(partial.notificationPreferences || {}),
    },
    dashboardLayout: {
      ...current.dashboardLayout,
      ...(partial.dashboardLayout || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  const row = mapPreferencesToRow(merged);

  const { error } = await db
    .from('user_preferences')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    log.error('Failed to update preferences', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('Failed to update preferences');
  }

  log.info('Preferences updated', { userId });
  return merged;
}

// ─── Reset Preferences ──────────────────────────────────────────────────────────

export async function resetPreferences(
  db: PreferencesDB,
  userId: string
): Promise<UserPreferences> {
  const { error } = await db
    .from('user_preferences')
    .delete()
    .eq('user_id', userId);

  if (error) {
    log.warn('Failed to delete preferences row (may not exist)', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  log.info('Preferences reset to defaults', { userId });
  return getDefaultPreferences(userId);
}

// ─── Mappers ────────────────────────────────────────────────────────────────────

function mapRowToPreferences(row: PreferencesRow): UserPreferences {
  return {
    userId: row.user_id,
    theme: row.theme || 'system',
    locale: row.locale || 'en-US',
    currency: row.currency || 'USD',
    timezone: row.timezone || 'America/New_York',
    dateFormat: row.date_format || 'MM/DD/YYYY',
    numberFormat: row.number_format || 'en-US',
    notificationPreferences: row.notification_preferences || getDefaultPreferences(row.user_id).notificationPreferences,
    dashboardLayout: row.dashboard_layout || getDefaultPreferences(row.user_id).dashboardLayout,
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

function mapPreferencesToRow(prefs: UserPreferences): Record<string, unknown> {
  return {
    user_id: prefs.userId,
    theme: prefs.theme,
    locale: prefs.locale,
    currency: prefs.currency,
    timezone: prefs.timezone,
    date_format: prefs.dateFormat,
    number_format: prefs.numberFormat,
    notification_preferences: prefs.notificationPreferences,
    dashboard_layout: prefs.dashboardLayout,
    updated_at: prefs.updatedAt,
  };
}
