'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// ---- Types ----

type SettingsTab = 'integrations' | 'billing' | 'team';

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

// ---- Supabase client (lazy singleton — avoids SSG prerender crash) ----

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}


// ---- Skeleton component ----

function Skeleton({ width, height = '20px' }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width || '100%',
        height,
        borderRadius: '6px',
        background: 'var(--bg-tertiary, #2a2a2a)',
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
      const supabase = getSupabase();
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
      const { data: membership, error: membershipError } = await (supabase as any)
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

      // 3. Fetch org details
      const { data: org } = await (supabase as any)
        .from('organizations')
        .select('id, name')
        .eq('id', orgId)
        .single();

      if (org) {
        setOrgData(org);
      }

      // 4. Fetch entities for this org
      const { data: entitiesData } = await (supabase as any)
        .from('entities')
        .select('id, name')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      const fetchedEntities: EntityData[] = entitiesData || [];
      setEntities(fetchedEntities);

      // 5. Fetch team members
      const { data: members } = await (supabase as any)
        .from('team_members')
        .select('id, user_id, role, invited_email, accepted_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true });

      if (members) {
        // For each member with a user_id, we already know the current user's email.
        // For others, we use invited_email. We can't query auth.users from browser client,
        // so we mark the current user and show invited_email for others.
        const enriched: TeamMemberData[] = members.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          role: m.role,
          invited_email: m.invited_email,
          accepted_at: m.accepted_at,
          user_email: m.user_id === user.id ? user.email : m.invited_email,
        }));
        setTeamMembers(enriched);
      }

      // 6. Fetch subscription
      const { data: sub } = await (supabase as any)
        .from('subscriptions')
        .select('plan, status, current_period_end, entity_count, transaction_count')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (sub) {
        setSubscription(sub);
      }

      // 7. Fetch connection statuses for all entities
      if (fetchedEntities.length > 0) {
        const entityIds = fetchedEntities.map((e: EntityData) => e.id);

        const { data: bankConns } = await (supabase as any)
          .from('bank_connections')
          .select('id, entity_id, status')
          .in('entity_id', entityIds)
          .eq('status', 'active');

        const { data: ledgerConns } = await (supabase as any)
          .from('ledger_connections')
          .select('id, entity_id, provider, is_active')
          .in('entity_id', entityIds)
          .eq('is_active', true);

        const { data: channelConns } = await (supabase as any)
          .from('channel_connections')
          .select('id, entity_id, channel_type, is_active')
          .in('entity_id', entityIds)
          .eq('is_active', true);

        setConnections({
          plaid: (bankConns && bankConns.length > 0) || false,
          quickbooks: (ledgerConns && ledgerConns.some((c: any) => c.provider === 'quickbooks')) || false,
          xero: (ledgerConns && ledgerConns.some((c: any) => c.provider === 'xero')) || false,
          slack: (channelConns && channelConns.some((c: any) => c.channel_type === 'slack')) || false,
        });

        // 8. Get real usage counts
        const { count: txCount } = await (supabase as any)
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .in('entity_id', entityIds);

        setTransactionCount(txCount || 0);

        const { count: reviewCount } = await (supabase as any)
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .in('entity_id', entityIds)
          .eq('status', 'human_review');

        setHitlCount(reviewCount || 0);
      }
    } catch (err) {
      console.error('[Settings] Fetch error:', err);
      setError('Failed to load settings data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'team', label: 'Team', icon: '👥' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo-icon">AK</div>
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
          <div className="card" style={{ padding: '16px', marginBottom: '24px', borderLeft: '4px solid var(--color-error, #ef4444)' }}>
            <div className="text-body" style={{ color: 'var(--color-error, #ef4444)' }}>⚠️ {error}</div>
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
      if (typeof window !== 'undefined' && (window as any).Plaid) {
        const handler = (window as any).Plaid.create({
          token: data.link_token,
          onSuccess: async (publicToken: string, metadata: any) => {
            try {
              const exchangeRes = await fetch('/api/plaid/exchange', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  publicToken,
                  entityId: primaryEntityId,
                  institutionName: metadata?.institution?.name || 'Unknown',
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
        handler.open();
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
    window.location.href = path;
  };

  const handleSlackConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('slack');
    window.location.href = `/api/channels/slack/install?entityId=${primaryEntityId}`;
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
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--color-error, #ef4444)' }}>
          <div className="text-body" style={{ color: 'var(--color-error, #ef4444)' }}>⚠️ {actionError}</div>
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

  const planLabels: Record<string, string> = {
    cpa_foundation: 'CPA Foundation',
    cpa_scale: 'CPA Scale',
    cpa_enterprise: 'CPA Enterprise',
    smb_basic: 'SMB Basic',
    smb_growth: 'SMB Growth',
    smb_premium: 'SMB Premium',
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
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, plan, email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Checkout failed. Please try again.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Checkout failed: no redirect URL received.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Checkout failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to open billing portal.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Failed to open billing portal: no redirect URL received.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      alert('Failed to open billing portal. Please try again.');
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
          <button className="btn btn-secondary btn-sm" onClick={() => handleCheckout('smb_basic')} disabled={loading}>
            SMB Basic — $249/mo
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleCheckout('smb_growth')} disabled={loading}>
            SMB Growth — $499/mo
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
    setInviteLoading(true);
    setActionError(null);

    try {
      const supabase = getSupabase();
      const { error: insertError } = await (supabase as any)
        .from('team_members')
        .insert({
          org_id: orgId,
          role: role,
          invited_email: email,
        });

      if (insertError) {
        throw new Error(insertError.message);
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
      const supabase = getSupabase();
      const { error: deleteError } = await (supabase as any)
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
        <div className="card" style={{ padding: '12px 16px', borderLeft: '4px solid var(--color-error, #ef4444)' }}>
          <div className="text-body" style={{ color: 'var(--color-error, #ef4444)' }}>⚠️ {actionError}</div>
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
          💡 Unlimited seats — all plans include unlimited team members at no extra cost.
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
