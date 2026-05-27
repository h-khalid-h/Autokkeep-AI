'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// ─── Lazy Supabase singleton (never at module level) ────────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────────────
interface TransactionRow {
  id: string;
  date: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  amount: number;
  currency: string;
  category_ai: string | null;
  category_human: string | null;
  status: string;
  confidence: number | null;
  ai_reasoning: string | null;
  raw_bank_description: string | null;
  mcc_code: string | null;
  card_holder: string | null;
  card_last4: string | null;
  document_status: string | null;
  description: string | null;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'confidence_asc' | 'confidence_desc';
type StatusFilter = '' | 'pending' | 'human_review' | 'auto_categorized' | 'approved' | 'synced';

const PAGE_SIZE = 25;

// ─── Status badge config ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:          { label: 'Pending',          color: 'var(--warning)',  bg: 'var(--warning-subtle)',      border: 'var(--warning-border)' },
  human_review:     { label: 'Human Review',     color: '#f97316',        bg: 'rgba(249,115,22,0.12)',      border: 'rgba(249,115,22,0.25)' },
  auto_categorized: { label: 'Auto-Categorized', color: 'var(--info)',     bg: 'var(--info-subtle)',         border: 'rgba(14,165,233,0.25)' },
  approved:         { label: 'Approved',         color: 'var(--success)', bg: 'var(--success-subtle)',      border: 'var(--success-border)' },
  synced:           { label: 'Synced',           color: '#a855f7',        bg: 'rgba(168,85,247,0.12)',      border: 'rgba(168,85,247,0.25)' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const getConfidenceColor = (conf: number) => {
  if (conf < 50) return 'var(--destructive)';
  if (conf < 80) return 'var(--warning)';
  return 'var(--success)';
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  // Data state
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyTransactions, setHasAnyTransactions] = useState<boolean | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<SortOption>('date_desc');
  const [page, setPage] = useState(0);

  // UI state
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Resolve entity on mount
  useEffect(() => {
    async function resolveEntity() {
      try {
        const supabase = getSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: membership } = await (supabase as any)
          .from('team_members')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!membership) return;

        const { data: entities } = await (supabase as any)
          .from('entities')
          .select('id')
          .eq('org_id', membership.org_id)
          .order('created_at', { ascending: true })
          .limit(1);

        if (entities && entities.length > 0) {
          setEntityId(entities[0].id);
        }
      } catch {
        // Will use API without entityId
      }
    }
    resolveEntity();
  }, []);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('sort', sort);

      const res = await fetch(`/api/transactions?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);

      const data = await res.json();
      const txns: TransactionRow[] = data.transactions || [];

      // Server handles sorting — no need to sort client-side
      setTransactions(txns);
      setPagination(data.pagination || { total: 0, limit: PAGE_SIZE, offset: page * PAGE_SIZE, hasMore: false });

      // Track whether user has any transactions at all
      if (hasAnyTransactions === null) {
        setHasAnyTransactions(data.pagination?.total > 0 || txns.length > 0);
      }
    } catch (err) {
      console.error('[Transactions] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, dateFrom, dateTo, sort, hasAnyTransactions]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, sort]);

  // Sort helper
  function sortTransactions(txns: TransactionRow[], sortBy: SortOption): TransactionRow[] {
    const copy = [...txns];
    switch (sortBy) {
      case 'date_desc':
        return copy.sort((a, b) => b.date.localeCompare(a.date));
      case 'date_asc':
        return copy.sort((a, b) => a.date.localeCompare(b.date));
      case 'amount_desc':
        return copy.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      case 'amount_asc':
        return copy.sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
      case 'confidence_asc':
        return copy.sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0));
      case 'confidence_desc':
        return copy.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      default:
        return copy;
    }
  }

  // Clear filters
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setSort('date_desc');
    setPage(0);
  };

  const hasFilters = search || statusFilter || dateFrom || dateTo || sort !== 'date_desc';

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (entityId) params.set('entityId', entityId);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('format', 'csv');

      const res = await fetch(`/api/transactions/export?${params}`);
      if (!res.ok) {
        throw new Error('Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autokkeep-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Export] Error:', err);
      setError('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Summary stats
  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const avgConfidence = transactions.length > 0
    ? Math.round(transactions.reduce((sum, tx) => sum + (tx.confidence ?? 0), 0) / transactions.length)
    : 0;
  const pendingCount = transactions.filter(tx => tx.status === 'pending' || tx.status === 'human_review').length;

  // Pagination
  const totalPages = Math.ceil(pagination.total / PAGE_SIZE);
  const showFrom = pagination.total > 0 ? page * PAGE_SIZE + 1 : 0;
  const showTo = Math.min((page + 1) * PAGE_SIZE, pagination.total);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo-icon">AK</div>
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <h1 className="text-h3" style={{ margin: 0 }}>Transaction History</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleExport}
            disabled={isExporting || transactions.length === 0}
            style={{ opacity: isExporting ? 0.6 : 1 }}
          >
            {isExporting ? '⏳ Exporting…' : '📥 Export CSV'}
          </button>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 24px)', maxWidth: '1200px', paddingBottom: '48px' }}>

        {/* ── Search & Filters ─────────────────────────────────────────────── */}
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          {/* Row 1: Search + Status */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '14px' }}>🔍</span>
              <input
                className="input"
                type="text"
                placeholder="Search by merchant name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            <select
              className="input"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              style={{ flex: '0 1 200px', cursor: 'pointer' }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="human_review">Human Review</option>
              <option value="auto_categorized">Auto-Categorized</option>
              <option value="approved">Approved</option>
              <option value="synced">Synced</option>
            </select>
          </div>

          {/* Row 2: Dates + Sort + Clear */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="text-caption" style={{ whiteSpace: 'nowrap' }}>From</span>
              <input
                className="input"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ width: '160px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="text-caption" style={{ whiteSpace: 'nowrap' }}>To</span>
              <input
                className="input"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ width: '160px' }}
              />
            </div>
            <select
              className="input"
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              style={{ flex: '0 1 220px', cursor: 'pointer' }}
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="amount_desc">Amount (Highest)</option>
              <option value="amount_asc">Amount (Lowest)</option>
              <option value="confidence_asc">Confidence (Lowest)</option>
              <option value="confidence_desc">Confidence (Highest)</option>
            </select>
            {hasFilters && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ whiteSpace: 'nowrap' }}>
                ✕ Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* ── Summary Stats ────────────────────────────────────────────────── */}
        {!isLoading && transactions.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
            <div className="card-elevated" style={{ padding: '16px 20px' }}>
              <div className="text-caption">Total Transactions</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '4px' }}>
                {pagination.total.toLocaleString()}
              </div>
            </div>
            <div className="card-elevated" style={{ padding: '16px 20px' }}>
              <div className="text-caption">Page Amount</div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginTop: '4px',
                fontFamily: 'var(--font-mono)',
                color: totalAmount < 0 ? 'var(--destructive)' : 'var(--text-primary)',
              }}>
                {formatCurrency(totalAmount)}
              </div>
            </div>
            <div className="card-elevated" style={{ padding: '16px 20px' }}>
              <div className="text-caption">Avg Confidence</div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginTop: '4px',
                color: getConfidenceColor(avgConfidence),
              }}>
                {avgConfidence}%
              </div>
            </div>
            <div className="card-elevated" style={{ padding: '16px 20px' }}>
              <div className="text-caption">Pending Review</div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                marginTop: '4px',
                color: pendingCount > 0 ? 'var(--warning)' : 'var(--success)',
              }}>
                {pendingCount}
              </div>
            </div>
          </div>
        )}

        {/* ── Error Banner ─────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--destructive-subtle)',
              color: 'var(--destructive)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px',
              border: '1px solid var(--destructive-border)',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ── Loading State ────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--bg-elevated)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p className="text-caption">Loading transactions…</p>
          </div>
        )}

        {/* ── Empty State (no transactions at all) ─────────────────────────── */}
        {!isLoading && hasAnyTransactions === false && (
          <div className="card" style={{ padding: '80px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🏦</div>
            <h2 className="text-h3" style={{ marginBottom: '8px' }}>No Transactions Yet</h2>
            <p className="text-body" style={{ marginBottom: '24px', maxWidth: '400px', margin: '0 auto 24px' }}>
              Connect a bank account to start importing transactions and let Autokkeep categorize them automatically.
            </p>
            <Link href="/onboarding" className="btn btn-primary">
              Connect Bank Account →
            </Link>
          </div>
        )}

        {/* ── Empty State (no matches) ─────────────────────────────────────── */}
        {!isLoading && hasAnyTransactions !== false && transactions.length === 0 && (
          <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
            <h3 className="text-h4" style={{ marginBottom: '8px' }}>No Transactions Found</h3>
            <p className="text-caption" style={{ marginBottom: '16px' }}>
              Try adjusting your search or filter criteria.
            </p>
            {hasFilters && (
              <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                Clear All Filters
              </button>
            )}
          </div>
        )}

        {/* ── Transaction Table ─────────────────────────────────────────────── */}
        {!isLoading && transactions.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    {['Date', 'Merchant', 'Amount', 'Category', 'Status', 'Confidence', 'Actions'].map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '14px 16px',
                          textAlign: col === 'Amount' || col === 'Confidence' ? 'right' : 'left',
                          fontWeight: 600,
                          color: 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          whiteSpace: 'nowrap',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => {
                    const isExpanded = expandedId === tx.id;
                    const statusCfg = STATUS_CONFIG[tx.status] || { label: tx.status, color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-primary)' };
                    const conf = tx.confidence ?? 0;
                    const glCode = tx.category_human || tx.category_ai || '—';
                    const isNegative = tx.amount < 0;

                    return (
                      <React.Fragment key={tx.id}>
                        {/* Main row */}
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--border-primary)',
                            cursor: 'pointer',
                            background: isExpanded ? 'var(--bg-glass-hover)' : 'transparent',
                            transition: 'background 150ms ease',
                          }}
                          onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'var(--bg-glass)'; }}
                          onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          {/* Date */}
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                            {formatDate(tx.date)}
                          </td>

                          {/* Merchant */}
                          <td style={{ padding: '14px 16px', maxWidth: '240px' }}>
                            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.merchant_name || tx.merchant_raw || 'Unknown'}
                            </div>
                            {tx.merchant_raw && tx.merchant_name && tx.merchant_raw !== tx.merchant_name && (
                              <div className="text-caption" style={{ fontSize: '0.7rem', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {tx.merchant_raw}
                              </div>
                            )}
                          </td>

                          {/* Amount */}
                          <td style={{
                            padding: '14px 16px',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            color: isNegative ? 'var(--destructive)' : 'var(--success)',
                          }}>
                            {isNegative ? '−' : '+'}{formatCurrency(Math.abs(tx.amount))}
                          </td>

                          {/* Category (GL Code) */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.8rem',
                              padding: '2px 8px',
                              background: 'var(--bg-elevated)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-secondary)',
                            }}>
                              {glCode}
                            </span>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '14px 16px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '3px 10px',
                              borderRadius: '9999px',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              color: statusCfg.color,
                              background: statusCfg.bg,
                              border: `1px solid ${statusCfg.border}`,
                              whiteSpace: 'nowrap',
                            }}>
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* Confidence */}
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            <span style={{
                              fontWeight: 600,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.8rem',
                              color: getConfidenceColor(conf),
                            }}>
                              {conf}%
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              {(tx.status === 'pending' || tx.status === 'human_review') && (
                                <Link
                                  href="/dashboard"
                                  className="btn btn-primary btn-sm"
                                  style={{ fontSize: '0.7rem', padding: '4px 10px' }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  Review
                                </Link>
                              )}
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                onClick={e => {
                                  e.stopPropagation();
                                  setExpandedId(isExpanded ? null : tx.id);
                                }}
                                title="Expand details"
                              >
                                {isExpanded ? '▲' : '▼'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                            <td colSpan={7} style={{ padding: 0 }}>
                              <div style={{
                                padding: '20px 24px',
                                background: 'var(--bg-secondary)',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                gap: '20px',
                                animation: 'slide-up-fade 0.2s ease-out',
                              }}>
                                {/* AI Reasoning */}
                                <div>
                                  <div className="text-caption" style={{ marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                                    🤖 AI Reasoning
                                  </div>
                                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                    {tx.ai_reasoning || 'No AI analysis available for this transaction.'}
                                  </p>
                                </div>

                                {/* Raw Data */}
                                <div>
                                  <div className="text-caption" style={{ marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                                    📄 Raw Data
                                  </div>
                                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                                    <div><span style={{ color: 'var(--text-tertiary)' }}>Bank Desc:</span> {tx.raw_bank_description || tx.merchant_raw || '—'}</div>
                                    <div><span style={{ color: 'var(--text-tertiary)' }}>MCC:</span> {tx.mcc_code || '—'}</div>
                                    <div><span style={{ color: 'var(--text-tertiary)' }}>Currency:</span> {tx.currency || 'USD'}</div>
                                    {tx.card_holder && <div><span style={{ color: 'var(--text-tertiary)' }}>Card:</span> {tx.card_holder}{tx.card_last4 ? ` (••••${tx.card_last4})` : ''}</div>}
                                  </div>
                                </div>

                                {/* Receipt & Status */}
                                <div>
                                  <div className="text-caption" style={{ marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.05em' }}>
                                    🧾 Receipt Status
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      padding: '3px 10px',
                                      borderRadius: '9999px',
                                      fontSize: '0.7rem',
                                      fontWeight: 600,
                                      ...(tx.document_status === 'attached'
                                        ? { color: 'var(--success)', background: 'var(--success-subtle)', border: '1px solid var(--success-border)' }
                                        : tx.document_status === 'pending'
                                        ? { color: 'var(--warning)', background: 'var(--warning-subtle)', border: '1px solid var(--warning-border)' }
                                        : { color: 'var(--destructive)', background: 'var(--destructive-subtle)', border: '1px solid var(--destructive-border)' }
                                      ),
                                    }}>
                                      {tx.document_status === 'attached' ? '✅ Attached' : tx.document_status === 'pending' ? '⏳ Pending' : '❌ Missing'}
                                    </span>
                                  </div>
                                  {tx.description && (
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                                      <span style={{ color: 'var(--text-tertiary)' }}>Notes:</span> {tx.description}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────────── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderTop: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
            }}>
              <span className="text-caption">
                Showing {showFrom}–{showTo} of {pagination.total.toLocaleString()}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  style={{ opacity: page === 0 ? 0.4 : 1 }}
                >
                  ← Previous
                </button>
                <span className="text-caption" style={{ padding: '0 8px', fontFamily: 'var(--font-mono)' }}>
                  {page + 1} / {Math.max(1, totalPages)}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!pagination.hasMore}
                  onClick={() => setPage(p => p + 1)}
                  style={{ opacity: !pagination.hasMore ? 0.4 : 1 }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Spin keyframe (matches dashboard pattern) */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
