'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, Toggle, Skeleton } from '@/components/ui';
import type { UserPreferences } from '@/lib/preferences/engine';
import styles from './preferences.module.css';

// ─── Locale / Currency / Timezone Options ───────────────────────────────────────

const LOCALE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'ar-SA', label: 'العربية' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'zh-CN', label: '中文 (简体)' },
];

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'CAD', label: 'CAD — Canadian Dollar' },
  { value: 'AUD', label: 'AUD — Australian Dollar' },
  { value: 'JPY', label: 'JPY — Japanese Yen' },
  { value: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'AED', label: 'AED — UAE Dirham' },
];

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: 'en-US', label: '1,234.56 (US)' },
  { value: 'en-GB', label: '1,234.56 (UK)' },
  { value: 'de-DE', label: '1.234,56 (DE)' },
  { value: 'fr-FR', label: '1 234,56 (FR)' },
];

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'ytd', label: 'Year to date' },
];

// ─── Preferences Settings Page ──────────────────────────────────────────────────

export default function PreferencesSettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Fetch preferences ─────────────────────────────────────────────────
  const fetchPreferences = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/settings/preferences');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load preferences');
      }
      const data = await res.json();
      setPrefs(data.preferences);
    } catch (err) {
      console.error('[Preferences] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await fetchPreferences();
      if (cancelled) return;
    }
    void load();
    return () => { cancelled = true; };
  }, [fetchPreferences]);

  // ── Save preferences ──────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!prefs) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: prefs.theme,
          locale: prefs.locale,
          currency: prefs.currency,
          timezone: prefs.timezone,
          dateFormat: prefs.dateFormat,
          numberFormat: prefs.numberFormat,
          notificationPreferences: prefs.notificationPreferences,
          dashboardLayout: prefs.dashboardLayout,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save preferences');
      }

      const data = await res.json();
      setPrefs(data.preferences);
      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error('[Preferences] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  }, [prefs]);

  // ── Reset preferences ─────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!confirm('Reset all preferences to defaults? This cannot be undone.')) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings/preferences', { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reset preferences');
      }

      const data = await res.json();
      setPrefs(data.preferences);
      setSuccess('Preferences reset to defaults.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error('[Preferences] Reset error:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset preferences');
    } finally {
      setIsSaving(false);
    }
  }, []);

  // ── Update helpers ────────────────────────────────────────────────────
  const updateField = useCallback((field: string, value: unknown) => {
    setPrefs((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const updateNotification = useCallback((field: string, value: boolean) => {
    setPrefs((prev) =>
      prev
        ? {
            ...prev,
            notificationPreferences: {
              ...prev.notificationPreferences,
              [field]: value,
            },
          }
        : prev
    );
  }, []);

  const updateDashboard = useCallback((field: string, value: unknown) => {
    setPrefs((prev) =>
      prev
        ? {
            ...prev,
            dashboardLayout: {
              ...prev.dashboardLayout,
              [field]: value,
            },
          }
        : prev
    );
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary componentName="Preferences Settings">
        <AppShell>
          <div className={styles.pageContainer}>
            <div className={styles.skeletonStack}>
              <Skeleton width="40%" height={28} />
              <Card padding="lg"><Skeleton variant="rect" height={120} /></Card>
              <Card padding="lg"><Skeleton variant="rect" height={200} /></Card>
              <Card padding="lg"><Skeleton variant="rect" height={160} /></Card>
            </div>
          </div>
        </AppShell>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary componentName="Preferences Settings">
      <AppShell>
        <div className={styles.pageContainer}>
          <h1 className="sr-only">User Preferences</h1>

          {/* Page Header */}
          <div className={styles.pageHeader}>
            <Link href="/settings" className={styles.backLink} aria-label="Back to Settings">
              ←
            </Link>
            <div className={styles.headerContent}>
              <div className={styles.pageTitle}>⚙️ Preferences</div>
              <p className={styles.pageSubtitle}>
                Customize your Autokkeep experience — appearance, regional settings, notifications, and dashboard layout.
              </p>
            </div>
          </div>

          {/* Success */}
          {success && (
            <div className={styles.successBanner} role="status">
              ✅ {success}
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <button
                className={styles.errorDismiss}
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {prefs && (
            <>
              {/* ── Appearance ── */}
              <div className={styles.section}>
                <Card padding="lg">
                  <div className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>🎨</span> Appearance
                  </div>
                  <div className={styles.themeSelector}>
                    {(['light', 'dark', 'system'] as const).map((theme) => (
                      <button
                        key={theme}
                        className={
                          prefs.theme === theme
                            ? styles.themeButtonActive
                            : styles.themeButton
                        }
                        onClick={() => updateField('theme', theme)}
                        aria-pressed={prefs.theme === theme}
                      >
                        <span className={styles.themeIcon}>
                          {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}
                        </span>
                        <span className={styles.themeLabel}>
                          {theme.charAt(0).toUpperCase() + theme.slice(1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>

              {/* ── Regional Settings ── */}
              <div className={styles.section}>
                <Card padding="lg">
                  <div className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>🌍</span> Regional Settings
                  </div>
                  <div className={styles.formGrid}>
                    <SelectField
                      id="pref-locale"
                      label="Language / Locale"
                      value={prefs.locale}
                      options={LOCALE_OPTIONS}
                      onChange={(v) => updateField('locale', v)}
                    />
                    <SelectField
                      id="pref-currency"
                      label="Default Currency"
                      value={prefs.currency}
                      options={CURRENCY_OPTIONS}
                      onChange={(v) => updateField('currency', v)}
                    />
                    <SelectField
                      id="pref-timezone"
                      label="Timezone"
                      value={prefs.timezone}
                      options={TIMEZONE_OPTIONS}
                      onChange={(v) => updateField('timezone', v)}
                    />
                    <SelectField
                      id="pref-date-format"
                      label="Date Format"
                      value={prefs.dateFormat}
                      options={DATE_FORMAT_OPTIONS}
                      onChange={(v) => updateField('dateFormat', v)}
                    />
                    <SelectField
                      id="pref-number-format"
                      label="Number Format"
                      value={prefs.numberFormat}
                      options={NUMBER_FORMAT_OPTIONS}
                      onChange={(v) => updateField('numberFormat', v)}
                    />
                  </div>
                </Card>
              </div>

              {/* ── Notification Preferences ── */}
              <div className={styles.section}>
                <Card padding="lg">
                  <div className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>🔔</span> Notification Preferences
                  </div>
                  <div className={styles.toggleList}>
                    <ToggleRow
                      label="Email Alerts"
                      description="Receive important alerts via email"
                      checked={prefs.notificationPreferences.emailAlerts}
                      onChange={(v) => updateNotification('emailAlerts', v)}
                    />
                    <ToggleRow
                      label="Transaction Alerts"
                      description="Get notified about new transactions and categorizations"
                      checked={prefs.notificationPreferences.transactionAlerts}
                      onChange={(v) => updateNotification('transactionAlerts', v)}
                    />
                    <ToggleRow
                      label="Report Alerts"
                      description="Notifications when reports are ready"
                      checked={prefs.notificationPreferences.reportAlerts}
                      onChange={(v) => updateNotification('reportAlerts', v)}
                    />
                    <ToggleRow
                      label="Weekly Digest"
                      description="Weekly summary of your financial activity"
                      checked={prefs.notificationPreferences.weeklyDigest}
                      onChange={(v) => updateNotification('weeklyDigest', v)}
                    />
                    <ToggleRow
                      label="Month-End Reminder"
                      description="Reminder to close books at month end"
                      checked={prefs.notificationPreferences.monthEndReminder}
                      onChange={(v) => updateNotification('monthEndReminder', v)}
                    />
                  </div>
                </Card>
              </div>

              {/* ── Dashboard Layout ── */}
              <div className={styles.section}>
                <Card padding="lg">
                  <div className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>📊</span> Dashboard Layout
                  </div>
                  <div className={styles.toggleList}>
                    <ToggleRow
                      label="Revenue Chart"
                      description="Show revenue trend chart on dashboard"
                      checked={prefs.dashboardLayout.showRevenueChart}
                      onChange={(v) => updateDashboard('showRevenueChart', v)}
                    />
                    <ToggleRow
                      label="Expense Breakdown"
                      description="Show expense category breakdown"
                      checked={prefs.dashboardLayout.showExpenseBreakdown}
                      onChange={(v) => updateDashboard('showExpenseBreakdown', v)}
                    />
                    <ToggleRow
                      label="Recent Transactions"
                      description="Show recent transactions list"
                      checked={prefs.dashboardLayout.showRecentTransactions}
                      onChange={(v) => updateDashboard('showRecentTransactions', v)}
                    />
                    <ToggleRow
                      label="Cash Flow"
                      description="Show cash flow widget"
                      checked={prefs.dashboardLayout.showCashFlow}
                      onChange={(v) => updateDashboard('showCashFlow', v)}
                    />
                  </div>

                  <div className={styles.dateRangeSection}>
                    <SelectField
                      id="pref-date-range"
                      label="Default Date Range"
                      value={prefs.dashboardLayout.defaultDateRange}
                      options={DATE_RANGE_OPTIONS}
                      onChange={(v) => updateDashboard('defaultDateRange', v)}
                    />
                  </div>
                </Card>
              </div>

              {/* ── Actions ── */}
              <div className={styles.actions}>
                <Button
                  id="save-preferences-btn"
                  variant="primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : '💾 Save Preferences'}
                </Button>
                <Button
                  id="reset-preferences-btn"
                  variant="ghost"
                  onClick={handleReset}
                  disabled={isSaving}
                >
                  🔄 Reset to Defaults
                </Button>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}

// ─── SelectField Component ──────────────────────────────────────────────────────

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.formRow}>
      <label htmlFor={id} className={styles.formLabel}>
        {label}
      </label>
      <select
        id={id}
        className={styles.formSelect}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── ToggleRow Component ────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={styles.toggleRow}>
      <div className={styles.toggleInfo}>
        <span className={styles.toggleLabel}>{label}</span>
        <span className={styles.toggleDescription}>{description}</span>
      </div>
      <Toggle
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
    </div>
  );
}
