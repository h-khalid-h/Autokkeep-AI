'use client';

import React from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

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

type AdminTab = 'overview' | 'organizations' | 'system';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

// ─── Status Color Map ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--warning)',
  approved: 'var(--success)',
  auto_categorized: 'var(--accent-primary)',
  human_review: 'var(--destructive)',
  synced: '#8b5cf6',
};

// ─── Skeleton ───────────────────────────────────────────────────────────────────

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
    <div className="card-elevated" style={{ padding: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="text-caption" style={{ marginBottom: 'var(--space-2)' }}>{label}</div>
          {loading ? (
            <Skeleton width="80px" height="32px" />
          ) : (
            <div className="text-h3" style={{ fontSize: '1.75rem', color: 'var(--text-primary)' }}>{value}</div>
          )}
        </div>
        <div style={{
          fontSize: '1.75rem',
          opacity: 0.6,
          width: '44px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--accent-subtle)',
        }}>{icon}</div>
      </div>
    </div>
  );
}

// ─── Status Breakdown Bar ───────────────────────────────────────────────────────

function StatusBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  if (total === 0) {
    return (
      <div className="text-caption" style={{ textAlign: 'center', padding: '20px' }}>
        No transactions yet
      </div>
    );
  }

  return (
    <div>
      {/* Visual bar */}
      <div style={{
        display: 'flex',
        height: '24px',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '16px',
        background: 'var(--bg-elevated)',
      }}>
        {Object.entries(byStatus).map(([status, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return (
            <div
              key={status}
              title={`${status}: ${count} (${pct.toFixed(1)}%)`}
              style={{
                width: `${pct}%`,
                background: STATUS_COLORS[status] || '#6b7280',
                transition: 'width 0.3s ease',
                minWidth: pct > 0 ? '4px' : '0',
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: STATUS_COLORS[status] || '#6b7280',
              flexShrink: 0,
            }} />
            <span className="text-caption">
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
  const [activeTab, setActiveTab] = React.useState<AdminTab>('overview');
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  const tabs: { id: AdminTab; label: string; icon: string; href?: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'organizations', label: 'Organizations', icon: '🏢' },
    { id: 'system', label: 'System', icon: '⚙️' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <Logo size={32} />
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="badge badge-warning" style={{ marginRight: '8px', fontSize: '11px' }}>
            ADMIN
          </span>
          <nav style={{ display: 'flex', gap: '4px' }}>
            {tabs.map((tab) =>
              tab.href ? (
                <Link
                  key={tab.id}
                  href={tab.href}
                  className="btn btn-ghost btn-sm"
                >
                  {tab.icon} {tab.label}
                </Link>
              ) : (
                <button
                  key={tab.id}
                  className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon} {tab.label}
                </button>
              )
            )}
          </nav>
        </div>

        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Back to Dashboard
        </Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 32px)', maxWidth: '1100px' }}>
        <h1 className="text-h2" style={{ marginBottom: '8px' }}>
          🛡️ Admin Dashboard
        </h1>
        <p className="text-caption" style={{ marginBottom: '32px' }}>
          Platform-wide visibility into organizations, subscriptions, and system health.
        </p>

        {error && (
          <div className="card" style={{
            padding: '16px',
            marginBottom: '24px',
            borderLeft: '4px solid var(--destructive)',
          }}>
            <div className="text-body" style={{ color: 'var(--destructive)' }}>
              ⚠️ {error}
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab stats={stats} loading={loading} />
        )}
        {activeTab === 'organizations' && (
          <OrganizationsTab />
        )}
        {activeTab === 'system' && (
          <SystemTab />
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
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
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Transaction Volume</div>
        {loading ? (
          <div style={{ display: 'flex', gap: '16px' }}>
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
            <Skeleton width="100%" height="60px" />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div className="text-h3" style={{ color: 'var(--accent-primary)' }}>
                {formatNumber(stats?.transactions.today || 0)}
              </div>
              <div className="text-caption">Today</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div className="text-h3" style={{ color: 'var(--accent-primary)' }}>
                {formatNumber(stats?.transactions.thisWeek || 0)}
              </div>
              <div className="text-caption">This Week</div>
            </div>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <div className="text-h3" style={{ color: 'var(--accent-primary)' }}>
                {formatNumber(stats?.transactions.thisMonth || 0)}
              </div>
              <div className="text-caption">This Month</div>
            </div>
          </div>
        )}
      </div>

      {/* Status Breakdown */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Transactions by Status</div>
        {loading ? (
          <Skeleton width="100%" height="80px" />
        ) : stats ? (
          <StatusBar byStatus={stats.transactions.byStatus} total={stats.transactions.total} />
        ) : null}
      </div>

      {/* Subscriptions by Plan */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Active Subscriptions by Plan</div>
        {loading ? (
          <Skeleton width="100%" height="60px" />
        ) : stats ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            {Object.keys(stats.subscriptions.byPlan).length === 0 ? (
              <div className="text-caption">No active subscriptions</div>
            ) : (
              Object.entries(stats.subscriptions.byPlan).map(([plan, count]) => (
                <div key={plan} className="card" style={{ padding: '16px', textAlign: 'center', minWidth: '120px' }}>
                  <div className="text-h4">{count}</div>
                  <div className="text-caption" style={{ textTransform: 'capitalize' }}>
                    {plan.replace(/_/g, ' ')}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZATIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

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

function OrganizationsTab() {
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

  const fetchOrgs = React.useCallback(async (page: number, searchTerm: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/admin/organizations?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setOrgs(data.organizations || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 20, hasMore: false });
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  const isInitialMount = React.useRef(true);

  // Fetch on mount immediately, then debounce on search changes
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

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'var(--success)';
      case 'trialing': return 'var(--accent-primary)';
      case 'past_due': return 'var(--warning)';
      case 'canceled': return 'var(--destructive)';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search */}
      <div className="card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <span style={{ fontSize: '1.2rem' }}>🔍</span>
        <input
          type="text"
          className="input"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <div className="text-caption">
          {pagination.total} total
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card" style={{ padding: '20px' }}>
              <Skeleton width="100%" height="20px" />
            </div>
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="text-caption">No organizations found</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {orgs.map((org) => (
            <div key={org.id}>
              <div
                className="card"
                style={{
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                }}
                onClick={() => setExpandedId(expandedId === org.id ? null : org.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="text-h4">{org.name}</div>
                    <div className="text-caption" style={{ marginTop: '4px' }}>
                      {org.slug} · Created {new Date(org.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: '60px' }}>
                    <div className="text-h4">{org.entityCount}</div>
                    <div className="text-caption">Entities</div>
                  </div>

                  <div style={{ textAlign: 'center', minWidth: '80px' }}>
                    <div className="text-h4">{formatNumber(org.transactionCount)}</div>
                    <div className="text-caption">Txns</div>
                  </div>

                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: `${statusColor(org.status)}22`,
                    color: statusColor(org.status),
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    minWidth: '60px',
                    textAlign: 'center',
                  }}>
                    {org.status}
                  </div>

                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: 'var(--bg-elevated)',
                    fontSize: '12px',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    minWidth: '60px',
                    textAlign: 'center',
                  }}>
                    {org.plan.replace(/_/g, ' ')}
                  </div>

                  <span style={{ opacity: 0.4 }}>
                    {expandedId === org.id ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === org.id && (
                <div className="card" style={{
                  padding: '16px 20px',
                  marginTop: '2px',
                  borderTop: '2px solid var(--accent-primary)',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div>
                      <div className="text-caption" style={{ marginBottom: '4px' }}>Organization ID</div>
                      <div className="text-body" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                        {org.id}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption" style={{ marginBottom: '4px' }}>Plan</div>
                      <div className="text-body" style={{ textTransform: 'capitalize' }}>
                        {org.plan.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption" style={{ marginBottom: '4px' }}>Last Activity</div>
                      <div className="text-body">
                        {org.lastActivity
                          ? new Date(org.lastActivity).toLocaleString()
                          : 'No activity'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '8px' }}>
          <button
            className="btn btn-ghost btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchOrgs(pagination.page - 1, search)}
          >
            ← Previous
          </button>
          <span className="text-caption" style={{ display: 'flex', alignItems: 'center' }}>
            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={!pagination.hasMore}
            onClick={() => fetchOrgs(pagination.page + 1, search)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM TAB
// ═══════════════════════════════════════════════════════════════════════════════

interface SystemData {
  uptime: number;
  timestamp: string;
  database: { status: string; latencyMs: number };
  redis: { status: string };
  cron: { lastTransactionSync: string | null };
  audit: { actionsLast24h: number };
  environment: { group: string; vars: { name: string; set: boolean }[] }[];
}

function SystemTab() {
  const [data, setData] = React.useState<SystemData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchSystem() {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/system');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSystem();
    return () => { cancelled = true; };
  }, []);

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

  const statusIcon = (status: string) => {
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
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: '24px' }}>
            <Skeleton width="40%" height="24px" />
            <div style={{ marginTop: '12px' }}><Skeleton width="80%" /></div>
            <div style={{ marginTop: '8px' }}><Skeleton width="60%" /></div>
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
        <div className="text-caption">Failed to load system status</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Health Overview */}
      <div className="card-elevated" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Service Health</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
              {statusIcon(data.database.status)}
            </div>
            <div className="text-h4">Database</div>
            <div className="text-caption">{data.database.latencyMs}ms</div>
          </div>
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
              {statusIcon(data.redis.status)}
            </div>
            <div className="text-h4">Redis</div>
            <div className="text-caption">{data.redis.status}</div>
          </div>
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>⏱️</div>
            <div className="text-h4">Uptime</div>
            <div className="text-caption">{formatUptime(data.uptime)}</div>
          </div>
          <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📝</div>
            <div className="text-h4">Audit (24h)</div>
            <div className="text-caption">{formatNumber(data.audit.actionsLast24h)} actions</div>
          </div>
        </div>
      </div>

      {/* Cron Status */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Cron / Sync Status</div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div>
            <div className="text-caption" style={{ marginBottom: '4px' }}>Last Transaction Sync</div>
            <div className="text-body">
              {data.cron.lastTransactionSync
                ? new Date(data.cron.lastTransactionSync).toLocaleString()
                : 'No sync activity recorded'}
            </div>
          </div>
        </div>
      </div>

      {/* Environment Variables */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Environment Configuration</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {data.environment.map((group) => {
            const setCount = group.vars.filter((v) => v.set).length;
            const totalCount = group.vars.length;
            const allSet = setCount === totalCount;

            return (
              <div key={group.group}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span>{allSet ? '✅' : '⚠️'}</span>
                  <span className="text-h4" style={{ fontSize: '14px' }}>
                    {group.group}
                  </span>
                  <span className="text-caption">
                    ({setCount}/{totalCount})
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  paddingLeft: '28px',
                }}>
                  {group.vars.map((v) => (
                    <span
                      key={v.name}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono, monospace)',
                        background: v.set
                          ? 'var(--success-subtle)'
                          : 'var(--destructive-subtle)',
                        color: v.set ? 'var(--success)' : 'var(--destructive)',
                        border: `1px solid ${v.set ? 'var(--success-border)' : 'var(--destructive-border)'}`,
                      }}
                    >
                      {v.set ? '✓' : '✗'} {v.name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Server Info */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '12px' }}>Server Info</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div className="text-caption">Timestamp</div>
            <div className="text-body">{new Date(data.timestamp).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-caption">Runtime</div>
            <div className="text-body">Node.js (Next.js)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
