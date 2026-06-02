'use client';

import React from 'react';
import { Transaction } from '@/lib/types/transaction';
import ContextInsightCard from '@/components/dashboard/ContextInsightCard';
import ActionsConsole from '@/components/dashboard/ActionsConsole';
import styles from './TransactionDetailPanel.module.css';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TransactionDetailPanelProps {
  transaction: Transaction | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onChangeCategory: (id: string, newCategory: string) => void;
  chartOfAccounts?: { code: string; name: string }[];
  loading?: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

const TransactionDetailPanel: React.FC<TransactionDetailPanelProps> = ({
  transaction,
  onApprove,
  onReject: _onReject,
  onChangeCategory,
  chartOfAccounts = [],
  loading,
}) => {
  // Adapt ID-based callbacks to Transaction-based callbacks expected by
  // the underlying ActionsConsole component.
  const handleAccept = React.useCallback(
    (tx: Transaction) => {
      onApprove(tx.id);
    },
    [onApprove]
  );

  const handleChangeCategory = React.useCallback(
    (tx: Transaction, glCode: string, _glName: string) => {
      onChangeCategory(tx.id, glCode);
    },
    [onChangeCategory]
  );

  if (loading) {
    return (
      <main className="dashboard-content" aria-label="Transaction review area">
        <div className={`flex-center ${styles.loadingContainer}`}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Loading details…</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`dashboard-content ${styles.content}`}
      aria-label="Transaction review area"
    >
      {/* Center: Context Insight */}
      <ContextInsightCard transaction={transaction} />

      {/* Bottom: Actions Console */}
      <ActionsConsole
        transaction={transaction}
        onAccept={handleAccept}
        onChangeCategory={handleChangeCategory}
        chartOfAccounts={chartOfAccounts}
      />
    </main>
  );
};

export default TransactionDetailPanel;
