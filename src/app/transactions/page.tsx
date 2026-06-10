'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useEntity } from '@/lib/context/EntityContext';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/currency/converter';
import { getTaxRules } from '@/lib/tax/rules';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Badge, Input, Skeleton, EmptyState, useToast } from '@/components/ui';
import styles from './page.module.css';

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

interface DuplicateTransaction {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  source: string | null;
}

interface RecurringPattern {
  id: string;
  merchant_name: string;
  frequency: string;
  avg_amount: number;
  next_expected: string | null;
  confidence: number;
  transactions?: { id: string; date: string; amount: number }[];
}

interface DuplicatePair {
  id: string;
  confidence: number;
  transaction_a: DuplicateTransaction;
  transaction_b: DuplicateTransaction;
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

// ─── Status badge variant map ───────────────────────────────────────────────
const STATUS_BADGE_MAP: Record<string, { label: string; variant: 'warning' | 'destructive' | 'info' | 'success' | 'accent' | 'default' }> = {
  pending:          { label: 'Pending',          variant: 'warning' },
  human_review:     { label: 'Human Review',     variant: 'destructive' },
  auto_categorized: { label: 'Auto-Categorized', variant: 'info' },
  approved:         { label: 'Approved',         variant: 'success' },
  synced:           { label: 'Synced',           variant: 'accent' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const getConfidenceVariant = (conf: number): 'destructive' | 'warning' | 'success' => {
  if (conf < 50) return 'destructive';
  if (conf < 80) return 'warning';
  return 'success';
};

const getConfidenceColor = (conf: number) => {
  if (conf < 50) return 'var(--color-destructive)';
  if (conf < 80) return 'var(--color-warning)';
  return 'var(--color-success)';
};

// ─── Component ──────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const { selectedEntity } = useEntity();
  const toast = useToast();
  const entityCurrency = selectedEntity?.currency || 'USD';
  const fmtCurrency = (amount: number) => formatCurrency(amount, entityCurrency);

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

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCategorizeOpen, setBatchCategorizeOpen] = useState(false);

  // Inline category editing
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [glAccounts, setGlAccounts] = useState<{gl_code: string; name: string}[]>([]);

  // Split transaction dialog
  const [splitDialogTxId, setSplitDialogTxId] = useState<string | null>(null);
  const [splitRows, setSplitRows] = useState<{ glCode: string; glName: string; amount: number; description: string }[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);

  // Recurring patterns
  const [showRecurring, setShowRecurring] = useState(false);
  const [recurringData, setRecurringData] = useState<RecurringPattern[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [expandedRecurringId, setExpandedRecurringId] = useState<string | null>(null);

  // Duplicates review
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateData, setDuplicateData] = useState<DuplicatePair[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch transactions
  const fetchTransactions = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEntity?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));
      params.set('entityId', selectedEntity.id);

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('sort', sort);

      const res = await fetch(`/api/transactions?${params}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);

      const data = await res.json();
      const txns: TransactionRow[] = data.transactions || [];

      setTransactions(txns);
      setPagination(data.pagination || { total: 0, limit: PAGE_SIZE, offset: page * PAGE_SIZE, hasMore: false });

      if (hasAnyTransactions === null) {
        setHasAnyTransactions(data.pagination?.total > 0 || txns.length > 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[Transactions] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, statusFilter, dateFrom, dateTo, sort, selectedEntity?.id]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      fetchTransactions(controller.signal).catch(() => {
        // Errors handled inside fetchTransactions
      });
    });
    return () => controller.abort();
  }, [fetchTransactions]);

  // Reset page and selection when filters change
  useEffect(() => {
    Promise.resolve().then(() => {
      setPage(0);
      setSelectedIds(new Set());
    });
  }, [debouncedSearch, statusFilter, dateFrom, dateTo, sort]);

  // Fetch chart of accounts for inline editing
  useEffect(() => {
    if (!selectedEntity?.id) return;
    const controller = new AbortController();
    fetch(`/api/chart-of-accounts?entityId=${selectedEntity.id}`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => setGlAccounts(data.accounts || []))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [selectedEntity?.id]);

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
      if (selectedEntity?.id) params.set('entityId', selectedEntity.id);
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

  // ── Bulk selection handlers ──────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map(tx => tx.id)));
    }
  };

  const handleBatchAction = async (action: 'approve' | 'reject' | 'categorize', glCode?: string, glName?: string) => {
    if (selectedIds.size === 0 || !selectedEntity?.id) return;
    setBatchLoading(true);
    try {
      const body: Record<string, unknown> = {
        transactionIds: Array.from(selectedIds),
        action,
        entityId: selectedEntity.id,
      };
      if (action === 'categorize' && glCode) {
        body.glCode = glCode;
        body.glName = glName;
      }
      const res = await fetch('/api/transactions/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Batch action failed');
      const count = selectedIds.size;
      setSelectedIds(new Set());
      setBatchCategorizeOpen(false);
      const actionLabel = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'categorized';
      toast.success(`${count} transaction${count > 1 ? 's' : ''} ${actionLabel}`);
      await fetchTransactions();
    } catch (err) {
      console.error('[Transactions] Batch error:', err);
      toast.error('Batch action failed. Please try again.');
    } finally {
      setBatchLoading(false);
    }
  };

  // ── Split transaction handlers ──────────────────────────────────────────
  const openSplitDialog = (tx: TransactionRow) => {
    setSplitDialogTxId(tx.id);
    const halfAmount = Math.round(Math.abs(tx.amount) * 50) / 100;
    setSplitRows([
      { glCode: '', glName: '', amount: halfAmount, description: '' },
      { glCode: '', glName: '', amount: Math.round((Math.abs(tx.amount) - halfAmount) * 100) / 100, description: '' },
    ]);
  };

  const updateSplitRow = (index: number, field: keyof typeof splitRows[0], value: string | number) => {
    setSplitRows(prev => prev.map((row, i) => {
      if (i !== index) return row;
      if (field === 'glCode') {
        const acct = glAccounts.find(a => a.gl_code === value);
        return { ...row, glCode: value as string, glName: acct?.name || '' };
      }
      return { ...row, [field]: value };
    }));
  };

  const addSplitRow = () => {
    setSplitRows(prev => [...prev, { glCode: '', glName: '', amount: 0, description: '' }]);
  };

  const removeSplitRow = (index: number) => {
    if (splitRows.length <= 2) return;
    setSplitRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSplitSubmit = async () => {
    if (!splitDialogTxId || !selectedEntity?.id) return;
    setSplitLoading(true);
    try {
      const res = await fetch(`/api/transactions/${splitDialogTxId}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntity.id,
          splits: splitRows,
        }),
      });
      if (!res.ok) throw new Error('Split failed');
      toast.success('Transaction split successfully');
      setSplitDialogTxId(null);
      setSplitRows([]);
      await fetchTransactions();
    } catch (err) {
      console.error('[Transactions] Split error:', err);
      toast.error('Failed to split transaction. Please try again.');
    } finally {
      setSplitLoading(false);
    }
  };

  // ── Recurring patterns handler ─────────────────────────────────────────
  const fetchRecurring = async () => {
    if (!selectedEntity?.id) return;
    setRecurringLoading(true);
    try {
      const res = await fetch(`/api/transactions/recurring?entityId=${selectedEntity.id}`);
      if (!res.ok) throw new Error('Failed to fetch recurring patterns');
      const data = await res.json();
      setRecurringData(data.patterns || []);
    } catch (err) {
      console.error('[Transactions] Recurring error:', err);
      toast.error('Failed to load recurring patterns.');
    } finally {
      setRecurringLoading(false);
    }
  };

  const toggleRecurring = () => {
    const next = !showRecurring;
    setShowRecurring(next);
    if (next) {
      setShowDuplicates(false);
      fetchRecurring();
    }
  };

  // ── Duplicates handler ─────────────────────────────────────────────────
  const fetchDuplicates = async () => {
    if (!selectedEntity?.id) return;
    setDuplicatesLoading(true);
    try {
      const res = await fetch(`/api/transactions/duplicates?entityId=${selectedEntity.id}`);
      if (!res.ok) throw new Error('Failed to fetch duplicates');
      const data = await res.json();
      setDuplicateData(data.pairs || []);
    } catch (err) {
      console.error('[Transactions] Duplicates error:', err);
      toast.error('Failed to load duplicates.');
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const toggleDuplicates = () => {
    const next = !showDuplicates;
    setShowDuplicates(next);
    if (next) {
      setShowRecurring(false);
      fetchDuplicates();
    }
  };

  const handleDuplicateAction = async (pairId: string, action: 'keep' | 'mark_duplicate') => {
    if (!selectedEntity?.id) return;
    try {
      const res = await fetch(`/api/transactions/duplicates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairId, action, entityId: selectedEntity.id }),
      });
      if (!res.ok) throw new Error('Action failed');
      toast.success(action === 'keep' ? 'Both transactions kept' : 'Marked as duplicate');
      setDuplicateData(prev => prev.filter(p => p.id !== pairId));
    } catch (err) {
      console.error('[Transactions] Duplicate action error:', err);
      toast.error('Action failed. Please try again.');
    }
  };

  // ── Inline category editing handler ─────────────────────────────────────
  const handleCategoryChange = async (txId: string, newGlCode: string) => {
    try {
      const res = await fetch(`/api/transactions/${txId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glCode: newGlCode }),
      });
      if (!res.ok) throw new Error('Failed to update');
      setTransactions(prev => prev.map(tx =>
        tx.id === txId ? { ...tx, category_human: newGlCode } : tx
      ));
      setEditingCategoryId(null);
      toast.success('Category updated');
    } catch (err) {
      console.error('[Transactions] Category update error:', err);
      toast.error('Failed to update category');
    }
  };

  // Summary stats (memoized)
  const totalAmount = useMemo(() => transactions.reduce((sum, tx) => sum + tx.amount, 0), [transactions]);
  const avgConfidence = useMemo(() => transactions.length > 0
    ? Math.round(transactions.reduce((sum, tx) => sum + (tx.confidence ?? 0), 0) / transactions.length)
    : 0, [transactions]);
  const pendingCount = useMemo(() => transactions.filter(tx => tx.status === TRANSACTION_STATUS.PENDING || tx.status === TRANSACTION_STATUS.HUMAN_REVIEW).length, [transactions]);

  // Split dialog memoized values
  const splitTx = useMemo(() => transactions.find(tx => tx.id === splitDialogTxId), [transactions, splitDialogTxId]);
  const splitTotal = useMemo(() => splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [splitRows]);
  const splitRemaining = useMemo(() => splitTx ? Math.round((Math.abs(splitTx.amount) - splitTotal) * 100) / 100 : 0, [splitTx, splitTotal]);
  const isSplitBalanced = useMemo(() => Math.abs(splitRemaining) <= 0.01, [splitRemaining]);

  // Pagination (memoized)
  const totalPages = useMemo(() => Math.ceil(pagination.total / PAGE_SIZE), [pagination.total]);
  const showFrom = pagination.total > 0 ? page * PAGE_SIZE + 1 : 0;
  const showTo = Math.min((page + 1) * PAGE_SIZE, pagination.total);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary componentName="Transactions">
      <AppShell>
        <div className={styles.page}>
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Transaction History</h1>
            <div className={styles.headerActions}>
              <Button
                variant="secondary"
                size="sm"
                onClick={toggleRecurring}
                aria-label="Toggle recurring patterns panel"
              >
                🔄 Recurring
              </Button>
              <div className={styles.badgeButton}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleDuplicates}
                  aria-label="Toggle duplicates review panel"
                >
                  ⚠️ Duplicates
                </Button>
                {duplicateData.length > 0 && (
                  <span className={styles.badgeCount}>{duplicateData.length}</span>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExport}
                disabled={isExporting || transactions.length === 0}
                isLoading={isExporting}
              >
                📥 Export CSV
              </Button>
            </div>
          </div>

          {/* ── Search & Filters ────────────────────────────────────────── */}
          <Card padding="md">
            <div className={styles.filtersCard}>
              <div className={styles.filterRow}>
                <div className={styles.searchWrapper}>
                  <span className={styles.searchIcon}>🔍</span>
                  <Input
                    placeholder="Search by merchant name…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className={styles.searchInput}
                  />
                </div>
                <select
                  className={styles.statusSelect}
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label="Filter by status"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="human_review">Human Review</option>
                  <option value="auto_categorized">Auto-Categorized</option>
                  <option value="approved">Approved</option>
                  <option value="synced">Synced</option>
                </select>
              </div>

              <div className={styles.filterRow}>
                <div className={styles.dateGroup}>
                  <span className={styles.dateLabel}>From</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className={styles.dateInput}
                    aria-label="Filter from date"
                  />
                </div>
                <div className={styles.dateGroup}>
                  <span className={styles.dateLabel}>To</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className={styles.dateInput}
                    aria-label="Filter to date"
                  />
                </div>
                <select
                  className={styles.sortSelect}
                  value={sort}
                  onChange={e => setSort(e.target.value as SortOption)}
                  aria-label="Sort order"
                >
                  <option value="date_desc">Date (Newest First)</option>
                  <option value="date_asc">Date (Oldest First)</option>
                  <option value="amount_desc">Amount (Highest)</option>
                  <option value="amount_asc">Amount (Lowest)</option>
                  <option value="confidence_asc">Confidence (Lowest)</option>
                  <option value="confidence_desc">Confidence (Highest)</option>
                </select>
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    ✕ Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* ── Summary Stats ──────────────────────────────────────────── */}
          {!isLoading && transactions.length > 0 && (
            <div className={styles.statsGrid}>
              <Card variant="elevated" padding="md" className={styles.statCard}>
                <span className={styles.statLabel}>Total Transactions</span>
                <span className={styles.statValue}>{pagination.total.toLocaleString()}</span>
              </Card>
              <Card variant="elevated" padding="md" className={styles.statCard}>
                <span className={styles.statLabel}>Page Amount</span>
                <span
                  className={`${styles.statValue} ${styles.statMono}`}
                  style={{ color: totalAmount < 0 ? 'var(--color-destructive)' : 'var(--color-text-primary)' }}
                >
                  {fmtCurrency(totalAmount)}
                </span>
              </Card>
              <Card variant="elevated" padding="md" className={styles.statCard}>
                <span className={styles.statLabel}>Avg Confidence</span>
                <span className={styles.statValue} style={{ color: getConfidenceColor(avgConfidence) }}>
                  {avgConfidence}%
                </span>
              </Card>
              <Card variant="elevated" padding="md" className={styles.statCard}>
                <span className={styles.statLabel}>Pending Review</span>
                <span
                  className={styles.statValue}
                  style={{ color: pendingCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}
                >
                  {pendingCount}
                </span>
              </Card>
            </div>
          )}

          {/* ── Error Banner ───────────────────────────────────────────── */}
          {error && (
            <div className={styles.errorBanner} role="alert">
              ⚠️ {error}
            </div>
          )}

          {/* ── Loading State ──────────────────────────────────────────── */}
          {isLoading && (
            <Card padding="lg">
              <Skeleton height={20} width="40%" />
              <Skeleton height={48} count={5} />
            </Card>
          )}

          {/* ── Empty State (no transactions at all) ───────────────────── */}
          {!isLoading && hasAnyTransactions === false && (
            <Card padding="lg">
              <EmptyState
                icon="🏦"
                title="No Transactions Yet"
                description="Connect a bank account to start importing transactions and let Autokkeep categorize them automatically."
                action={
                  <Button as={Link} href="/onboarding" variant="primary">
                    Connect Bank Account →
                  </Button>
                }
              />
            </Card>
          )}

          {/* ── Empty State (no matches) ───────────────────────────────── */}
          {!isLoading && hasAnyTransactions !== false && transactions.length === 0 && (
            <Card padding="lg">
              <EmptyState
                icon="🔍"
                title="No Transactions Found"
                description="Try adjusting your search or filter criteria."
                action={
                  hasFilters ? (
                    <Button variant="secondary" size="sm" onClick={clearFilters}>
                      Clear All Filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}

          {/* ── Recurring Patterns Panel ──────────────────────────────── */}
          {showRecurring && (
            <Card padding="md" className={styles.featurePanel}>
              <div className={styles.featurePanelHeader}>
                <h2 className={styles.featurePanelTitle}>🔄 Recurring Patterns</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowRecurring(false)} aria-label="Close recurring panel">
                  ✕
                </Button>
              </div>
              {recurringLoading ? (
                <div className={styles.panelLoading}>
                  <Skeleton height={20} width="60%" />
                  <Skeleton height={56} count={3} />
                </div>
              ) : recurringData.length === 0 ? (
                <EmptyState icon="🔄" title="No Recurring Patterns" description="No recurring transaction patterns have been detected yet." />
              ) : (
                <div className={styles.recurringList}>
                  {recurringData.map((pattern: RecurringPattern) => (
                    <div
                      key={pattern.id}
                      className={styles.recurringItem}
                      onClick={() => setExpandedRecurringId(expandedRecurringId === pattern.id ? null : pattern.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedRecurringId(expandedRecurringId === pattern.id ? null : pattern.id); } }}
                      aria-expanded={expandedRecurringId === pattern.id}
                      aria-label={`Recurring pattern: ${pattern.merchant_name}`}
                    >
                      <div className={styles.recurringItemHeader}>
                        <span className={styles.recurringMerchant}>{pattern.merchant_name}</span>
                        <div className={styles.recurringMeta}>
                          <Badge variant="info" size="sm">{pattern.frequency}</Badge>
                          <span className={styles.recurringMetaItem}>Avg: <strong>{fmtCurrency(pattern.avg_amount)}</strong></span>
                          <span className={styles.recurringMetaItem}>Next: <strong>{pattern.next_expected ? formatDate(pattern.next_expected) : '—'}</strong></span>
                          <Badge variant={pattern.confidence >= 80 ? 'success' : pattern.confidence >= 50 ? 'warning' : 'destructive'} size="sm">
                            {pattern.confidence}% conf.
                          </Badge>
                        </div>
                      </div>
                      {expandedRecurringId === pattern.id && pattern.transactions && (
                        <div className={styles.recurringTransactions}>
                          {pattern.transactions.map((rtx: { id: string; date: string; amount: number }) => (
                            <div key={rtx.id} className={styles.recurringTxRow}>
                              <span>{formatDate(rtx.date)}</span>
                              <span className={styles.recurringTxAmount}>{fmtCurrency(rtx.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ── Duplicates Review Panel ───────────────────────────────── */}
          {showDuplicates && (
            <Card padding="md" className={styles.featurePanel}>
              <div className={styles.featurePanelHeader}>
                <h2 className={styles.featurePanelTitle}>⚠️ Potential Duplicates</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowDuplicates(false)} aria-label="Close duplicates panel">
                  ✕
                </Button>
              </div>
              {duplicatesLoading ? (
                <div className={styles.panelLoading}>
                  <Skeleton height={20} width="50%" />
                  <Skeleton height={80} count={3} />
                </div>
              ) : duplicateData.length === 0 ? (
                <EmptyState icon="✅" title="No Duplicates Found" description="No potential duplicate transactions were detected." />
              ) : (
                <div className={styles.duplicateList}>
                  {duplicateData.map((pair: DuplicatePair) => (
                    <div key={pair.id} className={styles.duplicatePair}>
                      <div className={styles.duplicatePairHeader}>
                        <span className={styles.duplicateConfidence}>
                          Similarity
                        </span>
                        <Badge variant={pair.confidence >= 90 ? 'destructive' : pair.confidence >= 70 ? 'warning' : 'info'} size="sm">
                          {pair.confidence}%
                        </Badge>
                      </div>
                      <div className={styles.duplicateCards}>
                        {[pair.transaction_a, pair.transaction_b].map((dtx: DuplicateTransaction, idx: number) => (
                          <div key={idx} className={styles.duplicateCard}>
                            <div>
                              <span className={styles.duplicateFieldLabel}>Merchant</span>
                              <div className={styles.duplicateFieldValue}>{dtx.merchant_name || 'Unknown'}</div>
                            </div>
                            <div>
                              <span className={styles.duplicateFieldLabel}>Amount</span>
                              <div className={styles.duplicateFieldValueMono}>{fmtCurrency(dtx.amount)}</div>
                            </div>
                            <div>
                              <span className={styles.duplicateFieldLabel}>Date</span>
                              <div className={styles.duplicateFieldValue}>{formatDate(dtx.date)}</div>
                            </div>
                            <div>
                              <span className={styles.duplicateFieldLabel}>Source</span>
                              <div className={styles.duplicateFieldValue}>{dtx.source || '—'}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={styles.duplicatePairActions}>
                        <Button variant="ghost" size="sm" onClick={() => handleDuplicateAction(pair.id, 'keep')} aria-label="Keep both transactions">
                          Keep Both
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDuplicateAction(pair.id, 'mark_duplicate')} aria-label="Mark as duplicate">
                          Mark Duplicate
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ── Bulk Action Bar ──────────────────────────────────────── */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selectedIds.size} selected</span>
              <div className={styles.bulkActions}>
                <Button variant="primary" size="sm" disabled={batchLoading} isLoading={batchLoading} onClick={() => handleBatchAction('approve')}>
                  ✅ Approve Selected
                </Button>
                <div className={styles.bulkCategorizeWrapper}>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={batchLoading}
                    onClick={() => setBatchCategorizeOpen(prev => !prev)}
                    aria-label="Bulk categorize selected transactions"
                    aria-expanded={batchCategorizeOpen}
                  >
                    📂 Categorize
                  </Button>
                  {batchCategorizeOpen && (
                    <div className={styles.bulkCategorizeDropdown} role="listbox" aria-label="Select GL account">
                      {glAccounts.map(acct => (
                        <button
                          key={acct.gl_code}
                          className={styles.bulkCategorizeItem}
                          role="option"
                          aria-selected={false}
                          onClick={() => handleBatchAction('categorize', acct.gl_code, acct.name)}
                        >
                          {acct.gl_code} — {acct.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button variant="destructive" size="sm" disabled={batchLoading} onClick={() => handleBatchAction('reject')}>
                  ❌ Reject Selected
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* ── Transaction Table ──────────────────────────────────────── */}
          {!isLoading && transactions.length > 0 && (
            <Card padding="sm" className={styles.tableCard}>
              {/* Desktop Table */}
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkboxCell}>
                        <input
                          type="checkbox"
                          className={styles.rowCheckbox}
                          checked={selectedIds.size === transactions.length && transactions.length > 0}
                          onChange={toggleSelectAll}
                          aria-label="Select all transactions"
                        />
                      </th>
                      {['Date', 'Merchant', 'Amount', 'Category', 'Status', 'Confidence', 'Actions'].map(col => (
                        <th
                          key={col}
                          className={col === 'Amount' || col === 'Confidence' ? styles.thRight : styles.th}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => {
                      const isExpanded = expandedId === tx.id;
                      const statusCfg = STATUS_BADGE_MAP[tx.status] || { label: tx.status, variant: 'default' as const };
                      const conf = tx.confidence ?? 0;
                      const glCode = tx.category_human || tx.category_ai || '—';
                      const isNegative = tx.amount < 0;

                      const country = selectedEntity?.country || 'US';
                      const taxRules = getTaxRules(country);
                      const isReceiptRequired = Math.abs(tx.amount) >= taxRules.receiptThreshold;


                      return (
                        <React.Fragment key={tx.id}>
                          <tr
                            className={isExpanded ? styles.trExpanded : styles.tr}
                            onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                          >
                            <td className={styles.checkboxCell} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className={styles.rowCheckbox}
                                checked={selectedIds.has(tx.id)}
                                onChange={() => toggleSelect(tx.id)}
                                aria-label={`Select transaction ${tx.merchant_name || 'unknown'}`}
                              />
                            </td>
                            <td className={styles.td}>{formatDate(tx.date)}</td>
                            <td className={styles.tdMerchant}>
                              <div className={styles.merchantName}>
                                {tx.merchant_name || tx.merchant_raw || 'Unknown'}
                              </div>
                              {tx.merchant_raw && tx.merchant_name && tx.merchant_raw !== tx.merchant_name && (
                                <div className={styles.merchantRaw}>{tx.merchant_raw}</div>
                              )}
                            </td>
                            <td className={styles.tdAmount} style={{ color: isNegative ? 'var(--color-destructive)' : 'var(--color-success)' }}>
                              {isNegative ? '−' : '+'}{fmtCurrency(Math.abs(tx.amount))}
                            </td>
                            <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                              {editingCategoryId === tx.id ? (
                                <select
                                  className={styles.categorySelect}
                                  value={tx.category_human || tx.category_ai || ''}
                                  onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                                  onBlur={() => setEditingCategoryId(null)}
                                  autoFocus
                                  aria-label={`Category for ${tx.merchant_name || 'transaction'}`}
                                >
                                  <option value="">— Select —</option>
                                  {glAccounts.map(acct => (
                                    <option key={acct.gl_code} value={acct.gl_code}>
                                      {acct.gl_code} — {acct.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span
                                  className={styles.glCodeEditable}
                                  onClick={() => setEditingCategoryId(tx.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingCategoryId(tx.id); } }}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Edit category: ${glCode}`}
                                >
                                  {glCode} ✏️
                                </span>
                              )}
                            </td>
                            <td className={styles.td}>
                              <Badge variant={statusCfg.variant} size="sm">{statusCfg.label}</Badge>
                            </td>
                            <td className={styles.tdConfidence}>
                              <span className={styles.confidenceValue} style={{ color: getConfidenceColor(conf) }}>
                                {conf}%
                              </span>
                            </td>
                            <td className={styles.actionCell}>
                              <div className={styles.actionGroup}>
                                {(tx.status === TRANSACTION_STATUS.PENDING || tx.status === TRANSACTION_STATUS.HUMAN_REVIEW) && (
                                  <Button
                                    as={Link}
                                    href="/dashboard"
                                    variant="primary"
                                    size="sm"
                                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                  >
                                    Review
                                  </Button>
                                )}
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    openSplitDialog(tx);
                                  }}
                                  aria-label={`Split transaction ${tx.merchant_name || 'unknown'}`}
                                >
                                  Split
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e: React.MouseEvent) => {
                                    e.stopPropagation();
                                    setExpandedId(isExpanded ? null : tx.id);
                                  }}
                                >
                                  {isExpanded ? '▲' : '▼'}
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className={styles.expandedRow}>
                              <td colSpan={8}>
                                <div className={styles.expandedContent}>
                                  <div className={styles.expandedSection}>
                                    <div className={styles.expandedLabel}>🤖 AI Reasoning</div>
                                    <p className={styles.expandedText}>
                                      {tx.ai_reasoning || 'No AI analysis available for this transaction.'}
                                    </p>
                                  </div>
                                  <div className={styles.expandedSection}>
                                    <div className={styles.expandedLabel}>📄 Raw Data</div>
                                    <div className={styles.expandedField}>
                                      <div><span className={styles.expandedFieldLabel}>Bank Desc:</span> {tx.raw_bank_description || tx.merchant_raw || '—'}</div>
                                      <div><span className={styles.expandedFieldLabel}>MCC:</span> {tx.mcc_code || '—'}</div>
                                      <div><span className={styles.expandedFieldLabel}>Currency:</span> {tx.currency || 'USD'}</div>
                                      {tx.card_holder && <div><span className={styles.expandedFieldLabel}>Card:</span> {tx.card_holder}{tx.card_last4 ? ` (••••${tx.card_last4})` : ''}</div>}
                                    </div>
                                  </div>
                                  <div className={styles.expandedSection}>
                                    <div className={styles.expandedLabel}>🧾 Receipt Status</div>
                                    <div>
                                      <Badge
                                        variant={
                                          tx.document_status === 'found' ? 'success'
                                            : tx.document_status === 'partial' ? 'warning'
                                            : 'destructive'
                                        }
                                        size="sm"
                                      >
                                        {tx.document_status === 'found' ? '✅ Attached' : tx.document_status === 'partial' ? '⏳ Partial' : '❌ Missing'}
                                      </Badge>
                                    </div>
                                    {tx.document_status !== 'found' && (
                                       <div style={{ marginTop: 'var(--space-2)', fontSize: '11px', color: isReceiptRequired ? 'var(--color-destructive)' : 'var(--color-text-secondary)', fontWeight: isReceiptRequired ? 'bold' : 'normal' }}>
                                         {isReceiptRequired 
                                           ? `⚠️ Receipt required by ${taxRules.authority} (expenses ≥ ${tx.currency} ${taxRules.receiptThreshold})`
                                           : `ℹ️ Receipt optional (below ${taxRules.authority} threshold of ${tx.currency} ${taxRules.receiptThreshold})`
                                         }
                                       </div>
                                     )}
                                    {tx.description && (
                                      <div className={styles.expandedField}>
                                        <span className={styles.expandedFieldLabel}>Notes:</span> {tx.description}
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

              {/* Mobile Cards */}
              <div className={styles.mobileCards}>
                {transactions.map((tx) => {
                  const isExpanded = expandedId === tx.id;
                  const statusCfg = STATUS_BADGE_MAP[tx.status] || { label: tx.status, variant: 'default' as const };
                  const conf = tx.confidence ?? 0;
                  const isNegative = tx.amount < 0;

                  return (
                    <Card
                      key={tx.id}
                      variant="interactive"
                      padding="md"
                      className={styles.mobileCard}
                      onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                    >
                      <div className={styles.mobileCardHeader}>
                        <span className={styles.mobileCardMerchant}>
                          {tx.merchant_name || tx.merchant_raw || 'Unknown'}
                        </span>
                        <span
                          className={styles.mobileCardAmount}
                          style={{ color: isNegative ? 'var(--color-destructive)' : 'var(--color-success)' }}
                        >
                          {isNegative ? '−' : '+'}{fmtCurrency(Math.abs(tx.amount))}
                        </span>
                      </div>
                      <div className={styles.mobileCardMeta}>
                        <span className={styles.mobileCardDate}>{formatDate(tx.date)}</span>
                        <Badge variant={statusCfg.variant} size="sm">{statusCfg.label}</Badge>
                        <Badge variant={getConfidenceVariant(conf)} size="sm">{conf}%</Badge>
                      </div>
                      {isExpanded && (
                        <div className={styles.mobileCardExpanded}>
                          <div className={styles.expandedSection}>
                            <div className={styles.expandedLabel}>🤖 AI Reasoning</div>
                            <p className={styles.expandedText}>
                              {tx.ai_reasoning || 'No AI analysis available.'}
                            </p>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* ── Pagination ──────────────────────────────────────────── */}
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Showing {showFrom}–{showTo} of {pagination.total.toLocaleString()}
                </span>
                <div className={styles.paginationControls}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </Button>
                  <span className={styles.pageIndicator}>
                    {page + 1} / {Math.max(1, totalPages)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* ── Split Transaction Dialog ──────────────────────────────── */}
          {splitDialogTxId && splitTx && (
            <div
              className={styles.dialogOverlay}
              onClick={() => setSplitDialogTxId(null)}
              role="dialog"
              aria-modal="true"
              aria-label="Split transaction"
            >
              <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
                <div className={styles.dialogHeader}>
                  <h2 className={styles.dialogTitle}>
                    Split Transaction
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setSplitDialogTxId(null)} aria-label="Close split dialog">
                    ✕
                  </Button>
                </div>
                <div className={styles.dialogBody}>
                  <div className={styles.splitOriginalAmount}>
                    Original amount: <strong>{fmtCurrency(Math.abs(splitTx.amount))}</strong>
                    {' '}({splitTx.merchant_name || splitTx.merchant_raw || 'Unknown'})
                  </div>

                  {splitRows.map((row, idx) => (
                    <div key={idx} className={styles.splitRow}>
                      <select
                        className={styles.splitSelect}
                        value={row.glCode}
                        onChange={(e) => updateSplitRow(idx, 'glCode', e.target.value)}
                        aria-label={`GL account for split row ${idx + 1}`}
                      >
                        <option value="">— GL Account —</option>
                        {glAccounts.map(acct => (
                          <option key={acct.gl_code} value={acct.gl_code}>
                            {acct.gl_code} — {acct.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        className={styles.splitInput}
                        value={row.amount || ''}
                        onChange={(e) => updateSplitRow(idx, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        aria-label={`Amount for split row ${idx + 1}`}
                      />
                      <input
                        type="text"
                        className={styles.splitDescInput}
                        value={row.description}
                        onChange={(e) => updateSplitRow(idx, 'description', e.target.value)}
                        placeholder="Description"
                        aria-label={`Description for split row ${idx + 1}`}
                      />
                      <button
                        className={styles.splitRemoveBtn}
                        onClick={() => removeSplitRow(idx)}
                        disabled={splitRows.length <= 2}
                        aria-label={`Remove split row ${idx + 1}`}
                        type="button"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <Button variant="ghost" size="sm" onClick={addSplitRow} aria-label="Add another split row">
                    + Add Split Row
                  </Button>

                  <div className={styles.splitSummary}>
                    <span>Allocated: <strong>{fmtCurrency(splitTotal)}</strong></span>
                    <span className={`${styles.splitRemaining} ${isSplitBalanced ? styles.splitBalanced : styles.splitUnbalanced}`}>
                      Remaining: {fmtCurrency(Math.abs(splitRemaining))}
                      {isSplitBalanced ? ' ✓' : ''}
                    </span>
                  </div>
                </div>
                <div className={styles.dialogFooter}>
                  <span className={styles.splitOriginalAmount}>
                    {splitRows.length} splits
                  </span>
                  <div className={styles.dialogFooterActions}>
                    <Button variant="ghost" size="sm" onClick={() => setSplitDialogTxId(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!isSplitBalanced || splitRows.some(r => !r.glCode) || splitLoading}
                      isLoading={splitLoading}
                      onClick={handleSplitSubmit}
                    >
                      Split Transaction
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
