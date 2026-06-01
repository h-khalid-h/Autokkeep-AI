'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Logo from '@/components/ui/Logo';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ---- Types ----

type SettingsTab = 'integrations' | 'billing' | 'team' | 'localization';

interface OrgData {
  id: string;
  name: string;
}

interface EntityData {
  id: string;
  name: string;
}

interface TeamMemberData {
  id: string;
  user_id: string | null;
  role: string;
  invited_email: string | null;
  accepted_at: string | null;
  user_email: string | null;
}

interface SubscriptionData {
  plan: string;
  status: string;
  current_period_end: string | null;
  entity_count: number;
  transaction_count: number;
}

interface ConnectionStatus {
  plaid: boolean;
  quickbooks: boolean;
  xero: boolean;
  slack: boolean;
}


// ---- Skeleton component ----

function Skeleton({ width, height = '20px' }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width || '100%',
        height,
        borderRadius: '6px',
        background: 'var(--bg-elevated)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Skeleton width="40%" height="24px" />
      <Skeleton width="80%" />
      <Skeleton width="60%" />
    </div>
  );
}

// ---- Main Page ----

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared state
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [orgData, setOrgData] = useState<OrgData | null>(null);
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberData[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [connections, setConnections] = useState<ConnectionStatus>({
    plaid: false,
    quickbooks: false,
    xero: false,
    slack: false,
  });
  const [userRole, setUserRole] = useState('');
  const [transactionCount, setTransactionCount] = useState(0);
  const [hitlCount, setHitlCount] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      // 1. Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return;
      }
      setUserEmail(user.email || '');
      setUserId(user.id);

      // 2. Get team membership → org_id, role
      const db = supabase as unknown as SupabaseQueryClient;
      const { data: membership, error: membershipError } = await db
        .from('team_members')
        .select('id, org_id, role')
        .eq('user_id', user.id)
        .single();

      if (membershipError || !membership) {
        setError('No organization membership found.');
        setLoading(false);
        return;
      }

      const orgId = membership.org_id;
      setUserRole(membership.role);

      // 3-5. Fetch org, entities, and team members in parallel
      const [orgResult, entitiesResult, membersResult] = await Promise.all([
        db
          .from('organizations')
          .select('id, name')
          .eq('id', orgId)
          .single(),
        db
          .from('entities')
          .select('id, name')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true }),
        db
          .from('team_members')
          .select('id, user_id, role, invited_email, accepted_at')
          .eq('org_id', orgId)
          .order('created_at', { ascending: true }),
      ]);

      if (orgResult.data) {
        setOrgData(orgResult.data);
      }

      const fetchedEntities: EntityData[] = entitiesResult.data || [];
      setEntities(fetchedEntities);

      if (membersResult.data) {
        const enriched: TeamMemberData[] = membersResult.data.map((m: Record<string, unknown>) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          invited_email: m.invited_email,
          accepted_at: m.accepted_at,
          user_email: m.user_id === user.id ? user.email : m.invited_email,
        }));
        setTeamMembers(enriched);
      }

      // 6-10. Fetch subscription, connections, and counts in parallel
      if (fetchedEntities.length > 0) {
        const entityIds = fetchedEntities.map((e: EntityData) => e.id);

        const [subResult, bankConnsResult, ledgerConnsResult, channelConnsResult, txCountResult, reviewCountResult] = await Promise.all([
          db
            .from('subscriptions')
            .select('plan, status, current_period_end, entity_count, transaction_count')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
          db
            .from('bank_connections')
            .select('id, entity_id, status')
            .in('entity_id', entityIds)
            .eq('status', 'active'),
          db
            .from('ledger_connections')
            .select('id, entity_id, provider, is_active')
            .in('entity_id', entityIds)
            .eq('is_active', true),
          db
            .from('channel_connections')
            .select('id, entity_id, channel_type, is_active')
            .in('entity_id', entityIds)
            .eq('is_active', true),
          db
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .in('entity_id', entityIds),
          db
            .from('transactions')
            .select('id', { count: 'exact', head: true })
            .in('entity_id', entityIds)
            .eq('status', 'human_review'),
        ]);

        if (subResult.data) {
          setSubscription(subResult.data);
        }

        setConnections({
          plaid: (bankConnsResult.data && bankConnsResult.data.length > 0) || false,
          quickbooks: (ledgerConnsResult.data && ledgerConnsResult.data.some((c: Record<string, unknown>) => c.provider === 'quickbooks')) || false,
          xero: (ledgerConnsResult.data && ledgerConnsResult.data.some((c: Record<string, unknown>) => c.provider === 'xero')) || false,
          slack: (channelConnsResult.data && channelConnsResult.data.some((c: Record<string, unknown>) => c.channel_type === 'slack')) || false,
        });

        setTransactionCount(txCountResult.count || 0);
        setHitlCount(reviewCountResult.count || 0);
      } else {
        // No entities — still fetch subscription
        const { data: sub } = await db
          .from('subscriptions')
          .select('plan, status, current_period_end, entity_count, transaction_count')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (sub) {
          setSubscription(sub);
        }
      }
    } catch (err) {
      console.error('[Settings] Fetch error:', err);
      setError('Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData();
  }, [fetchData]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'team', label: 'Team', icon: '👥' },
    { id: 'localization', label: 'Localization', icon: '🌍' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <Logo size={32} />
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <nav style={{ display: 'flex', gap: '8px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Back to Dashboard
        </Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 32px)', maxWidth: '900px' }}>
        <h1 className="text-h2" style={{ marginBottom: '32px' }}>
          Settings
          {orgData && (
            <span className="text-caption" style={{ marginLeft: '12px', fontWeight: 400 }}>
              — {orgData.name}
            </span>
          )}
        </h1>

        {error && (
          <div className="card" style={{ padding: '16px', marginBottom: '24px', borderLeft: '4px solid var(--destructive)' }}>
            <div className="text-body" style={{ color: 'var(--destructive)' }}>⚠️ {error}</div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <IntegrationsTab
            loading={loading}
            entities={entities}
            connections={connections}
            onRefresh={fetchData}
          />
        )}
        {activeTab === 'billing' && (
          <BillingTab
            loading={loading}
            orgId={orgData?.id || ''}
            userEmail={userEmail}
            subscription={subscription}
            entityCount={entities.length}
            transactionCount={transactionCount}
            hitlCount={hitlCount}
          />
        )}
        {activeTab === 'team' && (
          <TeamTab
            loading={loading}
            orgId={orgData?.id || ''}
            userId={userId}
            userRole={userRole}
            teamMembers={teamMembers}
            onRefresh={fetchData}
          />
        )}
        {activeTab === 'localization' && (
          <LocalizationTab
            loading={loading}
            entities={entities}
          />
        )}
      </main>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ============================================
// INTEGRATIONS TAB
// ============================================

function IntegrationsTab({
  loading,
  entities,
  connections,
  onRefresh,
}: {
  loading: boolean;
  entities: EntityData[];
  connections: ConnectionStatus;
  onRefresh: () => void;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Default to first entity if available
  const primaryEntityId = entities.length > 0 ? entities[0].id : '';

  const handlePlaidConnect = async () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('plaid');
    setActionError(null);
    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: primaryEntityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link token');

      // Open Plaid Link if available
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) {
        const PlaidLink = (window as unknown as Record<string, unknown>).Plaid as Record<string, (...args: unknown[]) => unknown>;
        const handler = PlaidLink.create({
          token: data.link_token,
          onSuccess: async (publicToken: string, metadata: Record<string, unknown>) => {
            try {
              const exchangeRes = await fetch('/api/plaid/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  publicToken,
                  entityId: primaryEntityId,
                  institutionId: (metadata?.institution as Record<string, unknown>)?.institution_id || undefined,
                  institutionName: (metadata?.institution as Record<string, unknown>)?.name || 'Unknown',
                }),
              });
              if (!exchangeRes.ok) {
                const errData = await exchangeRes.json().catch(() => ({}));
                throw new Error(errData.error || 'Token exchange failed');
              }
              onRefresh();
            } catch (err) {
              setActionError(err instanceof Error ? err.message : 'Failed to connect bank account');
            }
          },
          onExit: () => setActionLoading(null),
        });
        (handler as Record<string, unknown> & { open: () => void }).open();
      } else {
        setActionError('Plaid Link SDK not loaded. Please refresh and try again.');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to connect bank');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLedgerConnect = (provider: 'quickbooks' | 'xero') => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading(provider);
    const path = provider === 'quickbooks'
      ? `/api/ledger/quickbooks/auth?entityId=${primaryEntityId}`
      : `/api/ledger/xero/auth?entityId=${primaryEntityId}`;
    window.location.assign(path);
  };

  const handleSlackConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('slack');
    window.location.assign(`/api/channels/slack/install?entityId=${primaryEntityId}`);
  };

  const handleTeamsConnect = async () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('teams');
    setActionError(null);
    try {
      const webhookUrl = prompt('Enter your Microsoft Teams Incoming Webhook URL:');
      if (!webhookUrl) {
        setActionLoading(null);
        return;
      }
      const res = await fetch('/api/channels/teams/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: primaryEntityId, webhookUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to configure Teams');
      }
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to configure Teams');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWhatsAppConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('whatsapp');
    window.location.assign(`/api/channels/whatsapp/setup?entityId=${primaryEntityId}`);
  };

  const handleSMSConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('sms');
    window.location.assign(`/api/channels/sms/setup?entityId=${primaryEntityId}`);
  };

  const getStatus = (key: string): 'configured' | 'available' => {
    if (key === 'Plaid') return connections.plaid ? 'configured' : 'available';
    if (key === 'QuickBooks Online') return connections.quickbooks ? 'configured' : 'available';
    if (key === 'Xero') return connections.xero ? 'configured' : 'available';
    if (key === 'Slack') return connections.slack ? 'configured' : 'available';
    return 'available';
  };

  const getHandler = (key: string): (() => void) | undefined => {
    if (key === 'Plaid') return handlePlaidConnect;
    if (key === 'QuickBooks Online') return () => handleLedgerConnect('quickbooks');
    if (key === 'Xero') return () => handleLedgerConnect('xero');
    if (key === 'Slack') return handleSlackConnect;
    if (key === 'Microsoft Teams') return handleTeamsConnect;
    if (key === 'WhatsApp') return handleWhatsAppConnect;
    if (key === 'SMS') return handleSMSConnect;
    return undefined;
  };

  const integrations = [
    {
      category: 'Banking',
      items: [
        {
          name: 'Plaid',
          description: 'Connect bank accounts and credit cards for automatic transaction import.',
          icon: '🏦',
          action: 'Connect Bank',
        },
      ],
    },
    {
      category: 'Accounting Ledger',
      items: [
        {
          name: 'QuickBooks Online',
          description: 'Sync categorized transactions and journal entries to QuickBooks.',
          icon: '📗',
          action: 'Connect QBO',
        },
        {
          name: 'Xero',
          description: 'Sync categorized transactions and manual journals to Xero.',
          icon: '📘',
          action: 'Connect Xero',
        },
      ],
    },
    {
      category: 'Messaging Channels',
      items: [
        {
          name: 'Slack',
          description: 'Send receipt requests and get categorization input via Slack interactive messages.',
          icon: '💬',
          action: 'Add to Slack',
        },
        {
          name: 'Microsoft Teams',
          description: 'Send receipt requests via Teams Adaptive Cards and incoming webhooks.',
          icon: '🟣',
          action: 'Configure Teams',
        },
        {
          name: 'WhatsApp',
          description: 'Chase receipts and get categorization input via WhatsApp Business.',
          icon: '📱',
          action: 'Setup WhatsApp',
        },
        {
          name: 'SMS',
          description: 'Send receipt requests and get responses via text message.',
          icon: '📲',
          action: 'Setup SMS',
        },
      ],
    },
    {
      category: 'AI Engine',
      items: [
        {
          name: 'OpenAI (GPT-4o)',
          description: 'Powers the probabilistic categorization engine with structured output and confidence scoring.',
          icon: '🤖',
          action: 'Configure',
        },
      ],
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {actionError && (
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--destructive)' }}>
          <div className="text-body" style={{ color: 'var(--destructive)' }}>⚠️ {actionError}</div>
        </div>
      )}

      {integrations.map((category) => (
        <div key={category.category}>
          <h3 className="text-h4" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            {category.category}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {category.items.map((item) => {
              const status = getStatus(item.name);
              const handler = getHandler(item.name);
              const isItemLoading = actionLoading === item.name.toLowerCase().replace(/\s.*/, '');

              return (
                <div key={item.name} className="card" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                }}>
                  <div style={{ fontSize: '2rem', flexShrink: 0 }}>{item.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="text-h4">{item.name}</div>
                    <div className="text-body" style={{ marginTop: '4px' }}>{item.description}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {status === 'configured' && (
                      <span className="badge badge-success">Connected</span>
                    )}
                    {handler ? (
                      <button
                        onClick={handler}
                        disabled={isItemLoading}
                        className={`btn ${status === 'configured' ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                      >
                        {isItemLoading ? '...' : status === 'configured' ? 'Manage' : item.action}
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled
                        style={{ opacity: 0.5 }}
                      >
                        Coming Soon
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// BILLING TAB
// ============================================

function BillingTab({
  loading: pageLoading,
  orgId,
  userEmail,
  subscription,
  entityCount,
  transactionCount,
  hitlCount,
}: {
  loading: boolean;
  orgId: string;
  userEmail: string;
  subscription: SubscriptionData | null;
  entityCount: number;
  transactionCount: number;
  hitlCount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const planLabels: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
    pro: 'Pro',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active',
    past_due: 'Past Due',
    canceled: 'Canceled',
    trialing: 'Trial',
  };

  const planName = subscription ? (planLabels[subscription.plan] || subscription.plan) : 'Free Pilot';
  const planStatus = subscription ? (statusLabels[subscription.status] || subscription.status) : 'trialing';
  const planDescription = subscription
    ? `${planStatus}${subscription.current_period_end ? ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString()}` : ''}`
    : '3 entities, 60-day trial';

  const entityLimit = subscription
    ? (subscription.entity_count > 0 ? subscription.entity_count : '∞')
    : 3;

  const handleCheckout = async (plan: string) => {
    if (!orgId) return;
    setLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: `${plan}_monthly`, email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillingError(data.error || 'Checkout failed. Please try again.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setBillingError('Checkout failed: no redirect URL received.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setBillingError('Checkout failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    if (!orgId) return;
    setLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillingError(data.error || 'Failed to open billing portal.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setBillingError('Failed to open billing portal: no redirect URL received.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      setBillingError('Failed to open billing portal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {billingError && (
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--destructive)' }}>
          <div className="text-body" style={{ color: 'var(--destructive)' }}>⚠️ {billingError}</div>
        </div>
      )}
      {/* Current Plan */}
      <div className="card-elevated" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="text-caption" style={{ marginBottom: '4px' }}>Current Plan</div>
            <div className="text-h3">{planName}</div>
            <div className="text-body" style={{ marginTop: '4px' }}>{planDescription}</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handlePortal} disabled={loading || !orgId}>
            Manage Subscription
          </button>
        </div>
      </div>

      {/* Usage */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Usage This Period</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{entityCount}/{entityLimit}</div>
            <div className="text-caption">Entities</div>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{transactionCount}</div>
            <div className="text-caption">Transactions Processed</div>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{hitlCount}</div>
            <div className="text-caption">HITL Reviews</div>
          </div>
        </div>
      </div>

      {/* Upgrade */}
      <div className="card-accent" style={{ padding: '24px', textAlign: 'center' }}>
        <div className="text-h4" style={{ marginBottom: '8px' }}>Ready to Scale?</div>
        <div className="text-body" style={{ marginBottom: '16px' }}>Upgrade to unlock unlimited entities and advanced features.</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleCheckout('starter')} disabled={loading}>
            Starter — $29/mo
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleCheckout('growth')} disabled={loading}>
            Growth — $99/mo
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleCheckout('pro')} disabled={loading}>
            Pro — $299/mo
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TEAM TAB
// ============================================

function TeamTab({
  loading: pageLoading,
  orgId,
  userId,
  userRole,
  teamMembers,
  onRefresh,
}: {
  loading: boolean;
  orgId: string;
  userId: string;
  userRole: string;
  teamMembers: TeamMemberData[];
  onRefresh: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('accountant');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !email) return;
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setActionError('Please enter a valid email address');
      return;
    }
    setInviteLoading(true);
    setActionError(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: insertError } = await db
        .from('team_members')
        .insert({
          org_id: orgId,
          role: role,
          invited_email: email,
        });

      if (insertError) {
        throw new Error(insertError.message);
      }

      // Send invite email via Resend (fire-and-forget)
      try {
        await fetch('/api/team/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), role }),
        });
      } catch {
        // Email delivery failure is non-blocking
        console.warn('[Settings] Invite email could not be sent');
      }

      setEmail('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) return;
    setRemoveLoading(memberId);
    setActionError(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: deleteError } = await db
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('org_id', orgId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveLoading(null);
    }
  };

  if (pageLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {actionError && (
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--destructive)' }}>
          <div className="text-body" style={{ color: 'var(--destructive)' }}>⚠️ {actionError}</div>
        </div>
      )}

      {/* Invite Form */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Invite Team Member</div>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="invite-email" className="text-caption" style={{ display: 'block', marginBottom: '4px' }}>Email</label>
            <input
              id="invite-email"
              type="email"
              className="input"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!canManageTeam}
            />
          </div>
          <div style={{ width: '180px' }}>
            <label htmlFor="invite-role" className="text-caption" style={{ display: 'block', marginBottom: '4px' }}>Role</label>
            <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)} disabled={!canManageTeam}>
              <option value="admin">Admin</option>
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={inviteLoading || !canManageTeam}>
            {inviteLoading ? '...' : 'Invite'}
          </button>
        </form>
        <p className="text-caption" style={{ marginTop: '8px' }}>
          💡 {userRole === 'owner' || userRole === 'admin' ? 'Seat limits vary by plan: Starter (3 seats), Growth (10 seats), Pro (unlimited).' : 'Contact your admin for seat availability.'}
        </p>
      </div>

      {/* Team Members */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Team Members</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {teamMembers.map((member) => {
            const isCurrentUser = member.user_id === userId;
            const isAccepted = !!member.accepted_at;
            const displayName = isCurrentUser
              ? 'You'
              : (member.user_email || member.invited_email || 'Unknown');
            const displayEmail = member.user_email || member.invited_email || '';

            return (
              <div key={member.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 0',
                borderBottom: '1px solid var(--border-primary)',
              }}>
                <div>
                  <div className="text-body" style={{ fontWeight: 600 }}>
                    {displayName}{isCurrentUser ? ` (${member.role})` : ''}
                  </div>
                  <div className="text-caption">{displayEmail}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${isAccepted ? 'badge-success' : 'badge-warning'}`}>
                    {isAccepted ? member.role : 'Pending'}
                  </span>
                  {member.role !== 'owner' && !isCurrentUser && canManageTeam && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRemove(member.id)}
                      disabled={removeLoading === member.id}
                    >
                      {removeLoading === member.id ? '...' : 'Remove'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {teamMembers.length === 0 && (
            <div className="text-body" style={{ color: 'var(--text-secondary)', padding: '12px 0' }}>
              No team members found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// LOCALIZATION TAB
// ============================================

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

function LocalizationTab({
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {saveResult && (
        <div
          className="card"
          style={{
            padding: '12px 16px',
            borderLeft: `4px solid ${saveResult.type === 'success' ? 'var(--success)' : 'var(--destructive)'}`,
          }}
        >
          <div
            className="text-body"
            style={{
              color: saveResult.type === 'success' ? 'var(--success)' : 'var(--destructive)',
            }}
          >
            {saveResult.type === 'success' ? '✅' : '⚠️'} {saveResult.message}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '8px' }}>Regional Settings</div>
        <p className="text-caption" style={{ marginBottom: '24px' }}>
          Configure currency, country, and timezone for accurate financial reporting and localization.
        </p>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Entity Selector (if multiple entities) */}
          {entities.length > 1 && (
            <div>
              <label htmlFor="locale-entity" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                Entity
              </label>
              <select
                id="locale-entity"
                className="input"
                value={selectedEntityId}
                onChange={(e) => setSelectedEntityId(e.target.value)}
                style={{ width: '100%' }}
              >
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Base Currency */}
          <div>
            <label htmlFor="base-currency" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Base Currency
            </label>
            <select
              id="base-currency"
              className="input"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              style={{ width: '100%' }}
            >
              {SUPPORTED_CURRENCIES.map((curr) => (
                <option key={curr.code} value={curr.code} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  {curr.symbol} {curr.code} — {curr.name}
                </option>
              ))}
            </select>
            <p className="text-caption" style={{ marginTop: '4px' }}>
              All monetary values will be displayed in this currency. Multi-currency transactions will be converted automatically.
            </p>
          </div>

          {/* Country */}
          <div>
            <label htmlFor="country" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Country
            </label>
            <select
              id="country"
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              style={{ width: '100%' }}
            >
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            <p className="text-caption" style={{ marginTop: '4px' }}>
              Determines tax rules, date formats, and regulatory compliance defaults.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Timezone
            </label>
            <select
              id="timezone"
              className="input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{ width: '100%' }}
            >
              {SUPPORTED_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-caption" style={{ marginTop: '4px' }}>
              Used for transaction timestamps, report generation times, and scheduled jobs.
            </p>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving || !selectedEntityId} style={{ alignSelf: 'flex-start', marginTop: '8px' }}>
            {saving ? 'Saving…' : 'Save Localization Settings'}
          </button>
        </form>
      </div>

      {/* Info card */}
      <div className="card-accent" style={{ padding: '20px 24px' }}>
        <div className="text-h4" style={{ marginBottom: '8px' }}>💡 About Localization</div>
        <div className="text-body" style={{ lineHeight: 1.7 }}>
          Localization settings affect how financial data is displayed across the platform.
          Changing the base currency will not retroactively convert existing transactions — it sets
          the default for new transactions and report formatting. Multi-currency support automatically
          converts foreign currency transactions at the exchange rate at the time of import.
        </div>
      </div>
    </div>
  );
}
