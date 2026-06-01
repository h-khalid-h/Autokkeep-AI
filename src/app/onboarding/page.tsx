'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSupportedCurrencies } from '@/lib/currency/converter';
import Logo from '@/components/ui/Logo';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

const ONBOARDING_STORAGE_KEY = 'autokkeep_onboarding_state';

interface OnboardingState {
  currentStep: OnboardingStep;
  entityName: string;
  currency: string;
  fiscalYearEnd: string;
  selectedLedger: string;
  selectedChannel: string;
  entityId: string | null;
  bankConnected: boolean;
  regionCountry: string;
  regionCurrency: string;
  regionTimezone: string;
}

type OnboardingStep = 'welcome' | 'entity' | 'region' | 'bank' | 'ledger' | 'channel' | 'complete';

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

const STEPS: { id: OnboardingStep; title: string; icon: string; description: string }[] = [
  { id: 'welcome', title: 'Welcome', icon: '👋', description: 'Let\'s set up your AI financial operations' },
  { id: 'entity', title: 'Create Entity', icon: '🏢', description: 'Set up your business entity' },
  { id: 'region', title: 'Region', icon: '🌍', description: 'Set your country, currency, and timezone' },
  { id: 'bank', title: 'Connect Bank', icon: '🏦', description: 'Link your bank accounts via Plaid' },
  { id: 'ledger', title: 'Connect Ledger', icon: '📗', description: 'Connect QuickBooks or Xero' },
  { id: 'channel', title: 'Set Up Channel', icon: '💬', description: 'Choose your receipt chase channel' },
  { id: 'complete', title: 'All Set!', icon: '🚀', description: 'Your AI financial engine is ready' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [entityName, setEntityName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('12');
  const [selectedLedger, setSelectedLedger] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');

  // Persisted IDs from entity creation
  const [entityId, setEntityId] = useState<string | null>(null);

  // Loading & error state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bank connection state
  const [bankConnected, setBankConnected] = useState(false);
  const [bankLinkToken, setBankLinkToken] = useState<string | null>(null);

  // Region step state
  const [regionCountry, setRegionCountry] = useState('US');
  const [regionCurrency, setRegionCurrency] = useState('USD');
  const [regionTimezone, setRegionTimezone] = useState('America/New_York');
  const supportedCurrencies = getSupportedCurrencies();

  // ── Persist state to localStorage ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (saved) {
        const state: OnboardingState = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (state.currentStep) setCurrentStep(state.currentStep);
        if (state.entityName) setEntityName(state.entityName);
        if (state.currency) setCurrency(state.currency);
        if (state.fiscalYearEnd) setFiscalYearEnd(state.fiscalYearEnd);
        if (state.selectedLedger) setSelectedLedger(state.selectedLedger);
        if (state.selectedChannel) setSelectedChannel(state.selectedChannel);
        if (state.entityId) setEntityId(state.entityId);
        if (state.bankConnected) setBankConnected(state.bankConnected);
        if (state.regionCountry) setRegionCountry(state.regionCountry);
        if (state.regionCurrency) setRegionCurrency(state.regionCurrency);
        if (state.regionTimezone) setRegionTimezone(state.regionTimezone);
      }
    } catch (_e) {
      console.warn('[Onboarding] Failed to restore state:', _e);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const state: OnboardingState = {
      currentStep, entityName, currency, fiscalYearEnd,
      selectedLedger, selectedChannel, entityId, bankConnected,
      regionCountry, regionCurrency, regionTimezone,
    };
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    } catch (_e) {
      // Ignore storage errors
    }
  }, [currentStep, entityName, currency, fiscalYearEnd, selectedLedger, selectedChannel, entityId, bankConnected, regionCountry, regionCurrency, regionTimezone]);

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentIndex) / (STEPS.length - 1)) * 100;

  const goNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setError(null);
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setError(null);
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  // ── Step 1: Create entity in Supabase ──────────────────────────────────
  const handleCreateEntity = async () => {
    if (!entityName.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // 1. Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError('You must be logged in to create an entity. Please sign in first.');
        setLoading(false);
        return;
      }

      // 2. Check if user already has an org, if not create one
      const { data: existingMembership } = await (supabase as unknown as SupabaseQueryClient)
        .from('team_members')
        .select('id, org_id')
        .eq('user_id', user.id)
        .single();

      let orgId: string;

      if (existingMembership?.org_id) {
        orgId = existingMembership.org_id;
      } else {
        // Create a new organization
        const { data: newOrg, error: orgError } = await (supabase as unknown as SupabaseQueryClient)
          .from('organizations')
          .insert({ name: `${entityName} Org`, slug: `${entityName} Org`.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''), owner_id: user.id })
          .select('id')
          .single();

        if (orgError || !newOrg) {
          setError('Failed to create organization. Please try again.');
          setLoading(false);
          return;
        }
        orgId = newOrg.id;

        // 3. Add user as team member with owner role
        const { error: memberError } = await (supabase as unknown as SupabaseQueryClient)
          .from('team_members')
          .insert({
            user_id: user.id,
            org_id: orgId,
            role: 'owner',
          });

        if (memberError) {
          setError('Failed to set up team membership. Please try again.');
          setLoading(false);
          return;
        }
      }

      // 4. Create the entity
      const { data: newEntity, error: entityError } = await (supabase as unknown as SupabaseQueryClient)
        .from('entities')
        .insert({
          name: entityName.trim(),
          base_currency: currency,
          fiscal_year_end: fiscalYearEnd,
          org_id: orgId,
        })
        .select('id')
        .single();

      if (entityError || !newEntity) {
        setError('Failed to create entity. Please try again.');
        setLoading(false);
        return;
      }

      // 5. Store entityId for subsequent steps
      setEntityId(newEntity.id);
      goNext();
    } catch (err) {
      console.error('[Onboarding] Entity creation error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step: Save region/localization ─────────────────────────────────────
  const handleSaveRegion = async () => {
    if (!entityId) {
      setError('Entity not found. Please go back and create one first.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: updateError } = await (supabase as unknown as SupabaseQueryClient)
        .from('entities')
        .update({
          base_currency: regionCurrency,
          country: regionCountry,
          timezone: regionTimezone,
        })
        .eq('id', entityId);

      if (updateError) {
        setError('Failed to save regional settings. Please try again.');
        setLoading(false);
        return;
      }

      goNext();
    } catch (err) {
      console.error('[Onboarding] Region save error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Initiate Plaid Link ────────────────────────────────────────
  const handleConnectBank = async () => {
    if (!entityId) {
      setError('Entity not found. Please go back and create one first.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to initiate bank connection. You can skip and connect later.');
        setLoading(false);
        return;
      }

      const { link_token } = await res.json();
      setBankLinkToken(link_token);

      // Open Plaid Link
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) {
        const PlaidLink = (window as unknown as Record<string, unknown>).Plaid as Record<string, (...args: unknown[]) => unknown>;
        const handler = PlaidLink.create({
          token: link_token,
          onSuccess: async (publicToken: string, metadata: Record<string, unknown>) => {
            try {
              const res = await fetch('/api/plaid/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  publicToken,
                  entityId,
                  institutionName: (metadata?.institution as Record<string, unknown>)?.name || 'Unknown',
                }),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Exchange failed');
              }
              setBankConnected(true);
              goNext();
            } catch (exchangeErr) {
              console.error('[Onboarding] Plaid exchange error:', exchangeErr);
              setError('Connected to bank but failed to save. Please try again from Settings.');
            }
          },
          onExit: () => {
            setLoading(false);
          },
        });
        (handler as Record<string, unknown> & { open: () => void }).open();
      } else {
        setError('Plaid Link SDK not loaded. Please refresh the page and try again.');
        setLoading(false);
      }
    } catch (err) {
      console.error('[Onboarding] Plaid link error:', err);
      setError('Failed to connect to Plaid. You can skip and connect later from the dashboard.');
      setLoading(false);
    }
  };

  // ── Step 3: Ledger OAuth redirect ──────────────────────────────────────
  const handleConnectLedger = async () => {
    if (!entityId) {
      setError('Entity not found. Please go back and create one first.');
      return;
    }

    if (selectedLedger === 'none') {
      goNext();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (selectedLedger === 'quickbooks') {
        // Save onboarding state before OAuth redirect
        const stateToSave: OnboardingState = {
          currentStep: 'channel' as OnboardingStep, // Skip to next step on return
          entityName, currency, fiscalYearEnd,
          selectedLedger, selectedChannel, entityId, bankConnected,
          regionCountry, regionCurrency, regionTimezone,
        };
        localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(stateToSave));
        localStorage.setItem('autokkeep_oauth_return', 'onboarding');
        // The GET endpoint returns a redirect, so we navigate directly
        window.location.href = `/api/ledger/quickbooks/auth?entityId=${entityId}&returnTo=/onboarding`;
        return;
      }

      if (selectedLedger === 'xero') {
        // Save onboarding state before OAuth redirect
        const stateToSave: OnboardingState = {
          currentStep: 'channel' as OnboardingStep, // Skip to next step on return
          entityName, currency, fiscalYearEnd,
          selectedLedger, selectedChannel, entityId, bankConnected,
          regionCountry, regionCurrency, regionTimezone,
        };
        localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(stateToSave));
        localStorage.setItem('autokkeep_oauth_return', 'onboarding');
        window.location.href = `/api/ledger/xero/auth?entityId=${entityId}&returnTo=/onboarding`;
        return;
      }

      // Fallback: just proceed
      goNext();
    } catch (err) {
      console.error('[Onboarding] Ledger connect error:', err);
      setError('Failed to start ledger connection. You can skip and connect later.');
      setLoading(false);
    }
  };

  // ── Step 4: Channel setup ──────────────────────────────────────────────
  const handleSetupChannel = async () => {
    if (!entityId || !selectedChannel) return;
    setLoading(true);
    setError(null);

    try {
      if (selectedChannel === 'slack') {
        // Redirect to Slack OAuth install flow
        window.location.href = `/api/channels/slack/install?entityId=${entityId}`;
        return;
      }

      // For other channels (teams, sms, whatsapp): save preference and proceed
      const supabase = createClient();
      const { error: channelError } = await (supabase as unknown as SupabaseQueryClient)
        .from('channel_connections')
        .insert({
          entity_id: entityId,
          channel_type: selectedChannel,
          is_active: false, // Pending setup
        });

      if (channelError) {
        console.error('[Onboarding] Channel save error:', channelError);
        // Non-fatal — still proceed
      }

      goNext();
    } catch (err) {
      console.error('[Onboarding] Channel setup error:', err);
      setError('Failed to save channel preference. You can configure this later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo size={36} />
          <span className="text-gradient" style={{ fontSize: '18px', fontWeight: 700 }}>
            Autokkeep Setup
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard')}>Skip for now →</button>
      </header>

      {/* Progress Bar */}
      <div style={{ padding: '0 32px', marginTop: '24px' }}>
        <div
          role="progressbar"
          aria-valuenow={currentIndex}
          aria-valuemin={0}
          aria-valuemax={STEPS.length - 1}
          aria-label={`Onboarding progress: step ${currentIndex + 1} of ${STEPS.length}`}
          style={{
            height: '4px', borderRadius: '2px',
            background: 'var(--bg-tertiary)', overflow: 'hidden',
          }}
        >
          <div style={{
            height: '100%', borderRadius: '2px',
            background: 'var(--accent-gradient)',
            width: `${progress}%`,
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              aria-current={i === currentIndex ? 'step' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                opacity: i <= currentIndex ? 1 : 0.35,
                transition: 'opacity 0.3s ease',
              }}
            >
              <span style={{ fontSize: '14px' }}>{step.icon}</span>
              <span className="text-caption" style={{
                fontWeight: i === currentIndex ? 600 : 400,
                color: i === currentIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div
        aria-live="polite"
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '48px 32px',
        }}
      >
        <div style={{ maxWidth: '560px', width: '100%' }}>

          {/* Error Banner */}
          {error && (
            <div style={{
              padding: '12px 16px',
              marginBottom: '20px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--status-error, #ef4444)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <span>⚠️</span>
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: 'inherit', cursor: 'pointer', fontSize: '16px',
                }}
              >×</button>
            </div>
          )}

          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '24px' }}>👋</div>
              <h1 className="text-h1" style={{ marginBottom: '16px' }}>Welcome to Autokkeep</h1>
              <p className="text-body" style={{ marginBottom: '40px', maxWidth: '400px', margin: '0 auto 40px' }}>
                Let&apos;s get your AI financial operations running in under 5 minutes.
                We&apos;ll connect your bank, your ledger, and your preferred communication channel.
              </p>
              <button className="btn btn-primary btn-lg" onClick={goNext} aria-label="Start onboarding">
                Let&apos;s Get Started →
              </button>
            </div>
          )}

          {/* Entity Step */}
          {currentStep === 'entity' && (
            <div role="form" aria-label="Create entity">
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>🏢 Create Your Entity</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                An entity represents a company or business you&apos;re managing finances for.
              </p>
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="entity-name" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Entity Name</label>
                  <input
                    id="entity-name"
                    className="input"
                    type="text"
                    placeholder="e.g. Acme Corp, My Startup LLC"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="entity-currency" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Base Currency</label>
                  <select
                    id="entity-currency"
                    className="input"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={loading}
                    aria-label="Select base currency"
                  >
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="entity-fiscal-year" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Fiscal Year End</label>
                  <select
                    id="entity-fiscal-year"
                    className="input"
                    value={fiscalYearEnd}
                    onChange={(e) => setFiscalYearEnd(e.target.value)}
                    disabled={loading}
                    aria-label="Select fiscal year end month"
                  >
                    <option value="12">December</option>
                    <option value="3">March</option>
                    <option value="6">June</option>
                    <option value="9">September</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">← Back</button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateEntity}
                  disabled={!entityName.trim() || loading}
                  aria-label="Create entity and continue"
                >
                  {loading ? '⏳ Creating…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Region Step */}
          {currentStep === 'region' && (
            <div role="form" aria-label="Set your region">
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>🌍 Set Your Region</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                Configure your country, currency, and timezone for accurate financial reporting.
              </p>
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="region-country" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Country</label>
                  <select
                    id="region-country"
                    className="input"
                    value={regionCountry}
                    onChange={(e) => setRegionCountry(e.target.value)}
                    disabled={loading}
                    style={{ width: '100%' }}
                    aria-label="Select your country"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="region-currency" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Base Currency</label>
                  <select
                    id="region-currency"
                    className="input"
                    value={regionCurrency}
                    onChange={(e) => setRegionCurrency(e.target.value)}
                    disabled={loading}
                    style={{ width: '100%' }}
                    aria-label="Select your base currency"
                  >
                    {supportedCurrencies.map((curr) => (
                      <option key={curr.code} value={curr.code}>{curr.symbol} {curr.code} — {curr.name}</option>
                    ))}
                  </select>
                  <p className="text-caption" style={{ marginTop: '4px' }}>
                    All monetary values will be displayed in this currency.
                  </p>
                </div>
                <div>
                  <label htmlFor="region-timezone" className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Timezone</label>
                  <select
                    id="region-timezone"
                    className="input"
                    value={regionTimezone}
                    onChange={(e) => setRegionTimezone(e.target.value)}
                    disabled={loading}
                    style={{ width: '100%' }}
                    aria-label="Select your timezone"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="text-caption" style={{ marginTop: '4px' }}>
                    Used for transaction timestamps and report scheduling.
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">← Back</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveRegion}
                  disabled={loading}
                  aria-label="Save region settings and continue"
                >
                  {loading ? '⏳ Saving…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Bank Step */}
          {currentStep === 'bank' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>🏦 Connect Your Bank</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                We use Plaid to securely connect to your bank. Your credentials are never stored on our servers.
              </p>
              <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                {bankConnected ? (
                  <>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>✅</div>
                    <p className="text-body" style={{ marginBottom: '8px', color: 'var(--status-success)' }}>
                      Bank account connected successfully!
                    </p>
                    <p className="text-caption">
                      Autokkeep will begin importing transactions shortly.
                    </p>
                  </>
                ) : bankLinkToken ? (
                  <>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔗</div>
                    <p className="text-body" style={{ marginBottom: '16px' }}>
                      Plaid Link is opening…
                    </p>
                    <p className="text-caption">
                      If the window didn&apos;t open, please check your pop-up blocker.
                    </p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                    <p className="text-body" style={{ marginBottom: '24px' }}>
                      Click below to open Plaid Link and connect your bank accounts.
                      Autokkeep will automatically import and categorize your transactions.
                    </p>
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleConnectBank}
                      disabled={loading}
                    >
                      {loading ? '⏳ Connecting…' : '🏦 Connect Bank Account'}
                    </button>
                    <p className="text-caption" style={{ marginTop: '16px' }}>
                      Supported: Chase, Bank of America, Wells Fargo, Capital One, and 12,000+ more
                    </p>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">← Back</button>
                <button className="btn btn-ghost" onClick={goNext} aria-label={bankConnected ? 'Continue to next step' : 'Skip bank connection'}>
                  {bankConnected ? 'Continue →' : 'Skip for now →'}
                </button>
              </div>
            </div>
          )}

          {/* Ledger Step */}
          {currentStep === 'ledger' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>📗 Connect Your Ledger</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                Choose your accounting software. We&apos;ll sync your Chart of Accounts and push journal entries automatically.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'quickbooks', name: 'QuickBooks Online', icon: '📗', desc: 'Most popular for US businesses' },
                  { id: 'xero', name: 'Xero', icon: '📘', desc: 'Popular worldwide, especially UK/AU' },
                  { id: 'none', name: 'No ledger yet', icon: '📋', desc: 'I\'ll connect one later' },
                ].map((ledger) => (
                  <button
                    key={ledger.id}
                    className="card"
                    onClick={() => setSelectedLedger(ledger.id)}
                    disabled={loading}
                    style={{
                      padding: '20px',
                      display: 'flex', alignItems: 'center', gap: '16px',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      border: selectedLedger === ledger.id
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-primary)',
                      transition: 'border 0.2s ease',
                    }}
                  >
                    <span style={{ fontSize: '2rem' }}>{ledger.icon}</span>
                    <div>
                      <div className="text-h4">{ledger.name}</div>
                      <div className="text-caption">{ledger.desc}</div>
                    </div>
                    {selectedLedger === ledger.id && (
                      <span style={{ marginLeft: 'auto', color: 'var(--status-success)' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">← Back</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={goNext} aria-label="Skip ledger connection">Skip →</button>
                  <button
                    className="btn btn-primary"
                    onClick={handleConnectLedger}
                    disabled={!selectedLedger || loading}
                    aria-label={selectedLedger === 'none' ? 'Continue to next step' : 'Connect ledger and continue'}
                  >
                    {loading ? '⏳ Connecting…' : selectedLedger === 'none' ? 'Continue →' : 'Connect & Continue →'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Channel Step */}
          {currentStep === 'channel' && (
            <div>
              <style jsx>{`
                .onboarding-channel-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 12px;
                }
                @media (max-width: 480px) {
                  .onboarding-channel-grid {
                    grid-template-columns: 1fr;
                  }
                }
              `}</style>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>💬 Set Up Receipt Chase</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                Choose how Autokkeep should reach your team when it needs a receipt or categorization confirmation.
              </p>
              <div className="onboarding-channel-grid">
                {[
                  { id: 'slack', name: 'Slack', icon: '💬', desc: 'Interactive messages', available: true },
                  { id: 'teams', name: 'Teams', icon: '🟣', desc: 'Adaptive Cards', available: false },
                  { id: 'sms', name: 'SMS', icon: '📲', desc: 'Text messages', available: false },
                  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', desc: 'Business messaging', available: false },
                ].map((channel) => (
                  <button
                    key={channel.id}
                    className="card"
                    onClick={() => channel.available && setSelectedChannel(channel.id)}
                    disabled={loading || !channel.available}
                    aria-label={`Select ${channel.name} as receipt chase channel${!channel.available ? ' (coming soon)' : ''}`}
                    style={{
                      padding: '24px',
                      cursor: channel.available ? 'pointer' : 'not-allowed',
                      textAlign: 'center',
                      border: selectedChannel === channel.id
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-primary)',
                      transition: 'border 0.2s ease, opacity 0.2s ease',
                      position: 'relative',
                      opacity: channel.available ? 1 : 0.5,
                    }}
                  >
                    {!channel.available && (
                      <span style={{
                        position: 'absolute', top: '8px', right: '8px',
                        fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                      }}>Coming soon</span>
                    )}
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{channel.icon}</div>
                    <div className="text-h4">{channel.name}</div>
                    <div className="text-caption">{channel.desc}</div>
                    {selectedChannel === channel.id && (
                      <div style={{ color: 'var(--status-success)', marginTop: '8px' }}>✓ Selected</div>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">← Back</button>
                <button
                  className="btn btn-primary"
                  onClick={handleSetupChannel}
                  disabled={!selectedChannel || loading}
                  aria-label="Finish channel setup"
                >
                  {loading ? '⏳ Setting up…' : 'Finish Setup →'}
                </button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px', fontSize: '2.5rem',
              }}>🚀</div>
              <h1 className="text-h1" style={{ marginBottom: '16px' }}>You&apos;re All Set!</h1>
              <p className="text-body" style={{ marginBottom: '12px', maxWidth: '420px', margin: '0 auto 12px' }}>
                {entityName ? `${entityName} is ready to go.` : 'Your entity is ready to go.'}
                {' '}Autokkeep will now:
              </p>
              <div className="card" style={{ padding: '24px', textAlign: 'left', marginBottom: '32px' }}>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li className="text-body">✅ Automatically import new bank transactions</li>
                  <li className="text-body">✅ Categorize each transaction using the dual-engine AI</li>
                  <li className="text-body">✅ Auto-approve high-confidence matches (≥95%)</li>
                  <li className="text-body">✅ Flag exceptions for your review</li>
                  <li className="text-body">✅ Chase missing receipts via {selectedChannel || 'your channel'}</li>
                  <li className="text-body">✅ Sync approved entries to {selectedLedger === 'quickbooks' ? 'QuickBooks' : selectedLedger === 'xero' ? 'Xero' : 'your ledger'}</li>
                </ul>
              </div>
              <button
                className="btn btn-primary btn-lg"
                onClick={() => {
                  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                  router.push('/dashboard');
                }}
              >
                Go to Dashboard →
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
