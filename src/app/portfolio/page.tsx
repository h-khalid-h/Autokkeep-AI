'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Input, Progress, Skeleton, EmptyState } from '@/components/ui';
import styles from './portfolio.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface EntityStats {
  entityId: string;
  entityName: string;
  currency: string;
  pendingExceptions: number;
  totalTransactions: number;
  abr: number;
  lastSync: string | null;
  closeReadiness: number;
  bankStatus: 'connected' | 'disconnected' | 'error';
  ledgerStatus: 'connected' | 'disconnected';
}

interface PortfolioSummary {
  totalEntities: number;
  totalPending: number;
  totalTransactions: number;
  avgAbr: number;
  avgCloseReadiness: number;
  connectedBanks: number;
  connectedLedgers: number;
}

type SortField = 'name' | 'pending' | 'abr' | 'closeReadiness' | 'lastSync';
type SortDir = 'asc' | 'desc';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getProgressColor(value: number): 'success' | 'accent' | 'warning' | 'destructive' {
  if (value >= 95) return 'success';
  if (value >= 80) return 'accent';
  if (value >= 60) return 'warning';
  return 'destructive';
}

function getStatusColor(value: number): string {
  if (value >= 95) return 'var(--color-success)';
  if (value >= 80) return 'var(--color-accent)';
  if (value >= 60) return 'var(--color-warning)';
  return 'var(--color-destructive)';
}

function getBankBadge(status: EntityStats['bankStatus']): { label: string; variant: 'success' | 'default' | 'destructive'; dot: boolean } {
  switch (status) {
    case 'connected': return { label: 'Connected', variant: 'success', dot: true };
    case 'disconnected': return { label: 'Not Connected', variant: 'default', dot: true };
    case 'error': return { label: 'Error', variant: 'destructive', dot: true };
  }
}

function getLedgerBadge(status: EntityStats['ledgerStatus']): { label: string; variant: 'success' | 'default'; dot: boolean } {
  switch (status) {
    case 'connected': return { label: 'Synced', variant: 'success', dot: true };
    case 'disconnected': return { label: 'Not Connected', variant: 'default', dot: true };
  }
}

// ─── Portfolio Page ─────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { setSelectedEntityId } = useEntity();
  const router = useRouter();
  const [entities, setEntities] = useState<EntityStats[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>('pending');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchPortfolio = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/portfolio');
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setEntities(data.entities || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error('[Portfolio]', err);
      setError(err instanceof Error ? err.message : 'Failed to load portfolio');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPortfolio();
  }, [fetchPortfolio]);

  // Sort and filter
  const filteredEntities = React.useMemo(() => {
    let list = [...entities];

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.entityName.toLowerCase().includes(q));
    }

    // Sort
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'name':
          cmp = a.entityName.localeCompare(b.entityName);
          break;
        case 'pending':
          cmp = a.pendingExceptions - b.pendingExceptions;
          break;
        case 'abr':
          cmp = a.abr - b.abr;
          break;
        case 'closeReadiness':
          cmp = a.closeReadiness - b.closeReadiness;
          break;
        case 'lastSync':
          cmp = (a.lastSync || '').localeCompare(b.lastSync || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [entities, searchQuery, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
    router.push('/dashboard');
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ErrorBoundary componentName="Portfolio">
        <AppShell>
          <div className={styles.pageContainer}>
            <div className={styles.loadingContainer}>
              <div className={styles.loadingGrid}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Card key={i} variant="elevated" padding="md">
                    <Skeleton width="50%" height={12} />
                    <Skeleton width="60%" height={28} />
                  </Card>
                ))}
              </div>
              <Card padding="lg">
                <Skeleton variant="rect" height={300} />
              </Card>
            </div>
          </div>
        </AppShell>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary componentName="Portfolio">
      <AppShell>
        <div className={styles.pageContainer}>
          {/* ─── Header ─────────────────────────────────────────────────────── */}
          <header className={styles.pageHeader}>
            <div className={styles.headerRow}>
              <div>
                <h1 className={styles.headerTitle}>
                  <span aria-hidden="true">📊 </span>Entity Portfolio
                </h1>
                <p className={styles.headerDesc}>
                  All client entities at a glance — exception queues, booking rates, and close readiness.
                </p>
              </div>
              <Button variant="secondary" onClick={fetchPortfolio} aria-label="Refresh portfolio data">
                ↻ Refresh
              </Button>
            </div>
          </header>

          {/* ─── Error Banner ───────────────────────────────────────────────── */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              ⚠️ {error}
            </div>
          )}

          {/* ─── Summary Cards ──────────────────────────────────────────────── */}
          {summary && (
            <div className={styles.summaryGrid}>
              <SummaryCard
                label="Total Entities"
                value={String(summary.totalEntities)}
                icon="🏢"
                color="var(--color-accent)"
              />
              <SummaryCard
                label="Pending Review"
                value={String(summary.totalPending)}
                icon="⚡"
                color={summary.totalPending > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
                highlight={summary.totalPending > 0}
              />
              <SummaryCard
                label="Avg. ABR"
                value={`${summary.avgAbr}%`}
                icon="🤖"
                color={getStatusColor(summary.avgAbr)}
              />
              <SummaryCard
                label="Close Readiness"
                value={`${summary.avgCloseReadiness}%`}
                icon="✅"
                color={getStatusColor(summary.avgCloseReadiness)}
              />
              <SummaryCard
                label="Banks Connected"
                value={`${summary.connectedBanks}/${summary.totalEntities}`}
                icon="🏦"
                color="var(--color-info)"
              />
            </div>
          )}

          {/* ─── Search ─────────────────────────────────────────────────────── */}
          <div className={styles.searchSection}>
            <Input
              placeholder="Search entities…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search entities by name"
              id="portfolio-search"
              leftIcon={<span aria-hidden="true">🔍</span>}
            />
          </div>

          {/* ─── Entity Table ───────────────────────────────────────────────── */}
          {filteredEntities.length === 0 && !isLoading ? (
            <EmptyState
              icon="🏢"
              title="No entities found"
              description={searchQuery ? 'No entities match your search.' : 'Add your first client entity to get started.'}
              action={!searchQuery ? (
                <Button onClick={() => router.push('/onboarding')}>
                  + Add Entity
                </Button>
              ) : undefined}
            />
          ) : (
            <Card padding="sm">
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHeadRow}>
                      <SortableHeader label="Entity" field="name" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Exceptions" field="pending" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader label="ABR" field="abr" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Close Readiness" field="closeReadiness" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                      <SortableHeader label="Last Sync" field="lastSync" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                      <th className={styles.th}>Bank</th>
                      <th className={styles.th}>Ledger</th>
                      <th className={styles.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntities.map((entity) => {
                      const bankBadge = getBankBadge(entity.bankStatus);
                      const ledgerBadge = getLedgerBadge(entity.ledgerStatus);

                      return (
                        <tr
                          key={entity.entityId}
                          className={styles.tableRow}
                          onClick={() => handleEntityClick(entity.entityId)}
                          role="button"
                          tabIndex={0}
                          aria-label={`View ${entity.entityName}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleEntityClick(entity.entityId);
                          }}
                        >
                          {/* Entity Name */}
                          <td className={styles.tdName}>
                            <div className={styles.entityNameCell}>
                              <span className={styles.entityAvatar} aria-hidden="true">
                                🏢
                              </span>
                              <div>
                                <div>{entity.entityName}</div>
                                <div className={styles.entityMeta}>
                                  {entity.totalTransactions} txns · {entity.currency}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Pending Exceptions */}
                          <td className={styles.td}>
                            <Badge variant={entity.pendingExceptions > 0 ? 'warning' : 'success'}>
                              {entity.pendingExceptions} pending
                            </Badge>
                          </td>

                          {/* ABR */}
                          <td className={styles.td}>
                            <div className={styles.progressCell}>
                              <Progress value={entity.abr} size="sm" color={getProgressColor(entity.abr)} />
                              <span className={styles.progressLabel} style={{ color: getStatusColor(entity.abr) }}>
                                {entity.abr}%
                              </span>
                            </div>
                          </td>

                          {/* Close Readiness */}
                          <td className={styles.td}>
                            <div className={styles.progressCell}>
                              <Progress value={entity.closeReadiness} size="sm" color={getProgressColor(entity.closeReadiness)} />
                              <span className={styles.progressLabel} style={{ color: getStatusColor(entity.closeReadiness) }}>
                                {entity.closeReadiness}%
                              </span>
                            </div>
                          </td>

                          {/* Last Sync */}
                          <td className={styles.tdSync}>
                            {timeAgo(entity.lastSync)}
                          </td>

                          {/* Bank Status */}
                          <td className={styles.td}>
                            <Badge variant={bankBadge.variant} dot={bankBadge.dot}>
                              {bankBadge.label}
                            </Badge>
                          </td>

                          {/* Ledger Status */}
                          <td className={styles.td}>
                            <Badge variant={ledgerBadge.variant} dot={ledgerBadge.dot}>
                              {ledgerBadge.label}
                            </Badge>
                          </td>

                          {/* Actions */}
                          <td className={styles.td}>
                            <div className={styles.actionsCell}>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEntityClick(entity.entityId);
                                }}
                              >
                                Review
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}

// ─── Sub-Components ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon,
  color,
  highlight = false,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  highlight?: boolean;
}) {
  return (
    <Card
      variant="default"
      padding="md"
      className={highlight ? styles.highlightCard : undefined}
    >
      <div className={styles.summaryIconRow}>
        <span className={styles.summaryIcon} aria-hidden="true">{icon}</span>
        <span className={styles.summaryLabel}>{label}</span>
      </div>
      <div className={styles.summaryValue} style={{ color }}>
        {value}
      </div>
    </Card>
  );
}

function SortableHeader({
  label,
  field,
  currentSort,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  currentSort: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentSort === field;
  return (
    <th
      className={`${styles.thSortable} ${isActive ? styles.thActive : ''}`}
      onClick={() => onSort(field)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}
