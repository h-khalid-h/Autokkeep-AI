'use client';

import React from 'react';
import { Transaction } from '@/data/mockTransactions';

interface TransactionCardProps {
  transaction: Transaction;
  isActive: boolean;
  onClick: (transaction: Transaction) => void;
  isExiting?: boolean;
}

const TransactionCard: React.FC<TransactionCardProps> = React.memo(
  ({ transaction, isActive, onClick, isExiting = false }) => {
    const handleClick = React.useCallback(() => {
      onClick(transaction);
    }, [onClick, transaction]);

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(transaction);
        }
      },
      [onClick, transaction]
    );

    const confidenceBadgeClass = React.useMemo(() => {
      if (transaction.confidence < 75) return 'badge badge-destructive';
      if (transaction.confidence < 95) return 'badge badge-warning';
      return 'badge badge-success';
    }, [transaction.confidence]);

    const formattedAmount = React.useMemo(() => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(transaction.amount);
    }, [transaction.amount]);

    return (
      <article
        className={`tx-card${isActive ? ' active' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Transaction ${transaction.merchant}, ${formattedAmount}, confidence ${transaction.confidence}%`}
        aria-selected={isActive}
        style={
          isExiting
            ? {
                animation: 'slide-out-left 0.3s var(--ease-out) forwards',
              }
            : undefined
        }
      >
        <div className="tx-card-header">
          <span className="tx-card-merchant">
            <span aria-hidden="true">{transaction.icon}</span>
            {transaction.merchant}
          </span>
          <span className="tx-card-amount">{formattedAmount}</span>
        </div>
        <div className="tx-card-meta">
          <span className={confidenceBadgeClass}>
            {transaction.confidence}%
          </span>
          {transaction.tags.map((tag) => (
            <span key={tag} className="pill">
              {tag}
            </span>
          ))}
          <span className="pill">{transaction.agingDays}d</span>
        </div>
      </article>
    );
  }
);

TransactionCard.displayName = 'TransactionCard';

export default TransactionCard;
