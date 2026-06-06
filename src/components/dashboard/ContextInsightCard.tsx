'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Transaction } from '@/lib/types/transaction';
import styles from './ContextInsightCard.module.css';

interface ContextInsightCardProps {
  transaction: Transaction | null;
  currency?: string;
  onReceiptUploaded?: (transaction: Transaction) => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const ContextInsightCard: React.FC<ContextInsightCardProps> = ({
  transaction,
  currency = 'USD',
  onReceiptUploaded,
}) => {
  const txCurrency = transaction?.rawData?.currency || currency;
  const formattedAmount = transaction
    ? new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: txCurrency,
      }).format(transaction.amount)
    : '';

  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localDocStatus, setLocalDocStatus] = useState<'found' | 'missing' | 'partial' | null>(null);
  const [localDocUrl, setLocalDocUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset local state when transaction changes
  const currentTxId = transaction?.id;
  const prevTxIdRef = useRef<string | undefined>(undefined);
  if (currentTxId !== prevTxIdRef.current) {
    prevTxIdRef.current = currentTxId;
    if (uploadState !== 'idle') setUploadState('idle');
    if (uploadError !== null) setUploadError(null);
    if (localDocStatus !== null) setLocalDocStatus(null);
    if (localDocUrl !== null) setLocalDocUrl(null);
  }

  const effectiveDocStatus = localDocStatus ?? transaction?.documentStatus;
  const effectiveDocUrl = localDocUrl ?? transaction?.documentUrl;

  const documentStatusBadge = React.useMemo(() => {
    if (!effectiveDocStatus) return 'badge';
    switch (effectiveDocStatus) {
      case 'found':
        return 'badge badge-success';
      case 'missing':
        return 'badge badge-destructive';
      case 'partial':
        return 'badge badge-warning';
      default:
        return 'badge';
    }
  }, [effectiveDocStatus]);

  const documentStatusIcon = React.useMemo(() => {
    if (!effectiveDocStatus) return '📄';
    switch (effectiveDocStatus) {
      case 'found':
        return '✅';
      case 'missing':
        return '❌';
      case 'partial':
        return '⚠️';
      default:
        return '📄';
    }
  }, [effectiveDocStatus]);

  const handleUpload = useCallback(async (file: File) => {
    if (!transaction) return;

    setUploadState('uploading');
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch(`/api/transactions/${transaction.id}/receipt`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed (${response.status})`);
      }

      const result: { document_url?: string; document_status?: string } = await response.json();

      setLocalDocStatus('found');
      if (result.document_url) {
        setLocalDocUrl(result.document_url);
      }
      setUploadState('success');

      if (onReceiptUploaded) {
        onReceiptUploaded({
          ...transaction,
          documentStatus: 'found',
          documentUrl: result.document_url ?? transaction.documentUrl,
        });
      }
    } catch (err) {
      setUploadState('error');
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    }
  }, [transaction, onReceiptUploaded]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [handleUpload]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

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
                <span className={`insight-row-value ${styles.amountValue}`} role="cell">
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
                  {transaction.cardHolder} <span className={styles.cardMask}>····</span>{transaction.cardLast4}
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
                  {effectiveDocStatus?.toUpperCase() ?? 'UNKNOWN'}
                </span>
              </div>
              {transaction.documentNote && (
                <p className="text-body">{transaction.documentNote}</p>
              )}
            </div>

            {/* Receipt Upload / View Section */}
            <div className="card-accent" style={{ marginTop: 'var(--space-3)' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                aria-label="Upload receipt file"
              />

              {effectiveDocStatus === 'found' && effectiveDocUrl && (
                <a
                  href={effectiveDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.receiptLink}
                >
                  📄 View Receipt
                </a>
              )}

              {effectiveDocStatus === 'found' && !effectiveDocUrl && (
                <span className="text-body" style={{ color: 'var(--success)' }}>
                  ✅ Receipt attached
                </span>
              )}

              {(effectiveDocStatus === 'missing' || effectiveDocStatus === 'partial') && (
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={uploadState === 'uploading'}
                  className={styles.uploadButton}
                  aria-busy={uploadState === 'uploading'}
                >
                  {uploadState === 'uploading' ? (
                    <span className={styles.uploadSpinner}>⏳ Uploading…</span>
                  ) : (
                    '📎 Upload Receipt'
                  )}
                </button>
              )}

              {uploadState === 'error' && uploadError && (
                <p className={styles.uploadError} role="alert">
                  {uploadError}
                </p>
              )}

              {uploadState === 'success' && (
                <p className={styles.uploadSuccess}>
                  ✅ Receipt uploaded successfully
                </p>
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
