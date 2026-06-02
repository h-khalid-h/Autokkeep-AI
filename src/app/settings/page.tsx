'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Input, Skeleton, Tabs, Modal } from '@/components/ui';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────



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

// ─── Skeleton helper ────────────────────────────────────────────────────────────

function CardSkeletonBlock() {
  return (
    <Card>
      <div className={styles.skeletonCardInner}>
        <Skeleton width="40%" height={24} />
        <Skeleton width="80%" />
        <Skeleton width="60%" />
      </div>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
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

      // 2. Get team membership → org_id, role (multi-org safe)
      const db = supabase as unknown as SupabaseQueryClient;
      const { data: membershipData, error: membershipError } = await db
        .from('team_members')
        .select('id, org_id, role')
        .eq('user_id', user.id)
        .limit(1);

      const membership = membershipData?.[0] ?? null;
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
            .limit(1),
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

        if (subResult.data?.[0]) {
          setSubscription(subResult.data[0]);
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
        const { data: subData } = await db
          .from('subscriptions')
          .select('plan, status, current_period_end, entity_count, transaction_count')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (subData?.[0]) {
          setSubscription(subData[0]);
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

  return (
    <AppShell>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>
          Settings
          {orgData && (
            <span className={styles.orgName}>— {orgData.name}</span>
          )}
        </h1>

        {error && (
          <Card className={styles.errorBanner} padding="sm">
            <span className={styles.errorText}>⚠️ {error}</span>
          </Card>
        )}

        <Tabs defaultValue="integrations">
          <Tabs.List>
            <Tabs.Tab value="integrations">🔌 Integrations</Tabs.Tab>
            <Tabs.Tab value="billing">💳 Billing</Tabs.Tab>
            <Tabs.Tab value="team">👥 Team</Tabs.Tab>
            <Tabs.Tab value="localization">🌍 Localization</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="integrations">
            <IntegrationsTab
              loading={loading}
              entities={entities}
              connections={connections}
              onRefresh={fetchData}
            />
          </Tabs.Panel>

          <Tabs.Panel value="billing">
            <BillingTab
              loading={loading}
              orgId={orgData?.id || ''}
              userEmail={userEmail}
              subscription={subscription}
              entityCount={entities.length}
              transactionCount={transactionCount}
              hitlCount={hitlCount}
            />
          </Tabs.Panel>

          <Tabs.Panel value="team">
            <TeamTab
              loading={loading}
              orgId={orgData?.id || ''}
              userId={userId}
              userRole={userRole}
              teamMembers={teamMembers}
              plan={subscription?.plan || 'starter_monthly'}
              onRefresh={fetchData}
            />
          </Tabs.Panel>

          <Tabs.Panel value="localization">
            <LocalizationTab
              loading={loading}
              entities={entities}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </AppShell>
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
      <div className={styles.skeletonStack}>
        <CardSkeletonBlock />
        <CardSkeletonBlock />
        <CardSkeletonBlock />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {actionError && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {actionError}</span>
        </Card>
      )}

      {integrations.map((category) => (
        <div key={category.category}>
          <h3 className={styles.categoryTitle}>{category.category}</h3>
          <div className={styles.categoryList}>
            {category.items.map((item) => {
              const status = getStatus(item.name);
              const handler = getHandler(item.name);
              const isItemLoading = actionLoading === item.name.toLowerCase().replace(/\s.*/, '');

              return (
                <Card key={item.name} padding="sm">
                  <div className={styles.integrationRow}>
                    <div className={styles.integrationIcon}>{item.icon}</div>
                    <div className={styles.integrationInfo}>
                      <div className={styles.integrationName}>{item.name}</div>
                      <div className={styles.integrationDesc}>{item.description}</div>
                    </div>
                    <div className={styles.integrationActions}>
                      {status === 'configured' && (
                        <Badge variant="success">Connected</Badge>
                      )}
                      {handler ? (
                        <Button
                          variant={status === 'configured' ? 'ghost' : 'primary'}
                          size="sm"
                          onClick={handler}
                          disabled={isItemLoading}
                          isLoading={isItemLoading}
                        >
                          {status === 'configured' ? 'Manage' : item.action}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className={styles.comingSoon}
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
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
      <div className={styles.skeletonStack}>
        <CardSkeletonBlock />
        <CardSkeletonBlock />
        <CardSkeletonBlock />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {billingError && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {billingError}</span>
        </Card>
      )}

      {/* Current Plan */}
      <Card variant="elevated" padding="lg">
        <div className={styles.billingPlanHeader}>
          <div>
            <div className={styles.planLabel}>Current Plan</div>
            <div className={styles.planName}>{planName}</div>
            <div className={styles.planDescription}>{planDescription}</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePortal}
            disabled={loading || !orgId}
          >
            Manage Subscription
          </Button>
        </div>
      </Card>

      {/* Usage */}
      <Card>
        <h2 className={styles.sectionTitle}>Usage This Period</h2>
        <div className={styles.usageGrid}>
          <div>
            <div className={styles.usageValue}>{entityCount}/{entityLimit}</div>
            <div className={styles.usageLabel}>Entities</div>
          </div>
          <div>
            <div className={styles.usageValue}>{transactionCount}</div>
            <div className={styles.usageLabel}>Transactions Processed</div>
          </div>
          <div>
            <div className={styles.usageValue}>{hitlCount}</div>
            <div className={styles.usageLabel}>HITL Reviews</div>
          </div>
        </div>
      </Card>

      {/* Upgrade */}
      <Card variant="accent">
        <div className={styles.textCenter}>
          <div className={styles.upgradeTitle}>Ready to Scale?</div>
          <div className={styles.upgradeDesc}>Upgrade to unlock unlimited entities and advanced features.</div>
          <div className={styles.upgradeBtns}>
            <Button variant="secondary" size="sm" onClick={() => handleCheckout('starter')} disabled={loading}>
              Starter — $29/mo
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleCheckout('growth')} disabled={loading}>
              Growth — $99/mo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleCheckout('pro')} disabled={loading}>
              Pro — $299/mo
            </Button>
          </div>
        </div>
      </Card>
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
  plan,
  onRefresh,
}: {
  loading: boolean;
  orgId: string;
  userId: string;
  userRole: string;
  teamMembers: TeamMemberData[];
  plan: string;
  onRefresh: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('accountant');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  // Seat limit enforcement
  // Plan keys match DB values set by Stripe webhook via PLAN_DB_NAMES
  const PLAN_SEAT_LIMITS: Record<string, number> = {
    free: 3,
    starter: 3,
    smb_growth: 10,
    cpa_professional: Infinity,
    cpa_enterprise: Infinity,
  };
  const seatLimit = PLAN_SEAT_LIMITS[plan] ?? 3;
  const currentSeats = teamMembers.length;
  const isAtSeatLimit = currentSeats >= seatLimit;

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

    // Enforce seat limit
    if (isAtSeatLimit) {
      setActionError(`Your plan allows up to ${seatLimit} seats. Upgrade to add more team members.`);
      setInviteLoading(false);
      return;
    }

    try {
      // Use the server-side API exclusively — it validates role, checks duplicates, enforces seat limits
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }

      setEmail('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleRemove = async (memberId: string) => {
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
      setConfirmRemoveId(null);
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
      {actionError && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {actionError}</span>
        </Card>
      )}

      {/* Invite Form */}
      <Card>
        <h2 className={styles.sectionTitle}>Invite Team Member</h2>
        <form onSubmit={handleInvite} className={styles.inviteForm}>
          <div className={styles.inviteEmailField}>
            <Input
              label="Email"
              type="email"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!canManageTeam}
            />
          </div>
          <div className={styles.inviteRoleField}>
            <label htmlFor="invite-role" className={styles.fieldLabel}>Role</label>
            <select
              id="invite-role"
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!canManageTeam}
            >
              <option value="admin" className={styles.selectOption}>Admin</option>
              <option value="accountant" className={styles.selectOption}>Accountant</option>
              <option value="viewer" className={styles.selectOption}>Viewer</option>
            </select>
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={inviteLoading || !canManageTeam || isAtSeatLimit} isLoading={inviteLoading}>
            Invite
          </Button>
        </form>
        <p className={styles.inviteHint}>
          💡 {isAtSeatLimit
            ? `Seat limit reached (${currentSeats}/${seatLimit === Infinity ? '∞' : seatLimit}). Upgrade your plan to add more members.`
            : userRole === 'owner' || userRole === 'admin'
            ? `${currentSeats}/${seatLimit === Infinity ? '∞' : seatLimit} seats used. Seat limits vary by plan: Starter (3), Growth (10), Pro (unlimited).`
            : 'Contact your admin for seat availability.'}
        </p>
      </Card>

      {/* Team Members */}
      <Card>
        <h2 className={styles.sectionTitle}>Team Members</h2>
        <div className={styles.memberList}>
          {teamMembers.map((member) => {
            const isCurrentUser = member.user_id === userId;
            const isAccepted = !!member.accepted_at;
            const displayName = isCurrentUser
              ? 'You'
              : (member.user_email || member.invited_email || 'Unknown');
            const displayEmail = member.user_email || member.invited_email || '';

            return (
              <div key={member.id} className={styles.memberRow}>
                <div>
                  <div className={styles.memberName}>
                    {displayName}{isCurrentUser ? ` (${member.role})` : ''}
                  </div>
                  <div className={styles.memberEmail}>{displayEmail}</div>
                </div>
                <div className={styles.memberActions}>
                  <Badge variant={isAccepted ? 'success' : 'warning'}>
                    {isAccepted ? member.role : 'Pending'}
                  </Badge>
                  {member.role !== 'owner' && !isCurrentUser && canManageTeam && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveId(member.id)}
                      disabled={removeLoading === member.id}
                      isLoading={removeLoading === member.id}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {teamMembers.length === 0 && (
            <div className={styles.emptyText}>No team members found.</div>
          )}
        </div>
      </Card>
      {/* Confirm Remove Modal */}
      <Modal
        isOpen={!!confirmRemoveId}
        onClose={() => setConfirmRemoveId(null)}
        title="Remove Team Member"
        size="sm"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmRemoveId && handleRemove(confirmRemoveId)}
              isLoading={!!removeLoading}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p>Are you sure you want to remove this team member? They will lose access to this organization immediately.</p>
      </Modal>
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
