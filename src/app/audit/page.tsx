'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton, EmptyState, Toggle, useToast } from '@/components/ui';
import { useDataFetcher } from '@/hooks/useDataFetcher';
import type { AuditAction } from '@/lib/audit';
import styles from './audit.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  entity_id: string;
  actor_id: string;
  actor_type: 'human' | 'ai' | 'system';
  action: AuditAction;
  target_type: string;
  target_id: string | null;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
  actor_email?: string;
}

interface AuditResponse {
  entries: AuditLogEntry[];
  total: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const ACTION_OPTIONS: AuditAction[] = [
  'create', 'update', 'delete', 'categorize', 'approve', 'revoke',
  'export', 'sync', 'login', 'connect', 'disconnect',
  'receipt_upload', 'pipeline_processed', 'webhook_received',
];

const ACTION_BADGE_MAP: Record<string, string> = {
  create: 'actionCreate',
  update: 'actionUpdate',
  delete: 'actionDelete',
  categorize: 'actionCategorize',
  approve: 'actionApprove',
  revoke: 'actionRevoke',
  export: 'actionExport',
  sync: 'actionSync',
  login: 'actionLogin',
  connect: 'actionConnect',
  disconnect: 'actionDisconnect',
  receipt_upload: 'actionDefault',
  pipeline_processed: 'actionDefault',
  webhook_received: 'actionDefault',
};

const PAGE_SIZES = [25, 50, 100];
const AUTO_REFRESH_INTERVAL = 30_000;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateId(id: string, length = 12): string {
  return id.length > length ? id.slice(0, length) + '…' : id;
}

function getDefaultDates(): { startDate: string; endDate: string } {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    startDate: thirtyDaysAgo.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

// ─── Page Component ─────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const { selectedEntity } = useEntity();
  const toast = useToast();
  const defaults = React.useMemo(() => getDefaultDates(), []);

  // Filter state
  const [startDate, setStartDate] = React.useState(defaults.startDate);
  const [endDate, setEndDate] = React.useState(defaults.endDate);
  const [actionFilter, setActionFilter] = React.useState<string>('');
  const [resourceTypeFilter, setResourceTypeFilter] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');

  // Pagination
  const [pageSize, setPageSize] = React.useState(25);
  const [currentPage, setCurrentPage] = React.useState(1);

  // UI state
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  const entityId = selectedEntity?.id;

  // ── Fetch audit logs via useDataFetcher ────────────────────────────────
  const { data: auditData, isLoading, error, refetch } = useDataFetcher(
    { entries: [] as AuditLogEntry[], total: 0, lastUpdated: null as Date | null },
    async (signal) => {
      if (!entityId) return { entries: [], total: 0, lastUpdated: null };
      const params = new URLSearchParams({
        entityId: entityId!,
        startDate,
        endDate,
        limit: String(pageSize),
        offset: String((currentPage - 1) * pageSize),
      });
      if (actionFilter) params.set('action', actionFilter);
      if (resourceTypeFilter) params.set('resourceType', resourceTypeFilter);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/audit?${params}`, { signal });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data: AuditResponse = await res.json();
      return { entries: data.entries || [], total: data.total || 0, lastUpdated: new Date() };
    },
    { deps: [entityId, startDate, endDate, actionFilter, resourceTypeFilter, searchQuery, pageSize, currentPage], enabled: !!entityId }
  );
  const entries = auditData.entries;
  const total = auditData.total;
  const lastUpdated = auditData.lastUpdated;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Auto-refresh
  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(refetch, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  // Reset to page 1 on filter change
  const applyFilters = React.useCallback(() => {
    setCurrentPage(1);
  }, []);

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = React.useCallback(() => {
    if (!entityId) return;
    const params = new URLSearchParams({ type: 'audit-log', entityId });
    window.open(`/api/export?${params}`, '_blank');
    toast.success('Audit log export started');
  }, [entityId, toast]);

  // ── Render helpers ────────────────────────────────────────────────────────
  const getActionBadgeClass = (action: string) => {
    const key = ACTION_BADGE_MAP[action] || 'actionDefault';
    return `${styles.actionBadge} ${styles[key as keyof typeof styles] || styles.actionDefault}`;
  };

  return (
    <ErrorBoundary componentName="Audit Log">
      <AppShell>
        <div className={styles.page}>
          <h1 className="sr-only">Audit Log</h1>

          {/* Header */}
          <div>
            <div className={styles.pageHeader}>
              <span className={styles.pageTitle}>📋 Audit Log</span>
              <Badge variant="info" size="sm">SOC 2</Badge>
            </div>
            <p className={styles.pageDescription}>
              Complete audit trail of all actions across your organization. Immutable and tamper-proof.
            </p>
          </div>

          {/* No Entity */}
          {!selectedEntity && (
            <EmptyState
              icon="🏢"
              title="No entity selected"
              description="Select a business entity to view its audit log."
            />
          )}

          {selectedEntity && (
            <>
              {/* Filters */}
              <Card>
                <div className={styles.filtersBar}>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Start Date</label>
                    <input
                      type="date"
                      className={styles.filterInput}
                      value={startDate}
                      onChange={(e) => { setStartDate(e.target.value); applyFilters(); }}
                    />
                  </div>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>End Date</label>
                    <input
                      type="date"
                      className={styles.filterInput}
                      value={endDate}
                      onChange={(e) => { setEndDate(e.target.value); applyFilters(); }}
                    />
                  </div>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Action</label>
                    <select
                      className={styles.filterSelect}
                      value={actionFilter}
                      onChange={(e) => { setActionFilter(e.target.value); applyFilters(); }}
                    >
                      <option value="">All Actions</option>
                      {ACTION_OPTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Resource Type</label>
                    <input
                      type="text"
                      className={styles.filterInput}
                      placeholder="e.g. transaction"
                      value={resourceTypeFilter}
                      onChange={(e) => { setResourceTypeFilter(e.target.value); applyFilters(); }}
                    />
                  </div>
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Search</label>
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Search IDs or details..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') applyFilters(); }}
                    />
                  </div>
                  <div className={styles.filterActions}>
                    <Button variant="ghost" size="sm" onClick={handleExport}>
                      📥 Export
                    </Button>
                  </div>
                </div>
              </Card>

              {/* Toolbar */}
              <Card padding="sm">
                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { refetch(); toast.success('Refreshed'); }}
                    >
                      🔄 Refresh
                    </Button>
                    {lastUpdated && (
                      <span className={styles.lastUpdated}>
                        Updated {relativeTime(lastUpdated.toISOString())}
                      </span>
                    )}
                    <span className={styles.resultCount}>
                      <span className={styles.resultCountNum}>{total}</span> entries
                    </span>
                  </div>
                  <div className={styles.toolbarRight}>
                    {autoRefresh && <span className={styles.liveDot} />}
                    <Toggle
                      checked={autoRefresh}
                      onChange={setAutoRefresh}
                      label="Auto-refresh (30s)"
                      size="sm"
                    />
                  </div>
                </div>
              </Card>

              {/* Error */}
              {error && (
                <div className={styles.errorBanner} role="alert">
                  <span className={styles.errorText}>⚠️ {error}</span>
                  <Button variant="ghost" size="sm" onClick={refetch}>Retry</Button>
                </div>
              )}

              {/* Loading */}
              {isLoading && (
                <Card>
                  <div className={styles.skeletonStack}>
                    <Skeleton width="100%" height={40} />
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} width="100%" height={44} />
                    ))}
                  </div>
                </Card>
              )}

              {/* Empty State */}
              {!isLoading && !error && entries.length === 0 && (
                <EmptyState
                  icon="📋"
                  title="No audit entries found"
                  description="No audit log entries match your current filters. Try adjusting the date range or removing filters."
                />
              )}

              {/* Audit Table */}
              {!isLoading && entries.length > 0 && (
                <Card>
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>User</th>
                          <th>Action</th>
                          <th>Resource Type</th>
                          <th>Resource ID</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((entry) => (
                          <React.Fragment key={entry.id}>
                            <tr onClick={() => setExpandedRowId(expandedRowId === entry.id ? null : entry.id)}>
                              <td className={styles.timestampCell}>
                                <span className={styles.timestampRelative}>{relativeTime(entry.created_at)}</span>
                                <span className={styles.timestampFull}>
                                  {new Date(entry.created_at).toLocaleString()}
                                </span>
                              </td>
                              <td className={styles.emailCell}>
                                {entry.actor_email || truncateId(entry.actor_id)}
                              </td>
                              <td>
                                <span className={getActionBadgeClass(entry.action)}>
                                  {entry.action}
                                </span>
                              </td>
                              <td className={styles.resourceTypeCell}>{entry.target_type}</td>
                              <td>
                                {entry.target_id ? (
                                  <span
                                    className={styles.resourceIdCell}
                                    title={entry.target_id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(entry.target_id!);
                                      toast.success('ID copied');
                                    }}
                                  >
                                    {truncateId(entry.target_id)}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className={styles.detailsToggle}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedRowId(expandedRowId === entry.id ? null : entry.id);
                                  }}
                                >
                                  {expandedRowId === entry.id ? '▲ Hide' : '▼ View'}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Detail Row */}
                            {expandedRowId === entry.id && (
                              <tr className={styles.expandedRow}>
                                <td colSpan={6}>
                                  <div className={styles.expandedContent}>
                                    <div className={styles.detailsGrid}>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>Actor ID</div>
                                        <div className={styles.detailMono}>{entry.actor_id}</div>
                                      </div>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>Actor Type</div>
                                        <div className={styles.detailValue}>
                                          <Badge variant={entry.actor_type === 'human' ? 'info' : entry.actor_type === 'ai' ? 'warning' : 'default'} size="sm">
                                            {entry.actor_type}
                                          </Badge>
                                        </div>
                                      </div>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>Entity ID</div>
                                        <div className={styles.detailMono}>{entry.entity_id}</div>
                                      </div>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>IP Address</div>
                                        <div className={styles.detailMono}>{entry.ip_address || '—'}</div>
                                      </div>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>User Agent</div>
                                        <div className={styles.detailMono}>{entry.user_agent || '—'}</div>
                                      </div>
                                      <div className={styles.detailItem}>
                                        <div className={styles.detailLabel}>Full Timestamp</div>
                                        <div className={styles.detailValue}>
                                          {new Date(entry.created_at).toISOString()}
                                        </div>
                                      </div>
                                    </div>
                                    <div className={styles.jsonLabel}>Full Details (JSON)</div>
                                    <div className={styles.jsonBlock}>
                                      {JSON.stringify(entry.details, null, 2)}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className={styles.pagination}>
                    <div className={styles.paginationInfo}>
                      Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, total)} of {total}
                    </div>
                    <div className={styles.paginationControls}>
                      <select
                        className={styles.pageSizeSelect}
                        value={pageSize}
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                      >
                        {PAGE_SIZES.map((s) => (
                          <option key={s} value={s}>{s} / page</option>
                        ))}
                      </select>
                      <button
                        className={styles.pageButton}
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        aria-label="First page"
                      >
                        ««
                      </button>
                      <button
                        className={styles.pageButton}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        aria-label="Previous page"
                      >
                        ‹
                      </button>
                      <span className={styles.pageButtonActive}>{currentPage}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
                        of {totalPages}
                      </span>
                      <button
                        className={styles.pageButton}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        aria-label="Next page"
                      >
                        ›
                      </button>
                      <button
                        className={styles.pageButton}
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        aria-label="Last page"
                      >
                        »»
                      </button>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
