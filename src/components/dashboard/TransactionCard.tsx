'use client';

import React from 'react';
import { Transaction } from '@/lib/types/transaction';

interface TransactionCardProps {
  transaction: Transaction;
  isActive: boolean;
  onClick: (transaction: Transaction) => void;
  isExiting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const TransactionCard: React.FC<TransactionCardProps> = React.memo(
  ({ transaction, isActive, onClick, isExiting = false, isSelected = false, onToggleSelect }) => {
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

    const handleCheckboxClick = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleSelect?.(transaction.id);
      },
      [onToggleSelect, transaction.id]
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
        className={`tx-card${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Transaction ${transaction.merchant}, ${formattedAmount}, confidence ${transaction.confidence}%`}
        aria-selected={isActive}
        style={
          isExiting
            ? { animation: 'slide-out-left 0.3s var(--ease-out) forwards' }
            : {}
        }
      >
        <div className="tx-card-header">
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onClick={handleCheckboxClick}
              onChange={() => {}} // controlled by onClick
              aria-label={`Select ${transaction.merchant}`}
              style={{
                marginRight: '8px',
                cursor: 'pointer',
                accentColor: 'var(--accent-primary, var(--brand, #1E6FFF))',
                flexShrink: 0,
              }}
            />
          )}
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
