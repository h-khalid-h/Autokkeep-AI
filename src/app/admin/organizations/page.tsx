'use client';

import React from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Input, Skeleton, EmptyState } from '@/components/ui';
import styles from './page.module.css';

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

function statusVariant(status: string): 'success' | 'accent' | 'warning' | 'destructive' | 'default' {
  switch (status) {
    case 'active': return 'success';
    case 'trialing': return 'accent';
    case 'past_due': return 'warning';
    case 'canceled': return 'destructive';
    default: return 'default';
  }
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
        setError(`Failed to load organizations (${res.status})`);
        return;
      }
      const data = await res.json();
      setOrgs(data.organizations || []);
      setPagination(data.pagination || { total: 0, page: 1, limit: 20, hasMore: false });
    } catch (err) {
      console.error('[Admin Orgs] Fetch error:', err);
      setError('Network error — could not load organizations.');
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

  return (
    <AppShell>
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>🏢 Organizations</h1>
          <Badge variant="warning">ADMIN</Badge>
        </div>

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
            <span className={styles.totalCount}>
              {pagination.total} total
            </span>
          </div>
        </Card>

        {/* Error Banner */}
        {error && (
          <Card padding="sm" className={styles.errorBanner}>
            <span>⚠️ {error}</span>
            <Button variant="ghost" size="sm" onClick={() => fetchOrgs(pagination.page, search)}>
              Retry
            </Button>
          </Card>
        )}

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

                {/* Expanded Details */}
                {expandedId === org.id && (
                  <Card className={styles.expandedDetails} padding="sm">
                    <div className={styles.detailsGrid}>
                      <div>
                        <div className={styles.detailLabel}>Organization ID</div>
                        <div className={styles.detailMono}>{org.id}</div>
                      </div>
                      <div>
                        <div className={styles.detailLabel}>Plan</div>
                        <div className={styles.detailCapitalize}>
                          {org.plan.replace(/_/g, ' ')}
                        </div>
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
    </AppShell>
  );
}
