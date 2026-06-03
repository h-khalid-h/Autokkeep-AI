'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { Card, Button } from '@/components/ui';
import type { EntityData } from '../types';
import CardSkeletonBlock from './CardSkeletonBlock';
import styles from '../page.module.css';

// ─── Constants ──────────────────────────────────────────────────────────────────

const SUPPORTED_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SG', name: 'Singapore' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
];

const SUPPORTED_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET) — New York' },
  { value: 'America/Chicago', label: 'Central Time (CT) — Chicago' },
  { value: 'America/Denver', label: 'Mountain Time (MT) — Denver' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT) — Los Angeles' },
  { value: 'America/Toronto', label: 'Eastern Time (ET) — Toronto' },
  { value: 'Europe/London', label: 'GMT — London' },
  { value: 'Europe/Berlin', label: 'CET — Berlin' },
  { value: 'Europe/Paris', label: 'CET — Paris' },
  { value: 'Europe/Amsterdam', label: 'CET — Amsterdam' },
  { value: 'Europe/Zurich', label: 'CET — Zurich' },
  { value: 'Asia/Dubai', label: 'GST — Dubai' },
  { value: 'Asia/Riyadh', label: 'AST — Riyadh' },
  { value: 'Africa/Cairo', label: 'EET — Cairo' },
  { value: 'Asia/Kolkata', label: 'IST — Mumbai' },
  { value: 'Asia/Tokyo', label: 'JST — Tokyo' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore' },
  { value: 'Australia/Sydney', label: 'AEST — Sydney' },
  { value: 'Pacific/Auckland', label: 'NZST — Auckland' },
  { value: 'America/Sao_Paulo', label: 'BRT — São Paulo' },
  { value: 'America/Mexico_City', label: 'CST — Mexico City' },
  { value: 'Africa/Johannesburg', label: 'SAST — Johannesburg' },
  { value: 'Africa/Lagos', label: 'WAT — Lagos' },
  { value: 'Africa/Nairobi', label: 'EAT — Nairobi' },
];

const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  { code: 'EGP', name: 'Egyptian Pound', symbol: 'ج.م' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export default function LocalizationTab({
  loading: pageLoading,
  entities,
}: {
  loading: boolean;
  entities: EntityData[];
}) {
  const [selectedEntityId, setSelectedEntityId] = useState(entities.length > 0 ? entities[0].id : '');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [country, setCountry] = useState('US');
  const [timezone, setTimezone] = useState('America/New_York');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Load current settings when entity changes
  useEffect(() => {
    if (!selectedEntityId) return;

    const loadSettings = async () => {
      try {
        const supabase = createClient();
        const db = supabase as unknown as SupabaseQueryClient;
        const { data: entityData } = await db
          .from('entities')
          .select('id, base_currency, country, timezone')
          .eq('id', selectedEntityId)
          .single();

        if (entityData) {
          if (entityData.base_currency) setBaseCurrency(entityData.base_currency);
          if (entityData.country) setCountry(entityData.country);
          if (entityData.timezone) setTimezone(entityData.timezone);
        }
      } catch (err) {
        console.warn('[Settings/Localization] Failed to load settings:', err);
      }
    };

    loadSettings();
  }, [selectedEntityId]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedEntityId) return;

    setSaving(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: updateError } = await db
        .from('entities')
        .update({
          base_currency: baseCurrency,
          country: country,
          timezone: timezone,
        })
        .eq('id', selectedEntityId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSaveResult({ type: 'success', message: 'Localization settings saved successfully!' });
    } catch (err) {
      console.error('[Settings/Localization] Save error:', err);
      setSaveResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  if (pageLoading) {
    return (
      <div className={styles.skeletonStack}>
        <CardSkeletonBlock />
        <CardSkeletonBlock />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {saveResult && (
        <Card className={saveResult.type === 'success' ? styles.resultSuccess : styles.resultError} padding="sm">
          <span className={saveResult.type === 'success' ? styles.resultSuccessText : styles.resultErrorText}>
            {saveResult.type === 'success' ? '✅' : '⚠️'} {saveResult.message}
          </span>
        </Card>
      )}

      <Card>
        <h2 className={styles.sectionTitle}>Regional Settings</h2>
        <p className={styles.localeDescription}>
          Configure currency, country, and timezone for accurate financial reporting and localization.
        </p>

        <form onSubmit={handleSave} className={styles.localeForm}>
          {/* Entity Selector (if multiple entities) */}
          {entities.length > 1 && (
            <div>
              <label htmlFor="locale-entity" className={styles.fieldLabel}>Entity</label>
              <select
                id="locale-entity"
                className={styles.select}
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id} className={styles.selectOption}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Base Currency */}
          <div>
            <label htmlFor="base-currency" className={styles.fieldLabel}>Base Currency</label>
            <select
              id="base-currency"
              className={styles.select}
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code} className={styles.selectOption}>
                  {curr.symbol} {curr.code} — {curr.name}
                </option>
              ))}
            </select>
            <p className={styles.helperText}>
              All monetary values will be displayed in this currency. Multi-currency transactions will be converted automatically.
            </p>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className={styles.fieldLabel}>Country</label>
            <select
              id="country"
              className={styles.select}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} className={styles.selectOption}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <p className={styles.helperText}>
              Determines tax rules, date formats, and regulatory compliance defaults.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className={styles.fieldLabel}>Timezone</label>
            <select
              id="timezone"
              className={styles.select}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {SUPPORTED_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} className={styles.selectOption}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className={styles.helperText}>
              Used for transaction timestamps, report generation times, and scheduled jobs.
            </p>
          </div>

          <Button type="submit" variant="primary" disabled={saving || !selectedEntityId} isLoading={saving}>
            Save Localization Settings
          </Button>
        </form>
      </Card>

      {/* Info card */}
      <Card variant="accent">
        <div className={styles.infoTitle}>💡 About Localization</div>
        <div className={styles.infoBody}>
          Localization settings affect how financial data is displayed across the platform.
          Changing the base currency will not retroactively convert existing transactions — it sets
          the default for new transactions and report formatting. Multi-currency support automatically
          converts foreign currency transactions at the exchange rate at the time of import.
        </div>
      </Card>
    </div>
  );
}
