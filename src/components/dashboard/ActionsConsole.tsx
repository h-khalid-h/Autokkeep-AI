'use client';

import React from 'react';
import { Transaction } from '@/data/mockTransactions';
import Logo from '@/components/ui/Logo';

interface ActionsConsoleProps {
  transaction: Transaction | null;
  onAccept: (transaction: Transaction) => void;
  onChangeCategory: (
    transaction: Transaction,
    glCode: string,
    glName: string
  ) => void;
  chartOfAccounts?: { code: string; name: string }[];
}

const ActionsConsole: React.FC<ActionsConsoleProps> = ({
  transaction,
  onAccept,
  onChangeCategory,
  chartOfAccounts = [],
}) => {
  const [showCategorySearch, setShowCategorySearch] = React.useState(false);
  const [categoryQuery, setCategoryQuery] = React.useState('');
  const [showSlackModal, setShowSlackModal] = React.useState(false);
  const [showToast, setShowToast] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState('');
  const [slackSent, setSlackSent] = React.useState(false);
  const categoryInputRef = React.useRef<HTMLInputElement>(null);

  const triggerToast = React.useCallback((message: string) => {
    setShowToast(true);
    setToastMessage(message);
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  const handleAccept = React.useCallback(() => {
    if (!transaction) return;
    onAccept(transaction);
    triggerToast(
      `✅ Accepted: ${transaction.merchant} → GL ${transaction.suggestedGLCode}`
    );
    setShowCategorySearch(false);
    setShowSlackModal(false);
  }, [transaction, onAccept, triggerToast]);

  // Keyboard shortcut: CMD+Enter to accept
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && transaction) {
        e.preventDefault();
        handleAccept();
      }
      if (e.key === 'Escape') {
        setShowCategorySearch(false);
        setShowSlackModal(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [transaction, handleAccept]);

  const handleChangeCategoryClick = React.useCallback(() => {
    setShowCategorySearch((prev) => !prev);
    setShowSlackModal(false);
    setCategoryQuery('');
    setTimeout(() => categoryInputRef.current?.focus(), 100);
  }, []);

  const handleCategorySelect = React.useCallback(
    (code: string, name: string) => {
      if (!transaction) return;
      onChangeCategory(transaction, code, name);
      setShowCategorySearch(false);
      setCategoryQuery('');
      triggerToast(`📝 Recategorized: ${transaction.merchant} → GL ${code} ${name}`);
    },
    [transaction, onChangeCategory, triggerToast]
  );

  const handlePingSlack = React.useCallback(() => {
    setShowSlackModal((prev) => !prev);
    setShowCategorySearch(false);
    setSlackSent(false);
  }, []);

  const handleSendSlack = React.useCallback(async () => {
    if (!transaction) return;
    try {
      const res = await fetch('/api/channels/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'slack',
          transactionId: transaction.id,
          message: `Receipt request for ${transaction.merchant} ($${transaction.amount.toFixed(2)})`,
        }),
      });
      if (res.ok) {
        setSlackSent(true);
        triggerToast(`💬 Slack message sent for ${transaction.merchant}`);
      } else {
        triggerToast('❌ Failed to send Slack message');
      }
    } catch {
      triggerToast('❌ Failed to send Slack message');
    }
    setTimeout(() => setShowSlackModal(false), 1500);
  }, [transaction, triggerToast]);

  const filteredAccounts = React.useMemo(() => {
    if (!categoryQuery.trim()) return chartOfAccounts;
    const q = categoryQuery.toLowerCase();
    return chartOfAccounts.filter(
      (acc) =>
        acc.code.includes(q) || acc.name.toLowerCase().includes(q)
    );
  }, [categoryQuery, chartOfAccounts]);

  if (!transaction) {
    return (
      <div className="actions-console">
        <p className="text-caption">
          Select a transaction to see available actions.
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="actions-console" aria-label="Actions console">
        {/* Suggested GL Mapping */}
        <div className="actions-suggestion">
          <span className="actions-suggestion-label">Suggested GL Mapping:</span>
          <span className="actions-suggestion-value">
            {transaction.suggestedGLCode} — {transaction.suggestedGLName}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="actions-buttons">
          <button
            className="action-btn action-btn-accept"
            onClick={handleAccept}
            aria-label="Accept AI Proposal, keyboard shortcut Command Enter"
          >
            ✅ Accept AI Proposal
            <span className="action-shortcut">⌘↵</span>
          </button>
          <button
            className="action-btn action-btn-change"
            onClick={handleChangeCategoryClick}
            aria-expanded={showCategorySearch}
            aria-label="Change Category"
          >
            ✏️ Change Category
          </button>
          <button
            className="action-btn action-btn-ping"
            onClick={handlePingSlack}
            aria-expanded={showSlackModal}
            aria-label="Ping via Slack"
          >
            💬 Ping via Slack
          </button>
        </div>

        {/* Category Search Combobox */}
        {showCategorySearch && (
          <div className="category-search" role="combobox" aria-label="Search chart of accounts">
            <input
              ref={categoryInputRef}
              type="text"
              className="category-search-input"
              placeholder="Search chart of accounts..."
              value={categoryQuery}
              onChange={(e) => setCategoryQuery(e.target.value)}
              aria-label="Search GL codes"
              autoFocus
            />
            <ul
              className="category-search-dropdown"
              role="listbox"
              aria-label="Chart of accounts options"
            >
              {filteredAccounts.length === 0 ? (
                <li className="category-option" role="option" aria-selected={false}>
                  <span className="text-caption">No accounts match.</span>
                </li>
              ) : (
                filteredAccounts.map((acc) => (
                  <li
                    key={acc.code}
                    className="category-option"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleCategorySelect(acc.code, acc.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        handleCategorySelect(acc.code, acc.name);
                    }}
                    tabIndex={0}
                  >
                    <span className="category-option-code">{acc.code}</span>
                    {acc.name}
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {/* Slack Preview Modal */}
        {showSlackModal && (
          <div className="slack-mockup" role="dialog" aria-label="Slack message preview">
            <div className="slack-header">
              <Logo size={36} />
              <span className="slack-name">Autokkeep Bot</span>
              <span className="slack-badge-bot">BOT</span>
            </div>
            <div className="slack-body">
              <p className="slack-message">
                👋 Hey <strong>{transaction.cardHolder}</strong>, we need your
                help! A transaction requires your input:
              </p>
              <div className="card-accent">
                <div className="insight-row">
                  <span className="insight-row-label">Merchant</span>
                  <span className="insight-row-value">
                    {transaction.merchant}
                  </span>
                </div>
                <div className="insight-row">
                  <span className="insight-row-label">Amount</span>
                  <span className="insight-row-value">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    }).format(transaction.amount)}
                  </span>
                </div>
                <div className="insight-row">
                  <span className="insight-row-label">Card</span>
                  <span className="insight-row-value">
                    ····{transaction.cardLast4}
                  </span>
                </div>
              </div>
              <p className="slack-message">
                Please upload the receipt or confirm the category for this
                expense.
              </p>
              <div className="slack-options">
                <button
                  className={`slack-option ${slackSent ? 'selected' : ''}`}
                  onClick={handleSendSlack}
                  aria-label="Send Slack message"
                >
                  <span className="slack-option-radio" aria-hidden="true" />
                  {slackSent ? '✅ Message Sent!' : '📨 Send this message'}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Toast Notification */}
      {showToast && (
        <div
          className="toast toast-success"
          role="status"
          aria-live="polite"
        >
          <span className="toast-icon" aria-hidden="true">
            ✓
          </span>
          {toastMessage}
        </div>
      )}
    </>
  );
};

export default ActionsConsole;
