'use client';

import React from 'react';
import { Transaction } from '@/lib/types/transaction';
import { Badge } from '@/components/ui';
import { useEntity } from '@/lib/context/EntityContext';
import { getTaxRules } from '@/lib/tax/rules';
import { getCountryFlag } from '@/lib/country';
import styles from './TransactionCard.module.css';

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
    const { selectedEntity } = useEntity();
    const activeCountry = selectedEntity?.country || 'US';
    const taxRules = getTaxRules(activeCountry);
    const flag = getCountryFlag(activeCountry);

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

    const confidenceVariant = React.useMemo(() => {
      if (transaction.confidence < 75) return 'destructive';
      if (transaction.confidence < 95) return 'warning';
      return 'success';
    }, [transaction.confidence]);

    const formattedAmount = React.useMemo(() => {
      const txCurrency = transaction.rawData?.currency || selectedEntity?.currency || 'USD';
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: txCurrency,
      }).format(transaction.amount);
    }, [transaction.amount, transaction.rawData?.currency, selectedEntity?.currency]);

    const isReceiptRequired = transaction.amount >= taxRules.receiptThreshold;
    const isDocMissing = transaction.documentStatus === 'missing' || transaction.documentStatus === 'partial';

    return (
      <article
        className={`${styles.card} ${isActive ? styles.active : ''} ${isSelected ? styles.selected : ''} ${isExiting ? 'exit-animation' : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`Transaction ${transaction.merchant}, ${formattedAmount}, confidence ${transaction.confidence}%`}
        data-active={isActive}
      >
        <div className={styles.header}>
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onClick={handleCheckboxClick}
              onChange={() => {}} // controlled by onClick
              aria-label={`Select ${transaction.merchant}`}
              className={styles.checkbox}
            />
          )}
          <span className={styles.merchant}>
            <span className={styles.merchantIcon} aria-hidden="true">{transaction.icon}</span>
            {transaction.merchant}
          </span>
          <span className={styles.amount}>{formattedAmount}</span>
        </div>
        <div className={styles.meta}>
          <Badge variant={confidenceVariant} size="sm">
            {transaction.confidence}%
          </Badge>
          
          {/* Dynamic Compliance Pill */}
          <span className={`${styles.compliancePill} ${
            !isDocMissing ? styles.pillSuccess :
            isReceiptRequired ? styles.pillWarning : styles.pillInfo
          }`} title={`${taxRules.authority} compliance status`}>
            <span className={styles.flagIcon}>{flag}</span>
            <span className={styles.authorityName}>{taxRules.authority}</span>
            <span>{!isDocMissing ? '✅' : isReceiptRequired ? '⚠️' : 'ℹ️'}</span>
          </span>

          {transaction.tags.map((tag) => (
            <span key={tag} className={styles.pill}>
              {tag}
            </span>
          ))}
          <span className={styles.pill}>{transaction.agingDays}d</span>
        </div>
      </article>
    );
  }
);

TransactionCard.displayName = 'TransactionCard';

export default TransactionCard;
