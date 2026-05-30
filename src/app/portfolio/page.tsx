'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

function getStatusColor(value: number): string {
  if (value >= 95) return 'var(--success)';
  if (value >= 80) return 'var(--accent-primary)';
  if (value >= 60) return 'var(--warning)';
  return 'var(--destructive)';
}

function getBankStatusBadge(status: EntityStats['bankStatus']): { label: string; className: string } {
  switch (status) {
    case 'connected': return { label: '● Connected', className: 'badge badge-success' };
    case 'disconnected': return { label: '○ Not Connected', className: 'badge' };
    case 'error': return { label: '⚠ Error', className: 'badge badge-destructive' };
  }
}

function getLedgerStatusBadge(status: EntityStats['ledgerStatus']): { label: string; className: string } {
  switch (status) {
    case 'connected': return { label: '● Synced', className: 'badge badge-success' };
    case 'disconnected': return { label: '○ Not Connected', className: 'badge' };
  }
}

// ─── Portfolio Page ─────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { setSelectedEntityId } = useEntity();
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

  const _getSortIndicator = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const handleEntityClick = (entityId: string) => {
    setSelectedEntityId(entityId);
  };

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ErrorBoundary componentName="Portfolio">
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: 'var(--space-8)' }}>
        <div className="container">
          <div className="flex-center" style={{ flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-20)' }}>
            <div style={{
              width: '40px', height: '40px',
              border: '3px solid var(--border-primary)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin-slow 0.8s linear infinite',
            }} />
            <p className="text-caption">Loading portfolio data…</p>
          </div>
        </div>
      </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary componentName="Portfolio">
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingTop: 'var(--space-8)', paddingBottom: 'var(--space-16)' }}>
      <div className="container">
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <header style={{ marginBottom: 'var(--space-8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <Link href="/dashboard" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', textDecoration: 'none' }}>
                  ← Back to Dashboard
                </Link>
              </div>
              <h1 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, letterSpacing: '-0.03em' }}>
                <span aria-hidden="true">📊 </span>Entity Portfolio
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', marginTop: 'var(--space-1)' }}>
                All client entities at a glance — exception queues, booking rates, and close readiness.
              </p>
            </div>
            <button className="btn btn-secondary" onClick={fetchPortfolio} aria-label="Refresh portfolio data">
              ↻ Refresh
            </button>
          </div>
        </header>

        {/* ─── Error Banner ───────────────────────────────────────────────── */}
        {error && (
          <div role="alert" style={{
            background: 'var(--destructive-subtle)',
            border: '1px solid var(--destructive-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4) var(--space-6)',
            marginBottom: 'var(--space-6)',
            color: 'var(--destructive)',
            fontSize: '0.875rem',
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* ─── Summary Cards ──────────────────────────────────────────────── */}
        {summary && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-8)',
          }}>
            <SummaryCard
              label="Total Entities"
              value={String(summary.totalEntities)}
              icon="🏢"
              color="var(--accent-primary)"
            />
            <SummaryCard
              label="Pending Review"
              value={String(summary.totalPending)}
              icon="⚡"
              color={summary.totalPending > 0 ? 'var(--warning)' : 'var(--success)'}
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
              color="var(--info)"
            />
          </div>
        )}

        {/* ─── Search ─────────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <input
            type="text"
            className="input"
            placeholder="Search entities…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search entities by name"
            id="portfolio-search"
            style={{ maxWidth: '400px' }}
          />
        </div>

        {/* ─── Entity Table ───────────────────────────────────────────────── */}
        {filteredEntities.length === 0 && !isLoading ? (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
            <span style={{ fontSize: '48px', display: 'block', marginBottom: 'var(--space-4)' }}>🏢</span>
            <h3>No entities found</h3>
            <p className="text-caption" style={{ marginTop: 'var(--space-2)' }}>
              {searchQuery ? 'No entities match your search.' : 'Add your first client entity to get started.'}
            </p>
            {!searchQuery && (
              <Link href="/onboarding" className="btn btn-primary" style={{ marginTop: 'var(--space-6)', textDecoration: 'none' }}>
                + Add Entity
              </Link>
            )}
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <SortableHeader label="Entity" field="name" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Exceptions" field="pending" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="ABR" field="abr" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Close Readiness" field="closeReadiness" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                    <SortableHeader label="Last Sync" field="lastSync" currentSort={sortField} dir={sortDir} onSort={handleSort} />
                    <th style={thStyle}>Bank</th>
                    <th style={thStyle}>Ledger</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntities.map((entity) => {
                    const bankBadge = getBankStatusBadge(entity.bankStatus);
                    const ledgerBadge = getLedgerStatusBadge(entity.ledgerStatus);

                    return (
                      <tr
                        key={entity.entityId}
                        style={{
                          borderBottom: '1px solid var(--border-primary)',
                          transition: 'background var(--duration-fast)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-glass-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        onClick={() => handleEntityClick(entity.entityId)}
                        role="button"
                        tabIndex={0}
                        aria-label={`View ${entity.entityName}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEntityClick(entity.entityId);
                        }}
                      >
                        {/* Entity Name */}
                        <td style={{ ...tdStyle, fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span
                              style={{
                                width: '32px', height: '32px', borderRadius: 'var(--radius-md)',
                                background: 'var(--accent-subtle)', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: '14px',
                                flexShrink: 0,
                              }}
                              aria-hidden="true"
                            >
                              🏢
                            </span>
                            <div>
                              <div>{entity.entityName}</div>
                              <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', fontWeight: 400 }}>
                                {entity.totalTransactions} txns · {entity.currency}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pending Exceptions */}
                        <td style={tdStyle}>
                          {entity.pendingExceptions > 0 ? (
                            <span className="badge badge-warning">{entity.pendingExceptions} pending</span>
                          ) : (
                            <span className="badge badge-success">0 pending</span>
                          )}
                        </td>

                        {/* ABR */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <div style={{
                              width: '48px', height: '6px', borderRadius: '3px',
                              background: 'var(--bg-elevated)', overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${entity.abr}%`, height: '100%',
                                background: getStatusColor(entity.abr),
                                borderRadius: '3px',
                                transition: 'width 0.6s var(--ease-out)',
                              }} />
                            </div>
                            <span style={{ color: getStatusColor(entity.abr), fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                              {entity.abr}%
                            </span>
                          </div>
                        </td>

                        {/* Close Readiness */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <div style={{
                              width: '48px', height: '6px', borderRadius: '3px',
                              background: 'var(--bg-elevated)', overflow: 'hidden',
                            }}>
                              <div style={{
                                width: `${entity.closeReadiness}%`, height: '100%',
                                background: getStatusColor(entity.closeReadiness),
                                borderRadius: '3px',
                                transition: 'width 0.6s var(--ease-out)',
                              }} />
                            </div>
                            <span style={{ color: getStatusColor(entity.closeReadiness), fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                              {entity.closeReadiness}%
                            </span>
                          </div>
                        </td>

                        {/* Last Sync */}
                        <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>
                          {timeAgo(entity.lastSync)}
                        </td>

                        {/* Bank Status */}
                        <td style={tdStyle}>
                          <span className={bankBadge.className}>{bankBadge.label}</span>
                        </td>

                        {/* Ledger Status */}
                        <td style={tdStyle}>
                          <span className={ledgerBadge.className}>{ledgerBadge.label}</span>
                        </td>

                        {/* Actions */}
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <Link
                              href="/dashboard"
                              className="btn btn-sm btn-secondary"
                              style={{ textDecoration: 'none', fontSize: '0.75rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEntityClick(entity.entityId);
                              }}
                            >
                              Review
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
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
    <div
      className="card"
      style={{
        padding: 'var(--space-5)',
        borderColor: highlight ? 'var(--warning-border)' : undefined,
        background: highlight ? 'var(--warning-subtle)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span aria-hidden="true">{icon}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
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
      style={{
        ...thStyle,
        cursor: 'pointer',
        userSelect: 'none',
        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
      }}
      onClick={() => onSort(field)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{isActive ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-4)',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-4)',
  whiteSpace: 'nowrap',
};
