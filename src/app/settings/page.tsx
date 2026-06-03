'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import AppShell from '@/components/layout/AppShell';
import { Card, Tabs } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './page.module.css';

import type { OrgData, EntityData, TeamMemberData, SubscriptionData, ConnectionStatus } from './types';
import IntegrationsTab from './components/IntegrationsTab';
import BillingTab from './components/BillingTab';
import TeamTab from './components/TeamTab';
import LocalizationTab from './components/LocalizationTab';

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
    <ErrorBoundary componentName="Settings">
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
    </ErrorBoundary>
  );
}
