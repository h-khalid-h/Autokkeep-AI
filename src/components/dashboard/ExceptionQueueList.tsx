'use client';

import React from 'react';
import { Transaction } from '@/lib/types/transaction';
import TransactionCard from './TransactionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import styles from './ExceptionQueueList.module.css';

type FilterType = 'all' | 'critical' | 'review' | 'missing';

interface ExceptionQueueListProps {
  transactions: Transaction[];
  selectedTransaction: Transaction | null;
  onSelectTransaction: (transaction: Transaction) => void;
  exitingId: string | null;
  // Batch operations
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (ids: string[]) => void;
  onClearSelection: () => void;
  onBatchAction: (action: 'approve' | 'reject') => void;
  batchLoading: boolean;
}

const filterLabels: Record<FilterType, string> = {
  all: 'All',
  critical: 'Critical (<75%)',
  review: 'Review (75-94%)',
  missing: 'Missing Receipt',
};

const ExceptionQueueList: React.FC<ExceptionQueueListProps> = ({
  transactions,
  selectedTransaction,
  onSelectTransaction,
  exitingId,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onBatchAction,
  batchLoading,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState<FilterType>('all');

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    []
  );

  const handleFilterClick = React.useCallback((filter: FilterType) => {
    setActiveFilter(filter);
  }, []);

  const filteredTransactions = React.useMemo(() => {
    let filtered = transactions;

    // Apply text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (tx) =>
          tx.merchant.toLowerCase().includes(query) ||
          tx.merchantRaw.toLowerCase().includes(query) ||
          tx.cardHolder.toLowerCase().includes(query) ||
          tx.id.toLowerCase().includes(query)
      );
    }

    // Apply filter
    switch (activeFilter) {
      case 'critical':
        filtered = filtered.filter((tx) => tx.confidence < 75);
        break;
      case 'review':
        filtered = filtered.filter(
          (tx) => tx.confidence >= 75 && tx.confidence <= 94
        );
        break;
      case 'missing':
        filtered = filtered.filter((tx) =>
          tx.tags.some((tag) => tag.toLowerCase().includes('missing'))
        );
        break;
    }

    return filtered;
  }, [transactions, searchQuery, activeFilter]);

  const allFilteredSelected = React.useMemo(() => {
    return (
      filteredTransactions.length > 0 &&
      filteredTransactions.every((tx) => selectedIds.has(tx.id))
    );
  }, [filteredTransactions, selectedIds]);

  const handleSelectAllToggle = React.useCallback(() => {
    if (allFilteredSelected) {
      onClearSelection();
    } else {
      onSelectAll(filteredTransactions.map((tx) => tx.id));
    }
  }, [allFilteredSelected, onClearSelection, onSelectAll, filteredTransactions]);

  return (
    <aside className="dashboard-sidebar" aria-label="Exception queue">
      {/* Search */}
      <div className="dashboard-sidebar-header">
        <div className={styles.searchRow}>
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={handleSelectAllToggle}
            aria-label="Select all transactions"
            title="Select all"
            className={styles.selectAllCheckbox}
          />
          <Input
            type="search"
            placeholder="🔍 Search transactions..."
            value={searchQuery}
            onChange={handleSearchChange}
            aria-label="Search exception queue"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div
        className="dashboard-sidebar-filters"
        role="tablist"
        aria-label="Filter transactions"
      >
        {(Object.keys(filterLabels) as FilterType[]).map((filter) => (
          <Button
            key={filter}
            variant={activeFilter === filter ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => handleFilterClick(filter)}
            role="tab"
            aria-selected={activeFilter === filter}
            aria-label={`Filter: ${filterLabels[filter]}`}
          >
            {filterLabels[filter]}
          </Button>
        ))}
      </div>

      {/* Count badge */}
      <div className="flex-between" aria-live="polite">
        <span
          className={`text-caption ${styles.countBadge}`}
        >
          <span className="badge badge-accent">
            {filteredTransactions.length}
          </span>{' '}
          exceptions
        </span>
      </div>

      {/* Transaction list */}
      <div
        className="dashboard-sidebar-list"
        role="listbox"
        aria-label="Transaction queue"
      >
        {filteredTransactions.length === 0 ? (
          <div className="flex-center" aria-live="polite">
            <p className="text-caption">No transactions match your filters.</p>
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <TransactionCard
              key={tx.id}
              transaction={tx}
              isActive={selectedTransaction?.id === tx.id}
              onClick={onSelectTransaction}
              isExiting={exitingId === tx.id}
              isSelected={selectedIds.has(tx.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>

      {/* Floating batch action bar */}
      {selectedIds.size > 0 && (
        <div
          className={styles.batchBar}
          role="toolbar"
          aria-label="Batch actions"
        >
          <span
            className={`text-caption ${styles.batchCount}`}
          >
            {selectedIds.size} selected
          </span>
          <div className={styles.batchActions}>
            <Button
              variant="primary"
              size="sm"
              onClick={() => onBatchAction('approve')}
              disabled={batchLoading}
              isLoading={batchLoading}
              aria-label={`Approve ${selectedIds.size} transactions`}
            >
              ✓ Approve All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onBatchAction('reject')}
              disabled={batchLoading}
              isLoading={batchLoading}
              aria-label={`Reject ${selectedIds.size} transactions`}
              className={styles.rejectBtn}
            >
              ✕ Reject All
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
};

export default ExceptionQueueList;
