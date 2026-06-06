'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { Card, Button } from '@/components/ui';
import CardSkeletonBlock from './CardSkeletonBlock';
import type {
  EntityData,
  TeamMemberData,
  VendorManagerData,
  CardholderMappingData,
  ChaseOptOutData,
  GLCodeConfig,
  EntityProfileData,
} from '../types';
import styles from '../page.module.css';

// ─── Constants ──────────────────────────────────────────────────────────────────

const GL_DEFAULTS: GLCodeConfig = {
  cash_gl: '1010',
  suspense_gl: '2900',
  default_expense_gl: '6510',
  bank_fees_gl: '6180',
};

const GL_LABELS: Record<keyof GLCodeConfig, { label: string; description: string }> = {
  cash_gl: { label: 'Cash & Bank', description: 'Default GL for bank account cash flows' },
  suspense_gl: { label: 'Suspense / Clearing', description: 'Holding account for unresolved items' },
  default_expense_gl: { label: 'Default Expense', description: 'Fallback when no category matches' },
  bank_fees_gl: { label: 'Bank Fees & Charges', description: 'Auto-categorized bank fee transactions' },
};

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
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  { code: 'QAR', name: 'Qatari Riyal', symbol: 'QR' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'PLN', name: 'Polish Złoty', symbol: 'zł' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
];

const SUPPORTED_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'DE', name: 'Germany' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FR', name: 'France' },
  { code: 'FI', name: 'Finland' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'SG', name: 'Singapore' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IE', name: 'Ireland' },
  { code: 'SE', name: 'Sweden' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'PL', name: 'Poland' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'QA', name: 'Qatar' },
];

const SUPPORTED_TIMEZONES = [
  { value: 'America/New_York', label: 'EST — New York' },
  { value: 'America/Chicago', label: 'CST — Chicago' },
  { value: 'America/Denver', label: 'MST — Denver' },
  { value: 'America/Los_Angeles', label: 'PST — Los Angeles' },
  { value: 'America/Toronto', label: 'EST — Toronto' },
  { value: 'Europe/London', label: 'GMT — London' },
  { value: 'Europe/Paris', label: 'CET — Paris' },
  { value: 'Europe/Berlin', label: 'CET — Berlin' },
  { value: 'Europe/Amsterdam', label: 'CET — Amsterdam' },
  { value: 'Europe/Zurich', label: 'CET — Zurich' },
  { value: 'Europe/Tallinn', label: 'EET — Tallinn' },
  { value: 'Europe/Helsinki', label: 'EET — Helsinki' },
  { value: 'Europe/Stockholm', label: 'CET — Stockholm' },
  { value: 'Europe/Riga', label: 'EET — Riga' },
  { value: 'Europe/Vilnius', label: 'EET — Vilnius' },
  { value: 'Europe/Warsaw', label: 'CET — Warsaw' },
  { value: 'Asia/Dubai', label: 'GST — Dubai' },
  { value: 'Asia/Riyadh', label: 'AST — Riyadh' },
  { value: 'Asia/Kolkata', label: 'IST — Kolkata' },
  { value: 'Asia/Tokyo', label: 'JST — Tokyo' },
  { value: 'Asia/Singapore', label: 'SGT — Singapore' },
  { value: 'Asia/Hong_Kong', label: 'HKT — Hong Kong' },
  { value: 'Asia/Qatar', label: 'AST — Doha' },
  { value: 'Australia/Sydney', label: 'AEST — Sydney' },
  { value: 'Africa/Cairo', label: 'EET — Cairo' },
  { value: 'Africa/Johannesburg', label: 'SAST — Johannesburg' },
  { value: 'Africa/Lagos', label: 'WAT — Lagos' },
  { value: 'Africa/Nairobi', label: 'EAT — Nairobi' },
  { value: 'America/Sao_Paulo', label: 'BRT — São Paulo' },
  { value: 'America/Mexico_City', label: 'CST — Mexico City' },
];

// ─── Component ──────────────────────────────────────────────────────────────────

export default function EntityTab({
  loading: pageLoading,
  entities,
  teamMembers,
  userRole,
}: {
  loading: boolean;
  entities: EntityData[];
  teamMembers: TeamMemberData[];
  userRole: string;
}) {
  const canManage = userRole === 'owner' || userRole === 'admin';

  // ── Entity selector ─────────────────────────────────────────────────────────
  const [selectedEntityId, setSelectedEntityId] = useState(entities[0]?.id || '');

  // ── Entity profile state ────────────────────────────────────────────────────
  const [profile, setProfile] = useState<EntityProfileData | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // ── GL Codes state ──────────────────────────────────────────────────────────
  const [glCodes, setGlCodes] = useState<GLCodeConfig>({ ...GL_DEFAULTS });
  const [glSaving, setGlSaving] = useState(false);

  // ── Vendor Managers state ───────────────────────────────────────────────────
  const [vendorManagers, setVendorManagers] = useState<VendorManagerData[]>([]);
  const [vmPattern, setVmPattern] = useState('');
  const [vmUserId, setVmUserId] = useState('');
  const [vmNotes, setVmNotes] = useState('');
  const [vmAdding, setVmAdding] = useState(false);

  // ── Cardholder Mappings state ───────────────────────────────────────────────
  const [cardholderMappings, setCardholderMappings] = useState<CardholderMappingData[]>([]);
  const [chCardHolder, setChCardHolder] = useState('');
  const [chLast4, setChLast4] = useState('');
  const [chUserId, setChUserId] = useState('');
  const [chAdding, setChAdding] = useState(false);

  // ── Chase Opt-outs state ────────────────────────────────────────────────────
  const [optOuts, setOptOuts] = useState<ChaseOptOutData[]>([]);
  const [optOutPhone, setOptOutPhone] = useState('');
  const [optOutAdding, setOptOutAdding] = useState(false);

  // ── Approval Thresholds state ───────────────────────────────────────────────
  interface ApprovalThresholdData {
    id: string;
    min_amount: string;
    required_role: string;
    requires_dual_approval: boolean;
    created_at: string;
  }
  const [thresholds, setThresholds] = useState<ApprovalThresholdData[]>([]);
  const [thrAmount, setThrAmount] = useState('');
  const [thrRole, setThrRole] = useState('admin');
  const [thrDual, setThrDual] = useState(false);
  const [thrAdding, setThrAdding] = useState(false);

  // ── Feedback ────────────────────────────────────────────────────────────────
  const [saveResult, setSaveResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Update entity ID when entities prop changes ─────────────────────────────
  useEffect(() => {
    if (entities.length > 0 && !entities.find(e => e.id === selectedEntityId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedEntityId(entities[0].id);
    }
  }, [entities, selectedEntityId]);

  // ── Load all entity-scoped data ─────────────────────────────────────────────
  const loadEntityData = useCallback(async () => {
    if (!selectedEntityId) return;

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;

      const [profileRes, vmRes, chRes, optOutRes, thrRes] = await Promise.all([
        // Entity profile
        db.from('entities')
          .select('id, name, legal_name, tax_id, fiscal_year_end, base_currency, country, timezone')
          .eq('id', selectedEntityId)
          .single(),
        // Vendor managers
        db.from('vendor_managers')
          .select('id, vendor_pattern, manager_user_id, notes, created_at')
          .eq('entity_id', selectedEntityId)
          .order('created_at', { ascending: true }),
        // Cardholder mappings
        db.from('cardholder_mappings')
          .select('id, card_holder, card_last4, mapped_user_id, notes, created_at')
          .eq('entity_id', selectedEntityId)
          .order('created_at', { ascending: true }),
        // Chase opt-outs
        db.from('chase_opt_outs')
          .select('id, phone_number, entity_id, is_active, opted_out_at')
          .eq('entity_id', selectedEntityId)
          .eq('is_active', true),
        // Approval thresholds
        db.from('approval_thresholds')
          .select('id, min_amount, required_role, requires_dual_approval, created_at')
          .eq('entity_id', selectedEntityId)
          .order('min_amount', { ascending: true }),
      ]);

      if (profileRes.data) {
        const p = profileRes.data as Record<string, unknown>;
        setProfile({
          id: p.id as string,
          name: p.name as string,
          legal_name: (p.legal_name as string) || null,
          tax_id: (p.tax_id as string) || null,
          fiscal_year_end: (p.fiscal_year_end as string) || null,
          base_currency: (p.base_currency as string) || 'USD',
          country: (p.country as string) || 'US',
          timezone: (p.timezone as string) || 'America/New_York',
        });
      }

      setVendorManagers((vmRes.data || []) as VendorManagerData[]);
      setCardholderMappings((chRes.data || []) as CardholderMappingData[]);
      setOptOuts((optOutRes.data || []) as ChaseOptOutData[]);
      setThresholds((thrRes.data || []) as ApprovalThresholdData[]);

      // Load GL code overrides
      const { data: settingsData } = await db
        .from('entity_settings')
        .select('key, value')
        .eq('entity_id', selectedEntityId)
        .like('key', 'gl_code:%');

      const loadedGl = { ...GL_DEFAULTS };
      if (settingsData) {
        for (const row of settingsData as { key: string; value: string }[]) {
          const glKey = row.key.replace('gl_code:', '') as keyof GLCodeConfig;
          if (glKey in loadedGl) {
            loadedGl[glKey] = typeof row.value === 'string' ? row.value : String(row.value);
          }
        }
      }
      setGlCodes(loadedGl);
    } catch (err) {
      console.error('[EntityTab] Failed to load entity data:', err);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEntityData();
  }, [loadEntityData]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const getTeamMemberLabel = (userId: string) => {
    const member = teamMembers.find(m => m.user_id === userId);
    return member?.user_email || member?.invited_email || userId.slice(0, 8);
  };

  const acceptedMembers = teamMembers.filter(m => m.user_id && m.accepted_at);

  // ── Save: Entity Profile ────────────────────────────────────────────────────
  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !canManage) return;

    setProfileSaving(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: updateError } = await db
        .from('entities')
        .update({
          name: profile.name,
          legal_name: profile.legal_name,
          tax_id: profile.tax_id,
          fiscal_year_end: profile.fiscal_year_end,
          base_currency: profile.base_currency,
          country: profile.country,
          timezone: profile.timezone,
        })
        .eq('id', selectedEntityId);

      if (updateError) throw new Error(updateError.message);
      setSaveResult({ type: 'success', message: 'Entity profile saved successfully!' });
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Save: GL Codes ──────────────────────────────────────────────────────────
  const handleSaveGlCodes = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setGlSaving(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;

      for (const [key, value] of Object.entries(glCodes)) {
        await db
          .from('entity_settings')
          .upsert({
            entity_id: selectedEntityId,
            key: `gl_code:${key}`,
            value: value,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'entity_id,key' });
      }

      setSaveResult({ type: 'success', message: 'GL code overrides saved!' });
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save GL codes' });
    } finally {
      setGlSaving(false);
    }
  };

  // ── Add: Vendor Manager ─────────────────────────────────────────────────────
  const handleAddVendorManager = async (e: FormEvent) => {
    e.preventDefault();
    if (!vmPattern.trim() || !vmUserId || !canManage) return;

    setVmAdding(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: insertError } = await db
        .from('vendor_managers')
        .insert({
          entity_id: selectedEntityId,
          vendor_pattern: vmPattern.trim(),
          manager_user_id: vmUserId,
          notes: vmNotes.trim() || null,
        });

      if (insertError) throw new Error(insertError.message);
      setVmPattern('');
      setVmUserId('');
      setVmNotes('');
      setSaveResult({ type: 'success', message: 'Vendor manager added!' });
      await loadEntityData();
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add vendor manager' });
    } finally {
      setVmAdding(false);
    }
  };

  const handleDeleteVendorManager = async (id: string) => {
    if (!canManage) return;
    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      await db.from('vendor_managers').delete().eq('id', id);
      await loadEntityData();
    } catch (err) {
      console.error('[EntityTab] Failed to delete vendor manager:', err);
    }
  };

  // ── Add: Cardholder Mapping ─────────────────────────────────────────────────
  const handleAddCardholderMapping = async (e: FormEvent) => {
    e.preventDefault();
    if (!chCardHolder.trim() || !chUserId || !canManage) return;

    setChAdding(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: insertError } = await db
        .from('cardholder_mappings')
        .insert({
          entity_id: selectedEntityId,
          card_holder: chCardHolder.trim(),
          card_last4: chLast4.trim() || null,
          mapped_user_id: chUserId,
        });

      if (insertError) throw new Error(insertError.message);
      setChCardHolder('');
      setChLast4('');
      setChUserId('');
      setSaveResult({ type: 'success', message: 'Cardholder mapping added!' });
      await loadEntityData();
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add mapping' });
    } finally {
      setChAdding(false);
    }
  };

  const handleDeleteCardholderMapping = async (id: string) => {
    if (!canManage) return;
    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      await db.from('cardholder_mappings').delete().eq('id', id);
      await loadEntityData();
    } catch (err) {
      console.error('[EntityTab] Failed to delete cardholder mapping:', err);
    }
  };

  // ── Add: Chase Opt-Out ──────────────────────────────────────────────────────
  const handleAddOptOut = async (e: FormEvent) => {
    e.preventDefault();
    if (!optOutPhone.trim() || !canManage) return;

    setOptOutAdding(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: insertError } = await db
        .from('chase_opt_outs')
        .insert({
          entity_id: selectedEntityId,
          phone_number: optOutPhone.trim(),
          is_active: true,
          opted_out_at: new Date().toISOString(),
        });

      if (insertError) throw new Error(insertError.message);
      setOptOutPhone('');
      setSaveResult({ type: 'success', message: 'Opt-out added!' });
      await loadEntityData();
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add opt-out' });
    } finally {
      setOptOutAdding(false);
    }
  };

  const handleRemoveOptOut = async (id: string) => {
    if (!canManage) return;
    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      await db.from('chase_opt_outs').update({ is_active: false }).eq('id', id);
      await loadEntityData();
    } catch (err) {
      console.error('[EntityTab] Failed to remove opt-out:', err);
    }
  };

  // ── Add: Approval Threshold ─────────────────────────────────────────────────
  const handleAddThreshold = async (e: FormEvent) => {
    e.preventDefault();
    if (!thrAmount || !canManage) return;

    const amount = parseFloat(thrAmount);
    if (isNaN(amount) || amount <= 0) {
      setSaveResult({ type: 'error', message: 'Amount must be a positive number' });
      return;
    }

    setThrAdding(true);
    setSaveResult(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: insertError } = await db
        .from('approval_thresholds')
        .insert({
          entity_id: selectedEntityId,
          min_amount: amount,
          required_role: thrRole,
          requires_dual_approval: thrDual,
        });

      if (insertError) throw new Error(insertError.message);
      setThrAmount('');
      setThrRole('admin');
      setThrDual(false);
      setSaveResult({ type: 'success', message: 'Approval threshold added!' });
      await loadEntityData();
    } catch (err) {
      setSaveResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add threshold' });
    } finally {
      setThrAdding(false);
    }
  };

  const handleDeleteThreshold = async (id: string) => {
    if (!canManage) return;
    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      await db.from('approval_thresholds').delete().eq('id', id);
      await loadEntityData();
    } catch (err) {
      console.error('[EntityTab] Failed to delete threshold:', err);
    }
  };

  // ── Tax ID label/placeholder helper ─────────────────────────────────────────
  const EU_COUNTRIES = ['DE', 'FR', 'NL', 'IE', 'EE', 'FI', 'PL', 'LV', 'LT', 'SE'];
  const getTaxIdMeta = (country: string) => {
    if (country === 'US') return { label: 'Tax ID / EIN', placeholder: 'e.g. 12-3456789' };
    if (country === 'GB') return { label: 'Tax Reference / UTR', placeholder: 'e.g. 1234567890' };
    if (EU_COUNTRIES.includes(country)) return { label: 'VAT Number', placeholder: `e.g. ${country}123456789` };
    return { label: 'Tax ID', placeholder: 'e.g. 123456789' };
  };
  const taxIdMeta = getTaxIdMeta(profile?.country || 'US');

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (pageLoading) {
    return (
      <div className={styles.skeletonStack}>
        <CardSkeletonBlock />
        <CardSkeletonBlock />
        <CardSkeletonBlock />
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className={styles.tabContent}>
        <Card>
          <p className={styles.emptyText}>No entities found. Create an entity from the Portfolio page to configure settings.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {/* ── Feedback Banner ── */}
      {saveResult && (
        <Card className={saveResult.type === 'success' ? styles.resultSuccess : styles.resultError} padding="sm">
          <span className={saveResult.type === 'success' ? styles.resultSuccessText : styles.resultErrorText}>
            {saveResult.type === 'success' ? '✅' : '⚠️'} {saveResult.message}
          </span>
        </Card>
      )}

      {/* ── Entity Selector ── */}
      {entities.length > 1 && (
        <Card padding="sm">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label htmlFor="entity-tab-selector" className={styles.fieldLabel} style={{ margin: 0 }}>
              Configure Entity:
            </label>
            <select
              id="entity-tab-selector"
              className={styles.select}
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              style={{ flex: 1, maxWidth: '20rem' }}
            >
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id} className={styles.selectOption}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 1: Entity Profile                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>🏢 Entity Profile</h2>
        <p className={styles.localeDescription}>
          Business identity and regional settings for this entity.
        </p>

        {profile && (
          <form onSubmit={handleSaveProfile} className={styles.localeForm}>
            <div>
              <label htmlFor="entity-name" className={styles.fieldLabel}>Entity Name</label>
              <input
                id="entity-name"
                type="text"
                className={styles.select}
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                disabled={!canManage}
                maxLength={255}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label htmlFor="legal-name" className={styles.fieldLabel}>Legal Name</label>
                <input
                  id="legal-name"
                  type="text"
                  className={styles.select}
                  value={profile.legal_name || ''}
                  onChange={(e) => setProfile({ ...profile, legal_name: e.target.value || null })}
                  placeholder="e.g. Acme Corp LLC"
                  disabled={!canManage}
                />
              </div>
              <div>
                <label htmlFor="tax-id" className={styles.fieldLabel}>{taxIdMeta.label}</label>
                <input
                  id="tax-id"
                  type="text"
                  className={styles.select}
                  value={profile.tax_id || ''}
                  onChange={(e) => setProfile({ ...profile, tax_id: e.target.value || null })}
                  placeholder={taxIdMeta.placeholder}
                  disabled={!canManage}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <div>
                <label htmlFor="entity-currency" className={styles.fieldLabel}>Base Currency</label>
                <select
                  id="entity-currency"
                  className={styles.select}
                  value={profile.base_currency}
                  onChange={(e) => setProfile({ ...profile, base_currency: e.target.value })}
                  disabled={!canManage}
                >
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="entity-country" className={styles.fieldLabel}>Country</label>
                <select
                  id="entity-country"
                  className={styles.select}
                  value={profile.country}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                  disabled={!canManage}
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="entity-timezone" className={styles.fieldLabel}>Timezone</label>
                <select
                  id="entity-timezone"
                  className={styles.select}
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  disabled={!canManage}
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="fiscal-year" className={styles.fieldLabel}>Fiscal Year End (Month)</label>
              <select
                id="fiscal-year"
                className={styles.select}
                value={profile.fiscal_year_end || '12'}
                onChange={(e) => setProfile({ ...profile, fiscal_year_end: e.target.value })}
                disabled={!canManage}
                style={{ maxWidth: '12rem' }}
              >
                {Array.from({ length: 12 }, (_, i) => {
                  const month = i + 1;
                  const name = new Date(2000, i).toLocaleString('en-US', { month: 'long' });
                  return <option key={month} value={String(month)}>{name}</option>;
                })}
              </select>
            </div>

            {canManage && (
              <Button type="submit" variant="primary" disabled={profileSaving} isLoading={profileSaving}>
                Save Entity Profile
              </Button>
            )}
          </form>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 2: GL Code Configuration                                       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>📒 GL Code Overrides</h2>
        <p className={styles.localeDescription}>
          Customize the default General Ledger codes used for automatic categorization. Leave defaults unless you have a custom chart of accounts.
        </p>

        <form onSubmit={handleSaveGlCodes} className={styles.localeForm}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {(Object.keys(GL_LABELS) as Array<keyof GLCodeConfig>).map((key) => (
              <div key={key}>
                <label htmlFor={`gl-${key}`} className={styles.fieldLabel}>
                  {GL_LABELS[key].label}
                </label>
                <input
                  id={`gl-${key}`}
                  type="text"
                  className={styles.select}
                  value={glCodes[key]}
                  onChange={(e) => setGlCodes({ ...glCodes, [key]: e.target.value })}
                  disabled={!canManage}
                  maxLength={10}
                />
                <p className={styles.helperText}>{GL_LABELS[key].description}</p>
              </div>
            ))}
          </div>

          {canManage && (
            <Button type="submit" variant="primary" disabled={glSaving} isLoading={glSaving}>
              Save GL Codes
            </Button>
          )}
        </form>
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 3: Vendor Manager Assignments                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>🤝 Vendor Manager Assignments</h2>
        <p className={styles.localeDescription}>
          Assign team members as vendor managers. The chase agent will route receipt requests to them for matching vendors instead of the cardholder. Patterns use SQL wildcards: <code>%</code> matches any text, <code>_</code> matches one character.
        </p>

        {/* Existing vendor managers */}
        {vendorManagers.length > 0 ? (
          <div className={styles.memberList}>
            {vendorManagers.map((vm) => (
              <div key={vm.id} className={styles.memberRow}>
                <div>
                  <span className={styles.memberName}>
                    <code>{vm.vendor_pattern}</code>
                  </span>
                  <span className={styles.memberEmail}>
                    → {getTeamMemberLabel(vm.manager_user_id)}
                    {vm.notes && ` • ${vm.notes}`}
                  </span>
                </div>
                {canManage && (
                  <div className={styles.memberActions}>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteVendorManager(vm.id)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No vendor managers configured. The chase agent will use cardholder routing by default.</p>
        )}

        {/* Add form */}
        {canManage && (
          <form onSubmit={handleAddVendorManager} className={styles.inviteForm} style={{ marginTop: '1rem' }}>
            <div className={styles.inviteEmailField}>
              <label htmlFor="vm-pattern" className={styles.fieldLabel}>Vendor Pattern</label>
              <input
                id="vm-pattern"
                type="text"
                className={styles.select}
                value={vmPattern}
                onChange={(e) => setVmPattern(e.target.value)}
                placeholder="e.g. %AMAZON% or UBER%"
                maxLength={200}
              />
            </div>
            <div className={styles.inviteRoleField}>
              <label htmlFor="vm-manager" className={styles.fieldLabel}>Assigned To</label>
              <select
                id="vm-manager"
                className={styles.select}
                value={vmUserId}
                onChange={(e) => setVmUserId(e.target.value)}
              >
                <option value="">Select team member…</option>
                {acceptedMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id || ''}>
                    {m.user_email || m.invited_email}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '8rem' }}>
              <label htmlFor="vm-notes" className={styles.fieldLabel}>Notes</label>
              <input
                id="vm-notes"
                type="text"
                className={styles.select}
                value={vmNotes}
                onChange={(e) => setVmNotes(e.target.value)}
                placeholder="Optional"
                maxLength={200}
              />
            </div>
            <Button type="submit" variant="primary" disabled={vmAdding || !vmPattern.trim() || !vmUserId} isLoading={vmAdding} style={{ alignSelf: 'flex-end' }}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 4: Cardholder Mappings                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>💳 Cardholder Mappings</h2>
        <p className={styles.localeDescription}>
          Map card holder names from your bank feed to specific team members. This ensures the chase agent contacts the right person for receipt requests.
        </p>

        {cardholderMappings.length > 0 ? (
          <div className={styles.memberList}>
            {cardholderMappings.map((ch) => (
              <div key={ch.id} className={styles.memberRow}>
                <div>
                  <span className={styles.memberName}>
                    {ch.card_holder}
                    {ch.card_last4 && <span className={styles.memberEmail}> (****{ch.card_last4})</span>}
                  </span>
                  <span className={styles.memberEmail}>
                    → {getTeamMemberLabel(ch.mapped_user_id)}
                  </span>
                </div>
                {canManage && (
                  <div className={styles.memberActions}>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteCardholderMapping(ch.id)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>
            No cardholder mappings. The chase agent will use fuzzy name matching against team member emails.
          </p>
        )}

        {canManage && (
          <form onSubmit={handleAddCardholderMapping} className={styles.inviteForm} style={{ marginTop: '1rem' }}>
            <div className={styles.inviteEmailField}>
              <label htmlFor="ch-name" className={styles.fieldLabel}>Card Holder Name</label>
              <input
                id="ch-name"
                type="text"
                className={styles.select}
                value={chCardHolder}
                onChange={(e) => setChCardHolder(e.target.value)}
                placeholder="Name as shown on bank feed"
                maxLength={200}
              />
            </div>
            <div style={{ flex: '0 0 6rem' }}>
              <label htmlFor="ch-last4" className={styles.fieldLabel}>Last 4</label>
              <input
                id="ch-last4"
                type="text"
                className={styles.select}
                value={chLast4}
                onChange={(e) => setChLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                maxLength={4}
              />
            </div>
            <div className={styles.inviteRoleField}>
              <label htmlFor="ch-user" className={styles.fieldLabel}>Maps To</label>
              <select
                id="ch-user"
                className={styles.select}
                value={chUserId}
                onChange={(e) => setChUserId(e.target.value)}
              >
                <option value="">Select team member…</option>
                {acceptedMembers.map((m) => (
                  <option key={m.user_id} value={m.user_id || ''}>
                    {m.user_email || m.invited_email}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary" disabled={chAdding || !chCardHolder.trim() || !chUserId} isLoading={chAdding} style={{ alignSelf: 'flex-end' }}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 5: Chase Opt-Outs                                              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>🔕 Chase Opt-Outs</h2>
        <p className={styles.localeDescription}>
          Phone numbers or identifiers excluded from receipt chase messages. Opted-out contacts will not receive SMS, WhatsApp, or other chase notifications.
        </p>

        {optOuts.length > 0 ? (
          <div className={styles.memberList}>
            {optOuts.map((opt) => (
              <div key={opt.id} className={styles.memberRow}>
                <div>
                  <span className={styles.memberName}>{opt.phone_number}</span>
                  <span className={styles.memberEmail}>
                    opted out {opt.opted_out_at ? new Date(opt.opted_out_at).toLocaleDateString() : ''}
                  </span>
                </div>
                {canManage && (
                  <div className={styles.memberActions}>
                    <Button variant="secondary" size="sm" onClick={() => handleRemoveOptOut(opt.id)}>
                      Re-enable
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No opt-outs. All contacts are eligible for chase messages.</p>
        )}

        {canManage && (
          <form onSubmit={handleAddOptOut} className={styles.inviteForm} style={{ marginTop: '1rem' }}>
            <div className={styles.inviteEmailField}>
              <label htmlFor="optout-phone" className={styles.fieldLabel}>Phone Number / Identifier</label>
              <input
                id="optout-phone"
                type="text"
                className={styles.select}
                value={optOutPhone}
                onChange={(e) => setOptOutPhone(e.target.value)}
                placeholder="e.g. +1234567890"
                maxLength={30}
              />
            </div>
            <Button type="submit" variant="primary" disabled={optOutAdding || !optOutPhone.trim()} isLoading={optOutAdding} style={{ alignSelf: 'flex-end' }}>
              Add Opt-Out
            </Button>
          </form>
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* Section 6: Approval Thresholds                                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Card>
        <h2 className={styles.sectionTitle}>✅ Approval Thresholds</h2>
        <p className={styles.localeDescription}>
          Transactions above a configured amount require explicit approval from a team member with the required role before they can be finalized.
        </p>

        {thresholds.length > 0 ? (
          <div className={styles.memberList}>
            {thresholds.map((thr) => (
              <div key={thr.id} className={styles.memberRow}>
                <div>
                  <span className={styles.memberName}>
                    ≥ {profile?.base_currency || '$'} {Number(thr.min_amount).toLocaleString()}
                  </span>
                  <span className={styles.memberEmail}>
                    → requires {thr.required_role}
                    {thr.requires_dual_approval && ' (dual approval)'}
                  </span>
                </div>
                {canManage && (
                  <div className={styles.memberActions}>
                    <Button variant="destructive" size="sm" onClick={() => handleDeleteThreshold(thr.id)}>
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>No approval thresholds configured. All transactions will be processed without approval requirements.</p>
        )}

        {canManage && (
          <form onSubmit={handleAddThreshold} className={styles.inviteForm} style={{ marginTop: '1rem' }}>
            <div style={{ flex: '0 0 10rem' }}>
              <label htmlFor="thr-amount" className={styles.fieldLabel}>Minimum Amount</label>
              <input
                id="thr-amount"
                type="number"
                className={styles.select}
                value={thrAmount}
                onChange={(e) => setThrAmount(e.target.value)}
                placeholder="e.g. 5000"
                min="0.01"
                step="0.01"
              />
            </div>
            <div className={styles.inviteRoleField}>
              <label htmlFor="thr-role" className={styles.fieldLabel}>Required Role</label>
              <select
                id="thr-role"
                className={styles.select}
                value={thrRole}
                onChange={(e) => setThrRole(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-end', paddingBottom: '0.25rem' }}>
              <input
                id="thr-dual"
                type="checkbox"
                checked={thrDual}
                onChange={(e) => setThrDual(e.target.checked)}
              />
              <label htmlFor="thr-dual" className={styles.fieldLabel} style={{ margin: 0 }}>Dual approval</label>
            </div>
            <Button type="submit" variant="primary" disabled={thrAdding || !thrAmount} isLoading={thrAdding} style={{ alignSelf: 'flex-end' }}>
              Add
            </Button>
          </form>
        )}
      </Card>

      {/* ── Info Card ── */}
      <Card variant="accent">
        <div className={styles.infoTitle}>💡 About Entity Settings</div>
        <div className={styles.infoBody}>
          Entity settings are scoped to the currently selected entity. Changes to GL codes, vendor managers, and cardholder mappings
          only affect how data is processed for this entity. Currency changes apply to new transactions only — existing data is not retroactively converted.
          Vendor manager patterns and cardholder mappings are used by the autonomous chase agent when routing receipt collection requests.
          Approval thresholds enforce review workflows for high-value transactions.
        </div>
      </Card>
    </div>
  );
}
