'use client';

import React from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Input, Skeleton, EmptyState, Tabs, useToast } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { formatCurrency } from '@/lib/currency/converter';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface AdminStats {
  organizations: number;
  entities: number;
  transactions: {
    total: number;
    byStatus: {
      pending: number;
      approved: number;
      auto_categorized: number;
      human_review: number;
      synced: number;
    };
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
  subscriptions: {
    byPlan: Record<string, number>;
    monthlyRevenue: number;
  };
}

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  createdAt: string;
  entityCount: number;
  transactionCount: number;
  lastActivity: string | null;
}

interface OrgPagination {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface SystemData {
  uptime: number;
  timestamp: string;
  database: { status: string; latencyMs: number };
  redis: { status: string };
  cron: { lastTransactionSync: string | null };
  audit: { actionsLast24h: number };
  environment: { group: string; vars: { name: string; set: boolean }[] }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--color-warning)',
  approved: 'var(--color-success)',
  auto_categorized: 'var(--color-accent)',
  human_review: 'var(--color-destructive)',
  synced: 'var(--chart-net)',
};

function statusIcon(status: string) {
  switch (status) {
    case 'healthy':
    case 'connected':
      return '✅';
    case 'degraded':
    case 'disconnected':
      return '⚠️';
    case 'unhealthy':
      return '❌';
    case 'not_configured':
      return '➖';
    default:
      return '❓';
  }
}

function statusVariant(status: string): 'success' | 'accent' | 'warning' | 'destructive' | 'default' {
  switch (status) {
    case 'active': return 'success';
    case 'trialing': return 'accent';
    case 'past_due': return 'warning';
    case 'canceled': return 'destructive';
    default: return 'default';
  }
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: string;
  loading: boolean;
}) {
  return (
    <Card variant="elevated">
      <div className={styles.kpiCardInner}>
        <div>
          <div className={styles.kpiLabel}>{label}</div>
          {loading ? (
            <Skeleton width={80} height={32} />
          ) : (
            <div className={styles.kpiValue}>{value}</div>
          )}
        </div>
        <div className={styles.kpiIcon}>{icon}</div>
      </div>
    </Card>
  );
}

// ─── Status Breakdown Bar ───────────────────────────────────────────────────────

function StatusBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) {
    return <div className={styles.statusEmpty}>No transactions yet</div>;
  }

  return (
    <div>
      <div className={styles.statusBar}>
        {Object.entries(byStatus).map(([status, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={status}
              title={`${status}: ${count} (${pct.toFixed(1)}%)`}
              className={styles.statusSegment}
              style={{
                width: `${pct}%`,
                background: STATUS_COLORS[status] || 'var(--color-text-tertiary)',
              }}
            />
          );
        })}
      </div>

      <div className={styles.statusLegend}>
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} className={styles.statusLegendItem}>
            <div
              className={styles.statusDot}
              style={{ background: STATUS_COLORS[status] || 'var(--color-text-tertiary)' }}
            />
            <span className={styles.statusCaption}>
              {status.replace(/_/g, ' ')}: {formatNumber(count)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────────

export default function AdminDashboardPage() {
  const toast = useToast();
  const [stats, setStats] = React.useState<AdminStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : 'Failed to load stats';
          setError(errorMsg);
          toast.error(errorMsg);
        }
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, [toast]);

  return (
    <ErrorBoundary componentName="Admin">
    <AppShell>
      <div className={styles.page}>
        <div>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>🛡️ Admin Dashboard</h1>
            <Badge variant="warning">ADMIN</Badge>
          </div>
          <p className={styles.pageDescription}>
            Platform-wide visibility into organizations, subscriptions, and system health.
          </p>
        </div>

        {error && (
          <Card className={styles.errorBanner} padding="sm">
            <span className={styles.errorText}>⚠️ {error}</span>
          </Card>
        )}

        <Tabs defaultValue="overview">
          <Tabs.List>
            <Tabs.Tab value="overview">📊 Overview</Tabs.Tab>
            <Tabs.Tab value="organizations">🏢 Organizations</Tabs.Tab>
            <Tabs.Tab value="system">⚙️ System</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview">
            <OverviewTab stats={stats} loading={loading} />
          </Tabs.Panel>

          <Tabs.Panel value="organizations">
            <OrganizationsTab />
          </Tabs.Panel>

          <Tabs.Panel value="system">
            <SystemTab />
          </Tabs.Panel>
        </Tabs>
      </div>
    </AppShell>
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  return (
    <div className={styles.tabContent}>
      {/* KPI Cards */}
      <div className={styles.kpiGrid}>
        <KPICard
          label="Total Organizations"
          value={stats ? formatNumber(stats.organizations) : '—'}
          icon="🏢"
          loading={loading}
        />
        <KPICard
          label="Total Entities"
          value={stats ? formatNumber(stats.entities) : '—'}
          icon="📋"
          loading={loading}
        />
        <KPICard
          label="Total Transactions"
          value={stats ? formatNumber(stats.transactions.total) : '—'}
          icon="💳"
          loading={loading}
        />
        <KPICard
          label="Monthly Revenue"
          value={stats ? formatCurrency(stats.subscriptions.monthlyRevenue) : '—'}
          icon="💰"
          loading={loading}
        />
      </div>

      {/* Transaction Volume */}
      <Card>
        <h2 className={styles.sectionTitle}>Transaction Volume</h2>
        {loading ? (
          <div className={styles.skeletonRow}>
            <Skeleton width="100%" height={60} />
            <Skeleton width="100%" height={60} />
            <Skeleton width="100%" height={60} />
          </div>
        ) : (
          <div className={styles.volumeGrid}>
            <Card className={styles.volumeItem} padding="sm">
              <div className={styles.volumeValue}>
                {formatNumber(stats?.transactions.today || 0)}
              </div>
              <div className={styles.volumeLabel}>Today</div>
            </Card>
            <Card className={styles.volumeItem} padding="sm">
              <div className={styles.volumeValue}>
                {formatNumber(stats?.transactions.thisWeek || 0)}
              </div>
              <div className={styles.volumeLabel}>This Week</div>
            </Card>
            <Card className={styles.volumeItem} padding="sm">
              <div className={styles.volumeValue}>
                {formatNumber(stats?.transactions.thisMonth || 0)}
              </div>
              <div className={styles.volumeLabel}>This Month</div>
            </Card>
          </div>
        )}
      </Card>

      {/* Status Breakdown */}
      <Card>
        <h2 className={styles.sectionTitle}>Transactions by Status</h2>
        {loading ? (
          <Skeleton width="100%" height={80} />
        ) : stats ? (
          <StatusBar byStatus={stats.transactions.byStatus} total={stats.transactions.total} />
        ) : null}
      </Card>

      {/* Subscriptions by Plan */}
      <Card>
        <h2 className={styles.sectionTitle}>Active Subscriptions by Plan</h2>
        {loading ? (
          <Skeleton width="100%" height={60} />
        ) : stats ? (
          <div className={styles.planGrid}>
            {Object.keys(stats.subscriptions.byPlan).length === 0 ? (
              <span className={styles.statusCaption}>No active subscriptions</span>
            ) : (
              Object.entries(stats.subscriptions.byPlan).map(([plan, count]) => (
                <Card key={plan} className={styles.planItem} padding="sm">
                  <div className={styles.planCount}>{count}</div>
                  <div className={styles.planName}>{plan.replace(/_/g, ' ')}</div>
                </Card>
              ))
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OrganizationsTab() {
  const toast = useToast();
  const [orgs, setOrgs] = React.useState<OrgItem[]>([]);
  const [pagination, setPagination] = React.useState<OrgPagination>({
    total: 0,
    page: 1,
    limit: 20,
    hasMore: false,
  });
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const [error, setError] = React.useState<string | null>(null);

  const fetchOrgs = React.useCallback(async (page: number, searchTerm: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/admin/organizations?${params}`);
      if (!res.ok) {
        const errorMsg = `Failed to load organizations (${res.status})`;
        setError(errorMsg);
        toast.error(errorMsg);
        return;
      }
      const data = await res.json();
      setOrgs(data.organizations || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 20, hasMore: false });
    } catch (err) {
      console.error('[Admin] Organizations fetch error:', err);
      const errorMsg = 'Network error — could not load organizations';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const isInitialMount = React.useRef(true);

  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      fetchOrgs(1, '');
      return;
    }
    const timer = setTimeout(() => {
      fetchOrgs(1, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchOrgs]);

  return (
    <div className={styles.tabContent}>
      {/* Error */}
      {error && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {error}</span>
          <Button variant="ghost" size="sm" onClick={() => fetchOrgs(pagination.page, search)}>Retry</Button>
        </Card>
      )}

      {/* Search */}
      <Card padding="sm">
        <div className={styles.searchBar}>
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<span>🔍</span>}
            className={styles.searchInput}
          />
          <span className={styles.totalCount}>{pagination.total} total</span>
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className={styles.skeletonStack}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} padding="sm">
              <Skeleton width="100%" height={20} />
            </Card>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <EmptyState
          icon="🏢"
          title="No organizations found"
          description={search ? 'Try a different search term.' : 'No organizations have been created yet.'}
        />
      ) : (
        <div className={styles.orgList}>
          {orgs.map((org) => (
            <div key={org.id}>
              <Card
                variant="interactive"
                padding="sm"
                className={styles.orgRow}
                onClick={() => setExpandedId(expandedId === org.id ? null : org.id)}
                tabIndex={0}
                role="button"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedId(expandedId === org.id ? null : org.id);
                  }
                }}
              >
                <div className={styles.orgRowInner}>
                  <div className={styles.orgInfo}>
                    <div className={styles.orgName}>{org.name}</div>
                    <div className={styles.orgMeta}>
                      {org.slug} · Created {new Date(org.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className={styles.orgStat}>
                    <div className={styles.orgStatValue}>{org.entityCount}</div>
                    <div className={styles.orgStatLabel}>Entities</div>
                  </div>

                  <div className={styles.orgStatWide}>
                    <div className={styles.orgStatValue}>{formatNumber(org.transactionCount)}</div>
                    <div className={styles.orgStatLabel}>Txns</div>
                  </div>

                  <Badge variant={statusVariant(org.status)}>
                    {org.status}
                  </Badge>

                  <Badge variant="default">
                    {org.plan.replace(/_/g, ' ')}
                  </Badge>

                  <span className={styles.expandIcon}>
                    {expandedId === org.id ? '▲' : '▼'}
                  </span>
                </div>
              </Card>

              {expandedId === org.id && (
                <Card className={styles.expandedDetails} padding="sm">
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailLabel}>Organization ID</div>
                      <div className={styles.detailMono}>{org.id}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Plan</div>
                      <div className={styles.detailCapitalize}>{org.plan.replace(/_/g, ' ')}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Last Activity</div>
                      <div className={styles.detailValue}>
                        {org.lastActivity
                          ? new Date(org.lastActivity).toLocaleString()
                          : 'No activity'}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className={styles.pagination}>
          <Button
            variant="ghost"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchOrgs(pagination.page - 1, search)}
          >
            ← Previous
          </Button>
          <span className={styles.paginationText}>
            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!pagination.hasMore}
            onClick={() => fetchOrgs(pagination.page + 1, search)}
          >
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM TAB
// ═══════════════════════════════════════════════════════════════════════════════

function SystemTab() {
  const toast = useToast();
  const [data, setData] = React.useState<SystemData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchSystem() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/system');
        if (!res.ok) {
          if (!cancelled) {
            const errorMsg = `System health check failed (${res.status})`;
            setError(errorMsg);
            toast.error(errorMsg);
          }
          return;
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error('[Admin] System health error:', err);
        if (!cancelled) {
          const errorMsg = 'Network error — could not reach system health endpoint';
          setError(errorMsg);
          toast.error(errorMsg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSystem();
    return () => { cancelled = true; };
  }, [toast]);

  if (loading) {
    return (
      <div className={styles.skeletonStack}>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <div className={styles.skeletonCardInner}>
              <Skeleton width="40%" height={24} />
              <Skeleton width="80%" />
              <Skeleton width="60%" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon="⚠️"
        title="Failed to load system status"
        description={error || 'Unable to retrieve system health data.'}
      />
    );
  }

  return (
    <div className={styles.tabContent}>
      {/* Health Overview */}
      <Card variant="elevated">
        <h2 className={styles.sectionTitle}>Service Health</h2>
        <div className={styles.healthGrid}>
          <Card className={styles.healthItem} padding="sm">
            <div className={styles.healthIcon}>{statusIcon(data.database.status)}</div>
            <div className={styles.healthLabel}>Database</div>
            <div className={styles.healthCaption}>{data.database.latencyMs}ms</div>
          </Card>
          <Card className={styles.healthItem} padding="sm">
            <div className={styles.healthIcon}>{statusIcon(data.redis.status)}</div>
            <div className={styles.healthLabel}>Redis</div>
            <div className={styles.healthCaption}>{data.redis.status}</div>
          </Card>
          <Card className={styles.healthItem} padding="sm">
            <div className={styles.healthIcon}>⏱️</div>
            <div className={styles.healthLabel}>Uptime</div>
            <div className={styles.healthCaption}>{formatUptime(data.uptime)}</div>
          </Card>
          <Card className={styles.healthItem} padding="sm">
            <div className={styles.healthIcon}>📝</div>
            <div className={styles.healthLabel}>Audit (24h)</div>
            <div className={styles.healthCaption}>{formatNumber(data.audit.actionsLast24h)} actions</div>
          </Card>
        </div>
      </Card>

      {/* Cron Status */}
      <Card>
        <h2 className={styles.sectionTitle}>Cron / Sync Status</h2>
        <div className={styles.cronRow}>
          <div>
            <div className={styles.cronLabel}>Last Transaction Sync</div>
            <div className={styles.cronValue}>
              {data.cron.lastTransactionSync
                ? new Date(data.cron.lastTransactionSync).toLocaleString()
                : 'No sync activity recorded'}
            </div>
          </div>
        </div>
      </Card>

      {/* Environment Variables */}
      <Card>
        <h2 className={styles.sectionTitle}>Environment Configuration</h2>
        <div className={styles.envGroups}>
          {data.environment.map((group) => {
            const setCount = group.vars.filter((v) => v.set).length;
            const totalCount = group.vars.length;
            const allSet = setCount === totalCount;

            return (
              <div key={group.group}>
                <div className={styles.envGroupHeader}>
                  <span>{allSet ? '✅' : '⚠️'}</span>
                  <span className={styles.envGroupName}>{group.group}</span>
                  <span className={styles.envGroupCount}>({setCount}/{totalCount})</span>
                </div>
                <div className={styles.envVars}>
                  {group.vars.map((v) => (
                    <Badge
                      key={v.name}
                      variant={v.set ? 'success' : 'destructive'}
                      size="sm"
                    >
                      {v.set ? '✓' : '✗'} {v.name}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Server Info */}
      <Card>
        <h2 className={styles.sectionTitle}>Server Info</h2>
        <div className={styles.serverGrid}>
          <div>
            <div className={styles.serverLabel}>Timestamp</div>
            <div className={styles.serverValue}>{new Date(data.timestamp).toLocaleString()}</div>
          </div>
          <div>
            <div className={styles.serverLabel}>Runtime</div>
            <div className={styles.serverValue}>Node.js (Next.js)</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
