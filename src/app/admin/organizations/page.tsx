'use client';

import React from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

// ─── Types ──────────────────────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

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

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function AdminOrganizationsPage() {
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
      case 'active': return '#10b981';
      case 'trialing': return '#3b82f6';
      case 'past_due': return '#f59e0b';
      case 'canceled': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/admin" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <Logo size={32} />
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-warning" style={{ fontSize: '11px' }}>ADMIN</span>
        </div>
        <Link href="/admin" className="btn btn-ghost btn-sm">
          ← Back to Admin
        </Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 32px)', maxWidth: '1100px' }}>
        <h1 className="text-h2" style={{ marginBottom: '32px' }}>
          🏢 Organizations
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search */}
          <div className="card" style={{ padding: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '1.2rem' }}>🔍</span>
            <input
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--bg-tertiary, #1a1a1a)',
                border: '1px solid var(--border, #333)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
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
                        background: 'var(--bg-tertiary, #2a2a2a)',
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
                          <div className="text-body" style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '12px',
                            wordBreak: 'break-all',
                          }}>
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
