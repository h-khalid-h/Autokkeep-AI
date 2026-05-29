'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { Transaction } from '@/data/mockTransactions';
import GlobalDashboardHeader from '@/components/dashboard/GlobalDashboardHeader';
import ExceptionQueueList from '@/components/dashboard/ExceptionQueueList';
import ContextInsightCard from '@/components/dashboard/ContextInsightCard';
import ActionsConsole from '@/components/dashboard/ActionsConsole';
import KeyboardShortcuts from '@/components/dashboard/KeyboardShortcuts';

// ─── Helpers: map API response → Transaction interface ──────────────────────

function getTransactionIcon(merchant: string): string {
  const m = (merchant || '').toLowerCase();
  if (m.includes('coffee') || m.includes('cafe') || m.includes('starbucks')) return '☕';
  if (m.includes('airline') || m.includes('delta') || m.includes('united') || m.includes('american air')) return '✈️';
  if (m.includes('uber') || m.includes('lyft')) return '🚗';
  if (m.includes('amazon') || m.includes('amzn')) return '📦';
  if (m.includes('stripe')) return '💳';
  if (m.includes('wework') || m.includes('office')) return '🏢';
  if (m.includes('figma') || m.includes('adobe') || m.includes('canva')) return '🎨';
  if (m.includes('aws') || m.includes('google cloud') || m.includes('azure')) return '☁️';
  return '🛒';
}

function buildTags(tx: any): string[] {
  const tags: string[] = [];
  if (tx.confidence < 50) tags.push('Low Confidence');
  if (Math.abs(tx.amount) > 1000) tags.push('High Amount');
  if (!tx.merchant_name || tx.merchant_name.match(/^[A-Z0-9\-\*]+$/)) tags.push('Unknown Vendor');
  return tags;
}

const mapTransaction = (tx: any): Transaction => ({
  id: tx.id,
  merchant: tx.merchant_name || tx.merchant_raw || 'Unknown',
  merchantRaw: tx.merchant_raw || '',
  amount: Math.abs(tx.amount),
  date: tx.date,
  category: tx.category_human || tx.category_ai || '',
  glCode: tx.category_human || tx.category_ai || '',
  glName: '',
  confidence: tx.confidence || 0,
  status: tx.status === 'human_review' ? 'pending_human' : tx.status === 'auto_categorized' ? 'verified_ai' : 'pending_human',
  icon: getTransactionIcon(tx.merchant_name),
  tags: tx.tags && tx.tags.length > 0 ? tx.tags : buildTags(tx),
  aiReasoning: tx.ai_reasoning || 'No AI analysis available for this transaction.',
  suggestedGLCode: tx.category_ai || '6510',
  suggestedGLName: '',
  cardHolder: tx.card_holder || '',
  cardLast4: tx.card_last4 || '',
  agingDays: tx.aging_days ?? Math.floor((Date.now() - new Date(tx.date).getTime()) / 86400000),
  rawData: {
    bankDescription: tx.raw_bank_description || tx.merchant_raw || '',
    mcc: tx.mcc_code || '',
    currency: tx.currency || 'USD',
  },
  documentStatus: tx.document_status || 'missing',
});

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { selectedEntity } = useEntity();
  const [transactions, setTransactions] = React.useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] =
    React.useState<Transaction | null>(null);
  const [exitingId, setExitingId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reasoningExpanded, setReasoningExpanded] = React.useState(false);
  const [chartOfAccounts, setChartOfAccounts] = React.useState<{ code: string; name: string }[]>([]);

  // Fetch transactions from API on mount
  React.useEffect(() => {
    if (!selectedEntity?.id) return;
    let cancelled = false;

    async function fetchTransactions() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/transactions?status=human_review,pending&entityId=${selectedEntity!.id}`);

        if (!res.ok) {
          throw new Error(`Failed to fetch transactions (${res.status})`);
        }

        const data = await res.json();
        const mapped = (data.transactions || []).map(mapTransaction);

        if (cancelled) return;

        setTransactions(mapped);
        setSelectedTransaction(mapped[0] ?? null);
      } catch (err) {
        if (cancelled) return;
        console.error('[Dashboard] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load transactions');
        setTransactions([]);
        setSelectedTransaction(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchTransactions();
    return () => { cancelled = true; };
  }, [selectedEntity?.id]);

  // Fetch chart of accounts
  React.useEffect(() => {
    if (!selectedEntity?.id) return;
    let cancelled = false;

    async function fetchChartOfAccounts() {
      try {
        const res = await fetch(`/api/chart-of-accounts?entityId=${selectedEntity!.id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setChartOfAccounts(data.accounts || data || []);
        }
      } catch (err) {
        console.error('[Dashboard] Chart of accounts fetch error:', err);
      }
    }

    fetchChartOfAccounts();
    return () => { cancelled = true; };
  }, [selectedEntity?.id]);

  const handleSelectTransaction = React.useCallback(
    (transaction: Transaction) => {
      setSelectedTransaction(transaction);
    },
    []
  );

  const handleAccept = React.useCallback(
    async (transaction: Transaction) => {
      try {
        // Call API first and wait for response
        const res = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'approved',
            glCode: transaction.suggestedGLCode,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed to approve transaction (${res.status})`);
          return;
        }

        // API succeeded — start exit animation
        setExitingId(transaction.id);

        // After animation, remove and select next
        setTimeout(() => {
          setTransactions((prev) => {
            const idx = prev.findIndex((tx) => tx.id === transaction.id);
            const next = prev.filter((tx) => tx.id !== transaction.id);

            // Auto-select next transaction
            if (next.length > 0) {
              const nextIdx = Math.min(idx, next.length - 1);
              setSelectedTransaction(next[nextIdx]);
            } else {
              setSelectedTransaction(null);
            }

            return next;
          });
          setExitingId(null);
        }, 300);
      } catch (err) {
        console.error('[Dashboard] Approve error:', err);
        setError('Network error — could not approve transaction');
      }
    },
    []
  );

  const handleChangeCategory = React.useCallback(
    async (transaction: Transaction, glCode: string, glName: string) => {
      try {
        // Call API first and wait for response
        const res = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'approved',
            glCode,
            glName,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || `Failed to update category (${res.status})`);
          return;
        }

        // API succeeded — update and animate
        const updatedTransaction = {
          ...transaction,
          suggestedGLCode: glCode,
          suggestedGLName: glName,
        };

        // Start exit animation
        setExitingId(transaction.id);

        setTimeout(() => {
          setTransactions((prev) => {
            const idx = prev.findIndex((tx) => tx.id === updatedTransaction.id);
            const next = prev.filter((tx) => tx.id !== updatedTransaction.id);

            if (next.length > 0) {
              const nextIdx = Math.min(idx, next.length - 1);
              setSelectedTransaction(next[nextIdx]);
            } else {
              setSelectedTransaction(null);
            }

            return next;
          });
          setExitingId(null);
        }, 300);
      } catch (err) {
        console.error('[Dashboard] Category change error:', err);
        setError('Network error — could not update transaction category');
      }
    },
    []
  );

  // ─── Keyboard shortcut handler ─────────────────────────────────────────────
  React.useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent).detail?.action;
      switch (action) {
        case 'accept':
          if (selectedTransaction) handleAccept(selectedTransaction);
          break;
        case 'navigate-up':
          setTransactions((prev) => {
            const idx = prev.findIndex((tx) => tx.id === selectedTransaction?.id);
            if (idx > 0) setSelectedTransaction(prev[idx - 1]);
            return prev;
          });
          break;
        case 'navigate-down':
          setTransactions((prev) => {
            const idx = prev.findIndex((tx) => tx.id === selectedTransaction?.id);
            if (idx < prev.length - 1) setSelectedTransaction(prev[idx + 1]);
            return prev;
          });
          break;
        case 'toggle-reasoning':
          setReasoningExpanded((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('autokkeep-shortcut', handler);
    return () => window.removeEventListener('autokkeep-shortcut', handler);
  }, [selectedTransaction, handleAccept]);

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="dashboard-layout">
        <GlobalDashboardHeader />
        <div className="dashboard-main">
          <div
            className="flex-center"
            style={{
              width: '100%',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              padding: 'var(--space-10)',
            }}
          >
            <div
              className="loading-spinner"
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--surface-3)',
                borderTopColor: 'var(--brand)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p className="text-caption">Loading transactions…</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty state (all caught up!) ───────────────────────────────────────────
  if (transactions.length === 0 && !error) {
    return (
      <div className="dashboard-layout">
        <GlobalDashboardHeader />
        <div className="dashboard-main">
          <div
            className="flex-center"
            style={{
              width: '100%',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              padding: 'var(--space-10)',
            }}
          >
            <span style={{ fontSize: '48px' }}>✅</span>
            <h2>All caught up!</h2>
            <p className="text-caption">
              No transactions need review right now. Check back later.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <GlobalDashboardHeader />

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'var(--danger-dim, #2a1215)',
            color: 'var(--danger, #ff6b6b)',
            padding: 'var(--space-3) var(--space-5)',
            fontSize: '13px',
            textAlign: 'center',
            borderBottom: '1px solid var(--danger, #ff6b6b)',
          }}
        >
          ⚠️ Could not load transactions. Please try refreshing. ({error})
        </div>
      )}

      <div className="dashboard-main">
        {/* Left Sidebar: Exception Queue */}
        <ExceptionQueueList
          transactions={transactions}
          selectedTransaction={selectedTransaction}
          onSelectTransaction={handleSelectTransaction}
          exitingId={exitingId}
        />

        {/* Center + Bottom: Content */}
        <main className="dashboard-content" aria-label="Transaction review area">
          {/* Center: Context Insight */}
          <ContextInsightCard transaction={selectedTransaction} />

          {/* Bottom: Actions Console */}
          <ActionsConsole
            transaction={selectedTransaction}
            onAccept={handleAccept}
            onChangeCategory={handleChangeCategory}
            chartOfAccounts={chartOfAccounts}
          />
        </main>
      </div>

      <KeyboardShortcuts />
    </div>
  );
}
