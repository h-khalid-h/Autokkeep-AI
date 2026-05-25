'use client';

import React from 'react';
import { Transaction, mockTransactions } from '@/data/mockTransactions';
import GlobalDashboardHeader from '@/components/dashboard/GlobalDashboardHeader';
import ExceptionQueueList from '@/components/dashboard/ExceptionQueueList';
import ContextInsightCard from '@/components/dashboard/ContextInsightCard';
import ActionsConsole from '@/components/dashboard/ActionsConsole';

export default function DashboardPage() {
  const [transactions, setTransactions] =
    React.useState<Transaction[]>(mockTransactions);
  const [selectedTransaction, setSelectedTransaction] =
    React.useState<Transaction | null>(mockTransactions[0] ?? null);
  const [exitingId, setExitingId] = React.useState<string | null>(null);

  const handleSelectTransaction = React.useCallback(
    (transaction: Transaction) => {
      setSelectedTransaction(transaction);
    },
    []
  );

  const handleAccept = React.useCallback(
    (transaction: Transaction) => {
      // Start exit animation
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
    },
    []
  );

  const handleChangeCategory = React.useCallback(
    (transaction: Transaction, glCode: string, glName: string) => {
      // Update the transaction with new GL code then accept it
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
    },
    []
  );

  return (
    <div className="dashboard-layout">
      <GlobalDashboardHeader />

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
          />
        </main>
      </div>
    </div>
  );
}
