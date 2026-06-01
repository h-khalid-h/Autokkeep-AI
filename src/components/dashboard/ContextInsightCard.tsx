'use client';

import React from 'react';
import { Transaction } from '@/lib/types/transaction';

interface ContextInsightCardProps {
  transaction: Transaction | null;
}

const ContextInsightCard: React.FC<ContextInsightCardProps> = ({
  transaction,
}) => {
  const formattedAmount = transaction
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(transaction.amount)
    : '';

  const documentStatusBadge = React.useMemo(() => {
    if (!transaction) return 'badge';
    switch (transaction.documentStatus) {
      case 'found':
        return 'badge badge-success';
      case 'missing':
        return 'badge badge-destructive';
      case 'partial':
        return 'badge badge-warning';
      default:
        return 'badge';
    }
  }, [transaction]);

  const documentStatusIcon = React.useMemo(() => {
    if (!transaction) return '📄';
    switch (transaction.documentStatus) {
      case 'found':
        return '✅';
      case 'missing':
        return '❌';
      case 'partial':
        return '⚠️';
      default:
        return '📄';
    }
  }, [transaction]);

  if (!transaction) {
    return (
      <div className="insight-card">
        <div className="insight-header">
          <h2 className="insight-title">
            <span aria-hidden="true">📊</span> Transaction Deep-Dive
          </h2>
        </div>
        <div className="flex-center">
          <p className="text-body" aria-live="polite">
            Select a transaction from the queue to view details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Transaction context insight">
      <div className="insight-card">
        {/* Header */}
        <div className="insight-header">
          <h2 className="insight-title">
            <span aria-hidden="true">📊</span> Transaction Deep-Dive
          </h2>
          <span className="badge badge-accent text-mono">{transaction.id}</span>
        </div>

        {/* Split view */}
        <div className="insight-body">
          {/* Left: Raw Transaction Stream */}
          <div className="insight-data">
            <h3 className="text-caption" aria-hidden="true">
              RAW TRANSACTION STREAM
            </h3>
            <div role="table" aria-label="Transaction data">
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Date
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.date}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Amount
                </span>
                <span className="insight-row-value" role="cell" style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formattedAmount}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Merchant
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.merchantRaw}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Card
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.cardHolder} <span style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', color: 'var(--text-tertiary)' }}>····</span>{transaction.cardLast4}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  MCC Code
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.rawData.mcc}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Bank Desc.
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.rawData.bankDescription}
                </span>
              </div>
              <div className="insight-row" role="row">
                <span className="insight-row-label" role="cell">
                  Currency
                </span>
                <span className="insight-row-value" role="cell">
                  {transaction.rawData.currency}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Associated Documents */}
          <div className="insight-document">
            <h3 className="text-caption" aria-hidden="true">
              ASSOCIATED DOCUMENTS
            </h3>
            <div className="card-accent">
              <div className="flex-between">
                <span className="text-h4">
                  <span aria-hidden="true">{documentStatusIcon}</span> Document
                  Status
                </span>
                <span className={documentStatusBadge}>
                  {transaction.documentStatus.toUpperCase()}
                </span>
              </div>
              {transaction.documentNote && (
                <p className="text-body">{transaction.documentNote}</p>
              )}
            </div>

            {/* Confidence breakdown */}
            <div className="card" role="group" aria-label="Confidence score">
              <div className="flex-between">
                <span className="text-caption">AI Confidence</span>
                <span
                  className={`badge ${
                    transaction.confidence < 75
                      ? 'badge-destructive'
                      : transaction.confidence < 95
                      ? 'badge-warning'
                      : 'badge-success'
                  }`}
                >
                  {transaction.confidence}%
                </span>
              </div>
              <div
                className="skeleton"
                role="progressbar"
                aria-valuenow={transaction.confidence}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Confidence: ${transaction.confidence}%`}
                style={{
                  height: '4px',
                  marginTop: 'var(--space-3)',
                  background: `linear-gradient(90deg, ${
                    transaction.confidence < 75
                      ? 'var(--destructive)'
                      : transaction.confidence < 95
                      ? 'var(--warning)'
                      : 'var(--success)'
                  } ${transaction.confidence}%, var(--bg-elevated) ${transaction.confidence}%)`,
                  animation: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* AI Engine Explainer */}
        <div className="ai-explainer">
          <div className="ai-explainer-header">
            <span aria-hidden="true">🤖</span> AI Engine Explainer Layer
          </div>
          <p className="ai-explainer-text">{transaction.aiReasoning}</p>
        </div>
      </div>
    </section>
  );
};

export default ContextInsightCard;
