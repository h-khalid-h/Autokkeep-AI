'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getSupportedCurrencies } from '@/lib/currency/converter';
import { useToast } from '@/components/ui';
import Logo from '@/components/ui/Logo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Progress } from '@/components/ui/Progress';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import styles from './page.module.css';

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
  country: string;
  timezone: string;
}

type OnboardingStep = 'welcome' | 'entity' | 'bank' | 'ledger' | 'channel' | 'complete';

// Country → default currency + timezone mapping
const COUNTRY_DEFAULTS: Record<string, { currency: string; timezone: string }> = {
  US: { currency: 'USD', timezone: 'America/New_York' },
  GB: { currency: 'GBP', timezone: 'Europe/London' },
  AE: { currency: 'AED', timezone: 'Asia/Dubai' },
  SA: { currency: 'SAR', timezone: 'Asia/Riyadh' },
  EG: { currency: 'EGP', timezone: 'Africa/Cairo' },
  DE: { currency: 'EUR', timezone: 'Europe/Berlin' },
  EE: { currency: 'EUR', timezone: 'Europe/Tallinn' },
  FR: { currency: 'EUR', timezone: 'Europe/Paris' },
  FI: { currency: 'EUR', timezone: 'Europe/Helsinki' },
  CA: { currency: 'CAD', timezone: 'America/Toronto' },
  AU: { currency: 'AUD', timezone: 'Australia/Sydney' },
  IN: { currency: 'INR', timezone: 'Asia/Kolkata' },
  JP: { currency: 'JPY', timezone: 'Asia/Tokyo' },
  HK: { currency: 'HKD', timezone: 'Asia/Hong_Kong' },
  QA: { currency: 'QAR', timezone: 'Asia/Qatar' },
  CH: { currency: 'CHF', timezone: 'Europe/Zurich' },
  SG: { currency: 'SGD', timezone: 'Asia/Singapore' },
  NL: { currency: 'EUR', timezone: 'Europe/Amsterdam' },
  IE: { currency: 'EUR', timezone: 'Europe/London' },
  SE: { currency: 'SEK', timezone: 'Europe/Stockholm' },
  LV: { currency: 'EUR', timezone: 'Europe/Riga' },
  LT: { currency: 'EUR', timezone: 'Europe/Vilnius' },
  PL: { currency: 'PLN', timezone: 'Europe/Warsaw' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
  MX: { currency: 'MXN', timezone: 'America/Mexico_City' },
  ZA: { currency: 'ZAR', timezone: 'Africa/Johannesburg' },
  NG: { currency: 'NGN', timezone: 'Africa/Lagos' },
  KE: { currency: 'KES', timezone: 'Africa/Nairobi' },
};

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
  { value: 'Europe/Tallinn', label: 'EET — Tallinn' },
  { value: 'Europe/Helsinki', label: 'EET — Helsinki' },
  { value: 'Europe/Stockholm', label: 'CET — Stockholm' },
  { value: 'Europe/Riga', label: 'EET — Riga' },
  { value: 'Europe/Vilnius', label: 'EET — Vilnius' },
  { value: 'Europe/Warsaw', label: 'CET — Warsaw' },
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
  { value: 'Asia/Hong_Kong', label: 'HKT — Hong Kong' },
  { value: 'Asia/Qatar', label: 'AST — Doha' },
];

const STEPS: { id: OnboardingStep; title: string; icon: string; description: string }[] = [
  { id: 'welcome', title: 'Welcome', icon: '👋', description: 'Let\'s set up your AI financial operations' },
  { id: 'entity', title: 'Create Entity', icon: '🏢', description: 'Set up your business entity and region' },
  { id: 'bank', title: 'Connect Bank', icon: '🏦', description: 'Link your bank accounts via Plaid' },
  { id: 'ledger', title: 'Connect Ledger', icon: '📗', description: 'Connect QuickBooks or Xero' },
  { id: 'channel', title: 'Set Up Channel', icon: '💬', description: 'Choose your receipt chase channel' },
  { id: 'complete', title: 'All Set!', icon: '🚀', description: 'Your AI financial engine is ready' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
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

  // Invite welcome step state
  const [inviteClaimed, setInviteClaimed] = useState(false);
  const [claimedOrgName, setClaimedOrgName] = useState('');
  const [claimedEntityId, setClaimedEntityId] = useState<string | null>(null);
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteChannel, setInviteChannel] = useState('slack');
  const [inviteChannelId, setInviteChannelId] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);

  // Bank connection state
  const [bankConnected, setBankConnected] = useState(false);
  const [bankLinkToken, setBankLinkToken] = useState<string | null>(null);

  // Invite check state
  const [isCheckingInvite, setIsCheckingInvite] = useState(true);

  // Region state (merged into entity step)
  const [country, setCountry] = useState('US');
  const [timezone, setTimezone] = useState('America/New_York');
  const [geoDetected, setGeoDetected] = useState(false);
  const supportedCurrencies = getSupportedCurrencies();

  // ── Auto-detect location from IP on mount ──────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const detectLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        if (!res.ok) return;
        const geo = await res.json();
        const countryCode = (geo.country_code || '').toUpperCase();
        const detectedTz = geo.timezone || '';
        // Only apply if country is in our supported list
        if (SUPPORTED_COUNTRIES.some(c => c.code === countryCode)) {
          setCountry(countryCode);
          setGeoDetected(true);
          // Set currency from mapping
          const defaults = COUNTRY_DEFAULTS[countryCode];
          if (defaults) {
            setCurrency(defaults.currency);
          }
          // Set timezone — prefer detected, fall back to mapping
          if (SUPPORTED_TIMEZONES.some(tz => tz.value === detectedTz)) {
            setTimezone(detectedTz);
          } else if (defaults) {
            setTimezone(defaults.timezone);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        // Silent — geo-detection is best-effort
      }
    };
    detectLocation();
    return () => controller.abort();
  }, []);

  // ── Country change cascades to currency + timezone ─────────────────────
  const handleCountryChange = (newCountry: string) => {
    setCountry(newCountry);
    setGeoDetected(false); // User overrode geo-detection
    const defaults = COUNTRY_DEFAULTS[newCountry];
    if (defaults) {
      setCurrency(defaults.currency);
      setTimezone(defaults.timezone);
    }
  };

  // ── Check for pending team invite on mount ─────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    const checkPendingInvite = async () => {
      setIsCheckingInvite(true);
      try {
        const db = createClient() as unknown as SupabaseQueryClient;
        const { data: { user } } = await db.auth.getUser();
        if (controller.signal.aborted || !user?.email) return;

        // Check for pending invite
        const { data: pendingInvites } = await db
          .from('team_members')
          .select('id, org_id, role')
          .eq('invited_email', user.email)
          .is('user_id', null)
          .limit(1);

        if (controller.signal.aborted) return;
        const pendingInvite = pendingInvites?.[0] ?? null;
        if (pendingInvite) {
          // Claim invite server-side (validates ownership + prevents double-claim)
          try {
            const claimRes = await fetch('/api/team/claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ inviteId: pendingInvite.id }),
              signal: controller.signal,
            });

            if (claimRes.ok) {
              // Fetch org name for the welcome screen
              let orgName = 'your team';
              try {
                const { data: orgData } = await db
                  .from('organizations')
                  .select('name')
                  .eq('id', pendingInvite.org_id)
                  .single();
                if (orgData?.name) orgName = orgData.name as string;
              } catch {
                // Non-fatal — use fallback name
              }

              if (controller.signal.aborted) return;

              // Fetch an entity for this org to use for channel preference
              let entityIdForPref: string | null = null;
              try {
                const { data: entityData } = await db
                  .from('entities')
                  .select('id')
                  .eq('org_id', pendingInvite.org_id)
                  .limit(1);
                if (entityData?.[0]?.id) entityIdForPref = entityData[0].id as string;
              } catch {
                // Non-fatal
              }

              if (controller.signal.aborted) return;

              // Show welcome step instead of redirect
              setInviteClaimed(true);
              setClaimedOrgName(orgName);
              setClaimedEntityId(entityIdForPref);
              // Pre-fill display name from email
              if (user?.email) {
                const parts = user.email.split('@')[0].split(/[._-]/);
                const name = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                setInviteDisplayName(name);
              }
              setIsCheckingInvite(false);
              return;
            }

            // If claim fails (e.g. already claimed), fall through to normal onboarding
            const claimData = await claimRes.json().catch(() => ({}));
            console.warn('[Onboarding] Invite claim failed:', claimData.error);
          } catch (claimErr) {
            if (claimErr instanceof Error && claimErr.name === 'AbortError') return;
            console.warn('[Onboarding] Invite claim network error:', claimErr);
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.warn('[Onboarding] Invite check failed:', err);
      } finally {
        if (!controller.signal.aborted) {
          setIsCheckingInvite(false);
        }
      }
    };
    checkPendingInvite();
    return () => controller.abort();
  }, [router, toast]);

  // ── Load Plaid Link SDK when bank step is active ───────────────────────
  useEffect(() => {
    // Only load when we reach the bank connection step
    if (currentStep !== 'bank') return;
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) {
      return; // Already loaded
    }

    // Check if script tag already exists (e.g. from a previous mount)
    const existing = document.querySelector('script[src*="plaid.com/link"]');
    if (existing) {
      // Script tag exists but may still be loading — no action needed,
      // waitForPlaid() will poll at click time
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onerror = () => {
      console.error('[Onboarding] Failed to load Plaid Link SDK');
    };
    document.head.appendChild(script);

    return () => {
      // Don't remove - let it persist for reconnection attempts
    };
  }, [currentStep]);

  // ── Persist state to localStorage ──────────────────────────────────────
  const restoredRef = useRef(false);

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
        if (state.country) setCountry(state.country);
        if (state.timezone) setTimezone(state.timezone);
      }
    } catch (_e) {
      console.warn('[Onboarding] Failed to restore state:', _e);
    }
    restoredRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!restoredRef.current) return;
    const state: OnboardingState = {
      currentStep, entityName, currency, fiscalYearEnd,
      selectedLedger, selectedChannel, entityId, bankConnected,
      country, timezone,
    };
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
    } catch (_e) {
      // Ignore storage errors
    }
  }, [currentStep, entityName, currency, fiscalYearEnd, selectedLedger, selectedChannel, entityId, bankConnected, country, timezone]);

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

  // ── Step 1: Create entity + save region in one step ──
  const handleCreateEntity = async () => {
    if (!entityName.trim()) return;
    // Prevent duplicate entity creation if we already have one
    if (entityId) {
      goNext();
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Call the bootstrap_onboarding SECURITY DEFINER function.
      // This bypasses the RLS bootstrapping problem where a new user
      // can't INSERT into organizations/team_members because they have
      // no existing org membership.
      const { data: result, error: rpcError } = await (supabase as unknown as SupabaseQueryClient)
        .rpc('bootstrap_onboarding', {
          p_entity_name: entityName.trim(),
          p_fiscal_year_end: fiscalYearEnd,
          p_currency: currency,
        });

      if (rpcError || !result) {
        console.error('[Onboarding] Bootstrap RPC error:', rpcError);
        const errorMsg = rpcError?.message || 'Failed to create entity. Please try again.';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      const newEntityId = result.entityId;
      setEntityId(newEntityId);
      toast.success('Entity created successfully!');

      // Immediately update entity with country + timezone
      const { error: updateError } = await (supabase as unknown as SupabaseQueryClient)
        .from('entities')
        .update({
          country: country,
          timezone: timezone,
        })
        .eq('id', newEntityId);

      if (updateError) {
        console.warn('[Onboarding] Region update warning:', updateError);
        // Non-fatal — entity was created, region can be updated in settings
      }

      goNext();
    } catch (err) {
      console.error('[Onboarding] Entity creation error:', err);
      const errorMsg = 'An unexpected error occurred. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // ── Helper: wait for Plaid SDK to be available ──────────────────────────
  const waitForPlaid = (): Promise<unknown | null> => {
    return new Promise((resolve) => {
      // Already available
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) {
        resolve((window as unknown as Record<string, unknown>).Plaid);
        return;
      }
      // Poll every 100ms for up to 10 seconds
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 100;
        if ((window as unknown as Record<string, unknown>).Plaid) {
          clearInterval(interval);
          resolve((window as unknown as Record<string, unknown>).Plaid);
        } else if (elapsed >= 10000) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
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
        const errorMsg = data.error || 'Failed to initiate bank connection. You can skip and connect later.';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      const { link_token } = await res.json();
      setBankLinkToken(link_token);

      // Wait for Plaid SDK to be available (may still be loading)
      const plaidObj = await waitForPlaid();
      if (!plaidObj) {
        const errorMsg = 'Plaid Link SDK failed to load. Please refresh the page and try again.';
        setError(errorMsg);
        toast.error(errorMsg);
        setLoading(false);
        return;
      }

      const PlaidLink = plaidObj as Record<string, (...args: unknown[]) => unknown>;
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
            toast.success('Bank account connected!');
            goNext();
          } catch (exchangeErr) {
            console.error('[Onboarding] Plaid exchange error:', exchangeErr);
            const errorMsg = 'Connected to bank but failed to save. Please try again from Settings.';
            setError(errorMsg);
            toast.error(errorMsg);
          }
        },
        onExit: () => {
          setLoading(false);
        },
      });
      (handler as Record<string, unknown> & { open: () => void }).open();
    } catch (err) {
      console.error('[Onboarding] Plaid link error:', err);
      const errorMsg = 'Failed to connect to Plaid. You can skip and connect later from the dashboard.';
      setError(errorMsg);
      toast.error(errorMsg);
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
          country, timezone,
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
          country, timezone,
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
      const errorMsg = 'Failed to start ledger connection. You can skip and connect later.';
      setError(errorMsg);
      toast.error(errorMsg);
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
        toast.warning('Channel preference saved with warnings');
        // Non-fatal — still proceed
      } else {
        toast.success('Channel configured!');
      }

      goNext();
    } catch (err) {
      console.error('[Onboarding] Channel setup error:', err);
      const errorMsg = 'Failed to save channel preference. You can configure this later.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ErrorBoundary componentName="Onboarding">
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerBrand}>
          <Logo size={36} />
          <span className={styles.headerTitle}>Autokkeep Setup</span>
        </div>
        {entityId && (
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
            Skip for now →
          </Button>
        )}
      </header>

      {/* Progress Bar */}
      <div className={styles.progressArea}>
        <Progress variant="bar" value={progress} />
        <div className={styles.stepIndicators}>
          {STEPS.map((step, i) => (
            <div
              key={step.id}
              className={styles.stepIndicator}
              aria-current={i === currentIndex ? 'step' : undefined}
              data-state={i === currentIndex ? 'current' : i < currentIndex ? 'past' : 'future'}
            >
              <span className={styles.stepIcon}>{step.icon}</span>
              <span className={styles.stepLabel}>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={styles.content} aria-live="polite">
        <div className={styles.contentInner}>

          {/* Invite check loading state */}
          {isCheckingInvite && (
            <div className={styles.welcomeWrapper}>
              <span className={styles.welcomeEmoji}>⏳</span>
              <h1 className={styles.welcomeHeading}>Checking for team invites…</h1>
              <p className={styles.welcomeDescription}>
                Please wait while we check if you have a pending team invitation.
              </p>
            </div>
          )}

          {/* Invite welcome step — shown after claiming an invite */}
          {!isCheckingInvite && inviteClaimed && (
            <div className={styles.welcomeWrapper}>
              <span className={styles.welcomeEmoji}>🎉</span>
              <h1 className={styles.welcomeHeading}>Welcome to {claimedOrgName}!</h1>
              <p className={styles.welcomeDescription}>
                You&apos;ve joined the team. Let&apos;s set up your profile and contact preferences.
              </p>
              <Card variant="elevated" padding="lg">
                <div className={styles.fieldGroup}>
                  <Input
                    id="invite-display-name"
                    label="Display Name"
                    type="text"
                    placeholder="Your name"
                    value={inviteDisplayName}
                    onChange={(e) => setInviteDisplayName(e.target.value)}
                    disabled={inviteSaving}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="invite-channel" className={styles.selectLabel}>
                    Preferred Contact Channel
                  </label>
                  <select
                    id="invite-channel"
                    className={styles.select}
                    value={inviteChannel}
                    onChange={(e) => setInviteChannel(e.target.value)}
                    disabled={inviteSaving}
                    aria-label="Select your preferred contact channel"
                  >
                    <option value="slack">💬 Slack</option>
                    <option value="sms">📲 SMS</option>
                    <option value="whatsapp">📱 WhatsApp</option>
                    <option value="email">📧 Email</option>
                    <option value="teams">🟣 Teams</option>
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <Input
                    id="invite-channel-id"
                    label={
                      inviteChannel === 'sms' || inviteChannel === 'whatsapp'
                        ? 'Phone Number'
                        : inviteChannel === 'email'
                        ? 'Email Address'
                        : 'Channel ID or Username'
                    }
                    type="text"
                    placeholder={
                      inviteChannel === 'sms' || inviteChannel === 'whatsapp'
                        ? '+1 (555) 123-4567'
                        : inviteChannel === 'email'
                        ? 'you@company.com'
                        : 'e.g. @username'
                    }
                    value={inviteChannelId}
                    onChange={(e) => setInviteChannelId(e.target.value)}
                    disabled={inviteSaving}
                  />
                </div>
              </Card>
              <div className={styles.navButtons}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                    router.push('/dashboard');
                  }}
                  disabled={inviteSaving}
                >
                  Skip for now →
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={async () => {
                    setInviteSaving(true);
                    try {
                      // Save channel preference if entity is available
                      if (claimedEntityId && inviteChannel) {
                        await fetch('/api/account/channel-preferences', {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            entityId: claimedEntityId,
                            preferredChannel: inviteChannel,
                            channelIdentifier: inviteChannelId || '',
                          }),
                        });
                      }
                      toast.success('Welcome aboard!');
                      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                      router.push('/dashboard');
                    } catch {
                      // Redirect anyway on failure — preference can be set later
                      toast.warning('Preferences could not be saved — you can update them later.');
                      localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                      router.push('/dashboard');
                    }
                  }}
                  isLoading={inviteSaving}
                  disabled={inviteSaving}
                >
                  Get Started →
                </Button>
              </div>
            </div>
          )}

          {!isCheckingInvite && !inviteClaimed && (
          <>

          {/* Error Banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              <span>⚠️</span>
              <span>{error}</span>
              <button
                className={styles.errorDismiss}
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}

          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div className={styles.welcomeWrapper}>
              <span className={styles.welcomeEmoji}>👋</span>
              <h1 className={styles.welcomeHeading}>Welcome to Autokkeep</h1>
              <p className={styles.welcomeDescription}>
                Let&apos;s get your AI financial operations running in under 5 minutes.
                We&apos;ll connect your bank, your ledger, and your preferred communication channel.
              </p>
              <Button variant="primary" size="lg" onClick={goNext} aria-label="Start onboarding">
                Let&apos;s Get Started →
              </Button>
            </div>
          )}

          {/* Entity Step (includes region/currency/timezone) */}
          {currentStep === 'entity' && (
            <div role="form" aria-label="Create entity">
              <h2 className={styles.stepHeading}>🏢 Create Your Entity</h2>
              <p className={styles.stepDescription}>
                An entity represents a company or business you&apos;re managing finances for.
              </p>
              <Card variant="elevated" padding="lg">
                <div className={styles.fieldGroup}>
                  <Input
                    id="entity-name"
                    label="Entity Name"
                    type="text"
                    placeholder="e.g. Acme Corp, My Startup LLC"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="entity-country" className={styles.selectLabel}>
                    Country
                    {geoDetected && <span className={styles.geoDetected}> 📍 Auto-detected</span>}
                  </label>
                  <select
                    id="entity-country"
                    className={styles.select}
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    disabled={loading}
                    aria-label="Select your country"
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="entity-currency" className={styles.selectLabel}>Base Currency</label>
                  <select
                    id="entity-currency"
                    className={styles.select}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    disabled={loading}
                    aria-label="Select base currency"
                  >
                    {supportedCurrencies.map((curr) => (
                      <option key={curr.code} value={curr.code}>{curr.symbol} {curr.code} — {curr.name}</option>
                    ))}
                  </select>
                  <p className={styles.helperText}>
                    All monetary values will be displayed in this currency.
                  </p>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="entity-timezone" className={styles.selectLabel}>Timezone</label>
                  <select
                    id="entity-timezone"
                    className={styles.select}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={loading}
                    aria-label="Select your timezone"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className={styles.helperText}>
                    Used for transaction timestamps and report scheduling.
                  </p>
                </div>
                <div className={styles.fieldGroup}>
                  <label htmlFor="entity-fiscal-year" className={styles.selectLabel}>Fiscal Year End</label>
                  <select
                    id="entity-fiscal-year"
                    className={styles.select}
                    value={fiscalYearEnd}
                    onChange={(e) => setFiscalYearEnd(e.target.value)}
                    disabled={loading}
                    aria-label="Select fiscal year end month"
                  >
                    <option value="12">December</option>
                    <option value="1">January</option>
                    <option value="2">February</option>
                    <option value="3">March</option>
                    <option value="4">April</option>
                    <option value="5">May</option>
                    <option value="6">June</option>
                    <option value="7">July</option>
                    <option value="8">August</option>
                    <option value="9">September</option>
                    <option value="10">October</option>
                    <option value="11">November</option>
                  </select>
                </div>
              </Card>
              <div className={styles.navButtons}>
                <Button variant="ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">
                  ← Back
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateEntity}
                  disabled={!entityName.trim() || loading}
                  isLoading={loading}
                  aria-label="Create entity and continue"
                >
                  {loading ? 'Creating…' : 'Continue →'}
                </Button>
              </div>
            </div>
          )}

          {/* Bank Step */}
          {currentStep === 'bank' && (() => {
            // Countries where Plaid is supported
            const PLAID_COUNTRIES = new Set(['US', 'CA', 'GB', 'IE', 'FR', 'ES', 'NL', 'DE']);
            const isPlaidSupported = PLAID_COUNTRIES.has(country);

            return (
            <div>
              <h2 className={styles.stepHeading}>🏦 Connect Your Bank</h2>
              <p className={styles.stepDescription}>
                {isPlaidSupported
                  ? 'We use Plaid to securely connect to your bank. Your credentials are never stored on our servers.'
                  : 'Import your bank transactions via CSV file. Download a statement from your bank and upload it here.'}
              </p>
              <Card variant="elevated" padding="lg" className={styles.bankCenter}>
                {bankConnected ? (
                  <>
                    <span className={styles.bankEmoji}>✅</span>
                    <p className={styles.bankSuccessText}>
                      {isPlaidSupported ? 'Bank account connected successfully!' : 'Transactions imported successfully!'}
                    </p>
                    <p className={styles.bankCaption}>
                      Autokkeep will begin processing your transactions shortly.
                    </p>
                  </>
                ) : isPlaidSupported ? (
                  bankLinkToken ? (
                  <>
                    <span className={styles.bankEmoji}>🔗</span>
                    <p className={styles.bankBody}>
                      Plaid Link is opening…
                    </p>
                    <p className={styles.bankCaption}>
                      If the window didn&apos;t open, please check your pop-up blocker.
                    </p>
                  </>
                  ) : (
                  <>
                    <span className={styles.bankEmoji}>🔒</span>
                    <p className={styles.bankBody}>
                      Click below to open Plaid Link and connect your bank accounts.
                      Autokkeep will automatically import and categorize your transactions.
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleConnectBank}
                      disabled={loading}
                      isLoading={loading}
                    >
                      {loading ? 'Connecting…' : '🏦 Connect Bank Account'}
                    </Button>
                    <p className={styles.bankSupportedText}>
                      Supported: 12,000+ financial institutions across the US, Canada, UK, and Europe
                    </p>
                  </>
                  )
                ) : (
                  <>
                    <span className={styles.bankEmoji}>📄</span>
                    <p className={styles.bankBody}>
                      Upload a CSV bank statement to import your transactions.
                      Most banks allow you to download statements in CSV format from online banking.
                    </p>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      style={{ display: 'none' }}
                      id="csv-upload-input"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file || !entityId) return;
                        setLoading(true);
                        setError(null);
                        try {
                          const formData = new FormData();
                          formData.append('file', file);
                          formData.append('entityId', entityId);
                          const res = await fetch('/api/transactions/import', {
                            method: 'POST',
                            body: formData,
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            throw new Error(data.error || 'Import failed');
                          }
                          setBankConnected(true);
                          toast.success(`Imported ${data.imported} transaction${data.imported !== 1 ? 's' : ''}`);
                          if (data.skipped > 0) {
                            toast.info(`${data.skipped} duplicate transaction${data.skipped !== 1 ? 's' : ''} skipped`);
                          }
                        } catch (err) {
                          console.error('[Onboarding] CSV import error:', err);
                          const errorMsg = err instanceof Error ? err.message : 'Failed to import CSV';
                          setError(errorMsg);
                          toast.error(errorMsg);
                        } finally {
                          setLoading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => document.getElementById('csv-upload-input')?.click()}
                      disabled={loading}
                      isLoading={loading}
                    >
                      {loading ? 'Importing…' : '📤 Upload CSV Statement'}
                    </Button>
                    <p className={styles.bankSupportedText}>
                      Accepted format: CSV with columns for date, description, and amount
                    </p>
                  </>
                )}
              </Card>
              <div className={styles.navButtons}>
                <Button variant="ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">
                  ← Back
                </Button>
                <Button variant="ghost" onClick={goNext} aria-label={bankConnected ? 'Continue to next step' : 'Skip bank connection'}>
                  {bankConnected ? 'Continue →' : 'Skip for now →'}
                </Button>
              </div>
            </div>
            );
          })()}

          {/* Ledger Step */}
          {currentStep === 'ledger' && (
            <div>
              <h2 className={styles.stepHeading}>📗 Connect Your Ledger</h2>
              <p className={styles.stepDescription}>
                Choose your accounting software. We&apos;ll sync your Chart of Accounts and push journal entries automatically.
              </p>
              <div className={styles.ledgerList}>
                {[
                  { id: 'quickbooks', name: 'QuickBooks Online', icon: '📗', desc: 'Cloud accounting & invoicing' },
                  { id: 'xero', name: 'Xero', icon: '📘', desc: 'Popular worldwide, especially UK/AU' },
                  { id: 'none', name: 'No ledger yet', icon: '📋', desc: 'I\'ll connect one later' },
                ].map((ledger) => (
                  <button
                    key={ledger.id}
                    className={styles.ledgerOption}
                    onClick={() => setSelectedLedger(ledger.id)}
                    disabled={loading}
                    data-selected={selectedLedger === ledger.id ? 'true' : 'false'}
                  >
                    <span className={styles.ledgerIcon}>{ledger.icon}</span>
                    <div className={styles.ledgerInfo}>
                      <div className={styles.ledgerName}>{ledger.name}</div>
                      <div className={styles.ledgerDesc}>{ledger.desc}</div>
                    </div>
                    {selectedLedger === ledger.id && (
                      <span className={styles.ledgerCheck}>✓</span>
                    )}
                  </button>
                ))}
              </div>
              <div className={styles.navButtons}>
                <Button variant="ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">
                  ← Back
                </Button>
                <div className={styles.navButtonsRight}>
                  <Button variant="ghost" onClick={goNext} aria-label="Skip ledger connection">
                    Skip →
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConnectLedger}
                    disabled={!selectedLedger || loading}
                    isLoading={loading}
                    aria-label={selectedLedger === 'none' ? 'Continue to next step' : 'Connect ledger and continue'}
                  >
                    {loading ? 'Connecting…' : selectedLedger === 'none' ? 'Continue →' : 'Connect & Continue →'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Channel Step */}
          {currentStep === 'channel' && (
            <div>
              <h2 className={styles.stepHeading}>💬 Set Up Receipt Chase</h2>
              <p className={styles.stepDescription}>
                Choose how Autokkeep should reach your team when it needs a receipt or categorization confirmation.
              </p>
              <div className={styles.channelGrid}>
                {[
                  { id: 'slack', name: 'Slack', icon: '💬', desc: 'Interactive messages' },
                  { id: 'teams', name: 'Teams', icon: '🟣', desc: 'Adaptive Cards' },
                  { id: 'sms', name: 'SMS', icon: '📲', desc: 'Text messages' },
                  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', desc: 'Business messaging' },
                ].map((channel) => (
                  <button
                    key={channel.id}
                    className={styles.channelOption}
                    onClick={() => setSelectedChannel(channel.id)}
                    disabled={loading}
                    aria-label={`Select ${channel.name} as receipt chase channel`}
                    data-selected={selectedChannel === channel.id ? 'true' : 'false'}
                  >
                    <span className={styles.channelIcon}>{channel.icon}</span>
                    <div className={styles.channelName}>{channel.name}</div>
                    <div className={styles.channelDesc}>{channel.desc}</div>
                    {selectedChannel === channel.id && (
                      <div className={styles.channelSelected}>✓ Selected</div>
                    )}
                  </button>
                ))}
              </div>
              <div className={styles.navButtons}>
                <Button variant="ghost" onClick={goBack} disabled={loading} aria-label="Go back to previous step">
                  ← Back
                </Button>
                <div className={styles.navButtonsRight}>
                  <Button variant="ghost" onClick={goNext} aria-label="Skip channel setup">
                    Skip →
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSetupChannel}
                    disabled={!selectedChannel || loading}
                    isLoading={loading}
                    aria-label="Finish channel setup"
                  >
                    {loading ? 'Setting up…' : 'Finish Setup →'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div className={styles.completeWrapper}>
              <div className={styles.completeEmojiCircle}>🚀</div>
              <h1 className={styles.completeHeading}>You&apos;re All Set!</h1>
              <p className={styles.completeDescription}>
                {entityName ? `${entityName} is ready to go.` : 'Your entity is ready to go.'}
                {' '}Autokkeep will now:
              </p>
              <Card variant="elevated" padding="lg" className={styles.completeListCard}>
                <ul className={styles.completeList}>
                  <li className={styles.completeListItem}>✅ Automatically import new bank transactions</li>
                  <li className={styles.completeListItem}>✅ Categorize each transaction using the dual-engine AI</li>
                  <li className={styles.completeListItem}>✅ Auto-approve high-confidence matches (≥95%)</li>
                  <li className={styles.completeListItem}>✅ Flag exceptions for your review</li>
                  <li className={styles.completeListItem}>✅ Chase missing receipts via {selectedChannel || 'your channel'}</li>
                  <li className={styles.completeListItem}>✅ Sync approved entries to {selectedLedger === 'quickbooks' ? 'QuickBooks' : selectedLedger === 'xero' ? 'Xero' : 'your ledger'}</li>
                </ul>
              </Card>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
                  router.push('/dashboard');
                }}
              >
                Go to Dashboard →
              </Button>
            </div>
          )}

          </>
          )}

        </div>
      </div>
    </div>
    </ErrorBoundary>
  );
}
