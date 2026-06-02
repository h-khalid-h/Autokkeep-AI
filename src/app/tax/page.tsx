'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { formatCurrency } from '@/lib/currency/converter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, Gauge, Skeleton, EmptyState, useToast } from '@/components/ui';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeductionCategory {
  category: string;
  amount: number;
  count: number;
}

interface MissingReceipt {
  id: string;
  merchant: string;
  amount: number;
  date: string;
}

interface TaxReadinessReport {
  entityId: string;
  taxYear: number;
  totalExpenses: number;
  totalDeductible: number;
  estimatedSavings: number;
  deductionsByCategory: DeductionCategory[];
  missingReceipts: MissingReceipt[];
  readinessScore: number;
  recommendations: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getGaugeColor(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

// ─── Deduction Bar Chart ────────────────────────────────────────────────────

function DeductionBarChart({ categories, currency }: { categories: DeductionCategory[]; currency: string }) {
  if (categories.length === 0) {
    return (
      <div className={styles.barChartEmpty}>
        No deductible expenses found
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map(c => c.amount));
  const barColors = [
    'var(--color-accent)',
    'var(--color-success)',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
    '#14b8a6',
    '#e11d48',
    '#a855f7',
  ];

  return (
    <div className={styles.barRow}>
      {categories.slice(0, 10).map((cat, i) => {
        const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
        const color = barColors[i % barColors.length];

        return (
          <div key={cat.category}>
            <div className={styles.barLabel}>
              <span className={styles.barLabelName}>{cat.category}</span>
              <span className={styles.barLabelValue}>
                {formatCurrency(cat.amount, currency)} ({cat.count})
              </span>
            </div>
            <svg width="100%" height="8" style={{ display: 'block' }}>
              <rect x="0" y="0" width="100%" height="8" rx="4" fill="var(--color-border-primary)" />
              <rect
                x="0"
                y="0"
                width={`${barWidth}%`}
                height="8"
                rx="4"
                fill={color}
                style={{ transition: 'width 0.8s ease-out' }}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tax Dashboard Page ─────────────────────────────────────────────────────

export default function TaxPage() {
  const { selectedEntity } = useEntity();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  const [data, setData] = React.useState<TaxReadinessReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);

  const toast = useToast();

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ─── Fetch tax readiness report ──────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedEntity?.id) return;

    const controller = new AbortController();
    const doFetch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/tax/readiness?entityId=${selectedEntity.id}&taxYear=${selectedYear}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch tax data (${res.status})`);
        }

        const result = await res.json();
        setData(result.report);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[Tax] Fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load tax data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    doFetch();
    return () => controller.abort();
  }, [selectedEntity, selectedYear]);

  const currency = selectedEntity?.currency || 'USD';

  return (
    <AppShell>
      <ErrorBoundary componentName="Tax">
        <div className={styles.page}>
          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.title}>Tax Readiness</h1>
            <p className={styles.subtitle}>
              AI-powered tax deduction analysis for {selectedEntity?.name || 'your entity'}
            </p>
          </div>

          {/* Tax Year Selector */}
          <Card padding="md">
            <div className={styles.yearSelector}>
              <label htmlFor="tax-year-select" className={styles.yearLabel}>
                Tax Year:
              </label>
              <select
                id="tax-year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className={styles.yearSelect}
                aria-label="Tax year"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div className={styles.exportBtn}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    toast.info('Export functionality will generate a tax-ready CSV/PDF report for your accountant.');
                  }}
                >
                  📤 Export for Accountant
                </Button>
              </div>
            </div>
          </Card>

          {/* Error banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className={styles.loadingContainer}>
              <div className={styles.kpiGrid}>
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} variant="elevated" padding="md">
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="80%" height={28} />
                  </Card>
                ))}
              </div>
              <Card variant="elevated">
                <Skeleton variant="rect" width="100%" height={200} />
              </Card>
            </div>
          )}

          {/* Empty state */}
          {!data && !isLoading && !error && (
            <EmptyState
              icon="📋"
              title="Select an entity and tax year to analyze"
              description="Choose a tax year above to see your deduction breakdown, missing receipts, and estimated savings."
            />
          )}

          {/* Report content */}
          {data && !isLoading && (
            <>
              {/* KPI Summary Cards */}
              <div className={styles.kpiGrid}>
                <Card variant="elevated" padding="md" className={styles.kpiCard}>
                  <p className={styles.kpiLabel}>Total Expenses</p>
                  <p className={styles.kpiValue}>
                    {formatCurrency(data.totalExpenses, currency)}
                  </p>
                </Card>
                <Card variant="elevated" padding="md" className={styles.kpiCard}>
                  <p className={styles.kpiLabel}>Deductible</p>
                  <p className={`${styles.kpiValue} ${styles.kpiValueSuccess}`}>
                    {formatCurrency(data.totalDeductible, currency)}
                  </p>
                </Card>
                <Card variant="elevated" padding="md" className={styles.kpiCard}>
                  <p className={styles.kpiLabel}>Est. Tax Savings</p>
                  <p className={`${styles.kpiValue} ${styles.kpiValueAccent}`}>
                    {formatCurrency(data.estimatedSavings, currency)}
                  </p>
                </Card>
                <Card variant="elevated" padding="md" className={styles.kpiCard}>
                  <p className={styles.kpiLabel}>Missing Receipts</p>
                  <p className={`${styles.kpiValue} ${data.missingReceipts.length > 0 ? styles.kpiValueWarning : styles.kpiValueSuccess}`}>
                    {data.missingReceipts.length}
                  </p>
                </Card>
              </div>

              {/* Main 2-column layout */}
              <div className={styles.mainLayout}>
                {/* Score panel */}
                <Card variant="elevated" padding="md" className={styles.scorePanel}>
                  <Gauge
                    value={data.readinessScore}
                    size="lg"
                    color={getGaugeColor(data.readinessScore)}
                    caption="Tax Ready"
                  />
                  <p className={styles.scoreSummary}>
                    {data.readinessScore >= 80
                      ? 'Records are tax-ready'
                      : data.readinessScore >= 60
                        ? 'Some items need attention'
                        : 'Significant gaps found'}
                  </p>
                  <div className={styles.scoreYear}>Tax Year {data.taxYear}</div>

                  {/* Document upload dropzone */}
                  <div
                    className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ''}`}
                    onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragOver(false); }}
                    role="button"
                    tabIndex={0}
                    aria-label="Drop documents here to upload"
                  >
                    <span className={styles.dropzoneIcon}>
                      {isDragOver ? '📥' : '📎'}
                    </span>
                    <span className={styles.dropzoneText}>
                      {isDragOver ? 'Drop to upload' : 'Drop receipts here'}
                    </span>
                  </div>
                </Card>

                {/* Right column */}
                <div className={styles.rightColumn}>
                  {/* Deduction Breakdown */}
                  <section>
                    <h3 className={styles.sectionTitle}>💰 Deduction Breakdown by Category</h3>
                    <Card variant="elevated" padding="md">
                      <DeductionBarChart categories={data.deductionsByCategory} currency={currency} />
                    </Card>
                  </section>

                  {/* Missing Receipts */}
                  {data.missingReceipts.length > 0 && (
                    <section>
                      <h3 className={`${styles.sectionTitle} ${styles.sectionTitleWarning}`}>
                        🧾 Missing Receipts ({data.missingReceipts.length})
                      </h3>
                      <div className={styles.receiptList}>
                        {data.missingReceipts.slice(0, 20).map((receipt) => (
                          <div key={receipt.id} className={styles.receiptCard}>
                            <div className={styles.receiptInfo}>
                              <span className={styles.receiptIcon}>🧾</span>
                              <div>
                                <div className={styles.receiptMerchant}>{receipt.merchant}</div>
                                <div className={styles.receiptDate}>
                                  {new Date(receipt.date).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <div className={styles.receiptActions}>
                              <span className={styles.receiptAmount}>
                                {formatCurrency(receipt.amount, currency)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                href={`/transactions?search=${encodeURIComponent(receipt.merchant)}`}
                              >
                                View →
                              </Button>
                            </div>
                          </div>
                        ))}
                        {data.missingReceipts.length > 20 && (
                          <p className={styles.moreText}>
                            …and {data.missingReceipts.length - 20} more
                          </p>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Recommendations */}
                  {data.recommendations.length > 0 && (
                    <section>
                      <h3 className={styles.sectionTitle}>💡 Recommendations</h3>
                      <div className={styles.recList}>
                        {data.recommendations.map((rec, i) => (
                          <div key={i} className={styles.recCard}>
                            {rec}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
