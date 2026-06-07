'use client';

import { useState, useCallback, useMemo } from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { formatCurrency } from '@/lib/currency/converter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton, EmptyState } from '@/components/ui';
import styles from './reports.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ReportType = 'profit-loss' | 'balance-sheet';

interface PnLLineItem {
  code: string;
  name: string;
  amount: number;
  type: 'revenue' | 'expense';
}

interface ProfitAndLossReport {
  entityName: string;
  entityCurrency: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  revenue: PnLLineItem[];
  totalRevenue: number;
  expenses: PnLLineItem[];
  totalExpenses: number;
  netIncome: number;
  comparisonPeriod?: {
    periodStart: string;
    periodEnd: string;
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
  };
}

interface BalanceSheetLineItem {
  code: string;
  name: string;
  amount: number;
  type: 'asset' | 'liability' | 'equity';
}

interface BalanceSheetReport {
  entityName: string;
  entityCurrency: string;
  asOfDate: string;
  generatedAt: string;
  assets: BalanceSheetLineItem[];
  totalAssets: number;
  liabilities: BalanceSheetLineItem[];
  totalLiabilities: number;
  equity: BalanceSheetLineItem[];
  totalEquity: number;
  isBalanced: boolean;
  retainedEarnings: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getDefaultDates(): { periodStart: string; periodEnd: string; asOfDate: string } {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return {
    periodStart: toISO(yearStart),
    periodEnd: toISO(now),
    asOfDate: toISO(now),
  };
}

function formatDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── P&L Report Display ─────────────────────────────────────────────────────────

function PnLReportView({
  report,
  fmtCurrency,
}: {
  report: ProfitAndLossReport;
  fmtCurrency: (n: number) => string;
}) {
  return (
    <div className={styles.reportContainer}>
      {/* Meta Header */}
      <div className={styles.reportMeta}>
        <div className={styles.reportMetaLeft}>
          <div className={styles.reportName}>
            Profit & Loss — {report.entityName}
          </div>
          <div className={styles.reportPeriod}>
            {formatDate(report.periodStart)} → {formatDate(report.periodEnd)}
          </div>
        </div>
        <div className={styles.reportMetaRight}>
          <Badge variant="info" size="sm">
            {report.entityCurrency}
          </Badge>
          <span className={styles.reportTimestamp}>
            Generated {new Date(report.generatedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Revenue Section */}
      <Card padding="lg" className={styles.reportSection}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>📈</span> Revenue
        </div>
        <table className={styles.lineItemsTable}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.revenue.map((item) => (
              <tr key={item.code} className={styles.lineItemRow}>
                <td className={styles.lineItemCode}>{item.code}</td>
                <td className={styles.lineItemName}>{item.name}</td>
                <td className={styles.lineItemAmount}>
                  {fmtCurrency(item.amount)}
                </td>
              </tr>
            ))}
            {report.revenue.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-4)' }}>
                  No revenue items for this period
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td />
              <td className={styles.totalLabel}>Total Revenue</td>
              <td className={styles.totalAmount}>
                {fmtCurrency(report.totalRevenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Expenses Section */}
      <Card padding="lg" className={styles.reportSection}>
        <div className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>💸</span> Expenses
        </div>
        <table className={styles.lineItemsTable}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.expenses.map((item) => (
              <tr key={item.code} className={styles.lineItemRow}>
                <td className={styles.lineItemCode}>{item.code}</td>
                <td className={styles.lineItemName}>{item.name}</td>
                <td className={styles.lineItemAmount}>
                  {fmtCurrency(item.amount)}
                </td>
              </tr>
            ))}
            {report.expenses.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-4)' }}>
                  No expense items for this period
                </td>
              </tr>
            )}
            <tr className={styles.totalRow}>
              <td />
              <td className={styles.totalLabel}>Total Expenses</td>
              <td className={styles.totalAmount}>
                {fmtCurrency(report.totalExpenses)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Total Revenue</div>
            <div className={styles.summaryValuePositive}>
              {fmtCurrency(report.totalRevenue)}
            </div>
          </div>
        </Card>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Total Expenses</div>
            <div className={styles.summaryValueNegative}>
              {fmtCurrency(report.totalExpenses)}
            </div>
          </div>
        </Card>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Net Income</div>
            <div className={report.netIncome >= 0 ? styles.summaryValuePositive : styles.summaryValueNegative}>
              {fmtCurrency(report.netIncome)}
            </div>
          </div>
        </Card>
      </div>

      {/* Comparison Period */}
      {report.comparisonPeriod && (
        <div className={styles.comparisonSection}>
          <div className={styles.comparisonTitle}>
            📊 Comparison Period ({formatDate(report.comparisonPeriod.periodStart)} → {formatDate(report.comparisonPeriod.periodEnd)})
          </div>
          <div className={styles.comparisonGrid}>
            <div>
              <div className={styles.comparisonLabel}>Revenue</div>
              <div className={styles.comparisonValue}>
                {fmtCurrency(report.comparisonPeriod.totalRevenue)}
              </div>
            </div>
            <div>
              <div className={styles.comparisonLabel}>Expenses</div>
              <div className={styles.comparisonValue}>
                {fmtCurrency(report.comparisonPeriod.totalExpenses)}
              </div>
            </div>
            <div>
              <div className={styles.comparisonLabel}>Net Income</div>
              <div className={styles.comparisonValue}>
                {fmtCurrency(report.comparisonPeriod.netIncome)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet Display ──────────────────────────────────────────────────────

function BalanceSheetSection({
  title,
  icon,
  items,
  total,
  totalLabel,
  fmtCurrency,
}: {
  title: string;
  icon: string;
  items: BalanceSheetLineItem[];
  total: number;
  totalLabel: string;
  fmtCurrency: (n: number) => string;
}) {
  return (
    <Card padding="lg" className={styles.reportSection}>
      <div className={styles.sectionTitle}>
        <span className={styles.sectionIcon}>{icon}</span> {title}
      </div>
      <table className={styles.lineItemsTable}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Account</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className={styles.lineItemRow}>
              <td className={styles.lineItemCode}>{item.code}</td>
              <td className={styles.lineItemName}>{item.name}</td>
              <td className={styles.lineItemAmount}>
                {fmtCurrency(item.amount)}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-4)' }}>
                No {title.toLowerCase()} items
              </td>
            </tr>
          )}
          <tr className={styles.totalRow}>
            <td />
            <td className={styles.totalLabel}>{totalLabel}</td>
            <td className={styles.totalAmount}>{fmtCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function BalanceSheetView({
  report,
  fmtCurrency,
}: {
  report: BalanceSheetReport;
  fmtCurrency: (n: number) => string;
}) {
  return (
    <div className={styles.reportContainer}>
      {/* Meta Header */}
      <div className={styles.reportMeta}>
        <div className={styles.reportMetaLeft}>
          <div className={styles.reportName}>
            Balance Sheet — {report.entityName}
          </div>
          <div className={styles.reportPeriod}>
            As of {formatDate(report.asOfDate)}
          </div>
        </div>
        <div className={styles.reportMetaRight}>
          <Badge variant="info" size="sm">
            {report.entityCurrency}
          </Badge>
          <Badge variant={report.isBalanced ? 'success' : 'warning'} size="sm">
            {report.isBalanced ? '✅ Balanced' : '⚠️ Not Balanced'}
          </Badge>
          <span className={styles.reportTimestamp}>
            Generated {new Date(report.generatedAt).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Assets */}
      <BalanceSheetSection
        title="Assets"
        icon="🏦"
        items={report.assets}
        total={report.totalAssets}
        totalLabel="Total Assets"
        fmtCurrency={fmtCurrency}
      />

      {/* Liabilities */}
      <BalanceSheetSection
        title="Liabilities"
        icon="📋"
        items={report.liabilities}
        total={report.totalLiabilities}
        totalLabel="Total Liabilities"
        fmtCurrency={fmtCurrency}
      />

      {/* Equity */}
      <BalanceSheetSection
        title="Equity"
        icon="🏛️"
        items={report.equity}
        total={report.totalEquity}
        totalLabel="Total Equity"
        fmtCurrency={fmtCurrency}
      />

      {/* Summary Grid */}
      <div className={styles.summaryGrid}>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Total Assets</div>
            <div className={styles.summaryValueNeutral}>
              {fmtCurrency(report.totalAssets)}
            </div>
          </div>
        </Card>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Total Liabilities + Equity</div>
            <div className={styles.summaryValueNeutral}>
              {fmtCurrency(report.totalLiabilities + report.totalEquity + report.retainedEarnings)}
            </div>
          </div>
        </Card>
        <Card variant="elevated" padding="lg">
          <div className={styles.summaryItem}>
            <div className={styles.summaryLabel}>Retained Earnings</div>
            <div className={report.retainedEarnings >= 0 ? styles.summaryValuePositive : styles.summaryValueNegative}>
              {fmtCurrency(report.retainedEarnings)}
            </div>
          </div>
        </Card>
      </div>

      {/* Balanced Indicator */}
      <div className={report.isBalanced ? styles.balancedTrue : styles.balancedFalse}>
        {report.isBalanced ? '✅' : '⚠️'}
        <span>
          {report.isBalanced
            ? 'Assets = Liabilities + Equity + Retained Earnings — Accounting equation is balanced.'
            : 'Accounting equation is not balanced. Review your chart of accounts and transactions.'}
        </span>
      </div>
    </div>
  );
}

// ─── Reports Page ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { selectedEntity } = useEntity();
  const defaults = useMemo(() => getDefaultDates(), []);

  const [reportType, setReportType] = useState<ReportType>('profit-loss');
  const [periodStart, setPeriodStart] = useState(defaults.periodStart);
  const [periodEnd, setPeriodEnd] = useState(defaults.periodEnd);
  const [asOfDate, setAsOfDate] = useState(defaults.asOfDate);
  const [comparePrevious, setComparePrevious] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pnlReport, setPnlReport] = useState<ProfitAndLossReport | null>(null);
  const [bsReport, setBsReport] = useState<BalanceSheetReport | null>(null);

  const entityId = selectedEntity?.id;
  const entityCurrency = selectedEntity?.currency || 'USD';
  const fmtCurrency = useCallback(
    (n: number) => formatCurrency(n, entityCurrency),
    [entityCurrency],
  );

  // ── Generate Report ─────────────────────────────────────────────────────────
  const generateReport = useCallback(async () => {
    if (!entityId) return;
    setIsLoading(true);
    setError(null);

    try {
      if (reportType === 'profit-loss') {
        const params = new URLSearchParams({
          entityId,
          periodStart,
          periodEnd,
          ...(comparePrevious ? { compare: 'true' } : {}),
        });
        const res = await fetch(`/api/reports/profit-loss?${params}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to generate P&L (${res.status})`);
        }
        const data = await res.json();
        setPnlReport(data);
        setBsReport(null);
      } else {
        const params = new URLSearchParams({
          entityId,
          asOfDate,
        });
        const res = await fetch(`/api/reports/balance-sheet?${params}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to generate Balance Sheet (${res.status})`);
        }
        const data = await res.json();
        setBsReport(data);
        setPnlReport(null);
      }
    } catch (err) {
      console.error('[Reports] Generate error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setIsLoading(false);
    }
  }, [entityId, reportType, periodStart, periodEnd, asOfDate, comparePrevious]);

  // ── Export as HTML ──────────────────────────────────────────────────────────
  const exportHtml = useCallback(async () => {
    if (!entityId) return;

    try {
      let htmlEndpoint: string;
      if (reportType === 'profit-loss') {
        const params = new URLSearchParams({
          entityId,
          periodStart,
          periodEnd,
          format: 'html',
        });
        htmlEndpoint = `/api/reports/profit-loss?${params}`;
      } else {
        const params = new URLSearchParams({
          entityId,
          asOfDate,
          format: 'html',
        });
        htmlEndpoint = `/api/reports/balance-sheet?${params}`;
      }

      const res = await fetch(htmlEndpoint);
      if (!res.ok) throw new Error('Failed to export');

      const contentType = res.headers.get('content-type') || '';
      let blob: Blob;
      if (contentType.includes('text/html')) {
        blob = await res.blob();
      } else {
        // Fallback: construct an HTML document from the JSON report data
        const data = await res.json();
        const htmlContent = `<!DOCTYPE html>
<html>
<head><title>${reportType === 'profit-loss' ? 'Profit & Loss' : 'Balance Sheet'} — ${data.entityName || 'Report'}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem}
table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0}
th{font-size:0.75rem;text-transform:uppercase;color:#64748b}
.total{border-top:2px solid #334155;font-weight:bold}
.amount{text-align:right;font-family:monospace}
h1{color:#1e293b}h2{color:#475569;margin-top:2rem}</style>
</head><body>
<h1>${reportType === 'profit-loss' ? 'Profit & Loss Statement' : 'Balance Sheet'}</h1>
<p>Entity: ${data.entityName || 'N/A'} | Currency: ${data.entityCurrency || 'USD'}</p>
<pre>${JSON.stringify(data, null, 2)}</pre>
</body></html>`;
        blob = new Blob([htmlContent], { type: 'text/html' });
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${reportType === 'profit-loss' ? periodStart + '-to-' + periodEnd : asOfDate}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Reports] Export error:', err);
      setError('Failed to export report');
    }
  }, [entityId, reportType, periodStart, periodEnd, asOfDate]);

  const hasReport = pnlReport || bsReport;

  return (
    <ErrorBoundary componentName="Financial Reports">
      <AppShell>
        <div className={styles.pageContainer}>
          <h1 className="sr-only">Financial Reports</h1>

          {/* Page Header */}
          <div className={styles.pageHeader}>
            <div className={styles.pageTitle}>📊 Financial Reports</div>
            <p className={styles.pageSubtitle}>
              Generate Profit & Loss statements and Balance Sheets from your transaction data.
            </p>
          </div>

          {/* No Entity Selected */}
          {!selectedEntity && (
            <EmptyState
              icon="🏢"
              title="No entity selected"
              description="Select a business entity to generate financial reports."
            />
          )}

          {selectedEntity && (
            <>
              {/* Report Type Tabs */}
              <div className={styles.reportTabs}>
                <button
                  id="tab-profit-loss"
                  className={reportType === 'profit-loss' ? styles.reportTabActive : styles.reportTab}
                  onClick={() => setReportType('profit-loss')}
                  aria-pressed={reportType === 'profit-loss'}
                >
                  <span className={styles.reportTabIcon}>📈</span>
                  Profit & Loss
                </button>
                <button
                  id="tab-balance-sheet"
                  className={reportType === 'balance-sheet' ? styles.reportTabActive : styles.reportTab}
                  onClick={() => setReportType('balance-sheet')}
                  aria-pressed={reportType === 'balance-sheet'}
                >
                  <span className={styles.reportTabIcon}>🏦</span>
                  Balance Sheet
                </button>
              </div>

              {/* Controls */}
              <div className={styles.controlsRow}>
                {reportType === 'profit-loss' ? (
                  <>
                    <div className={styles.dateField}>
                      <label htmlFor="period-start" className={styles.dateLabel}>
                        Period Start
                      </label>
                      <input
                        id="period-start"
                        type="date"
                        className={styles.dateInput}
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </div>
                    <div className={styles.dateField}>
                      <label htmlFor="period-end" className={styles.dateLabel}>
                        Period End
                      </label>
                      <input
                        id="period-end"
                        type="date"
                        className={styles.dateInput}
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </div>
                    <div className={styles.dateField}>
                      <label className={styles.dateLabel} style={{ visibility: 'hidden' }}>
                        Compare
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={comparePrevious}
                          onChange={(e) => setComparePrevious(e.target.checked)}
                        />
                        Compare previous period
                      </label>
                    </div>
                  </>
                ) : (
                  <div className={styles.dateField}>
                    <label htmlFor="as-of-date" className={styles.dateLabel}>
                      As of Date
                    </label>
                    <input
                      id="as-of-date"
                      type="date"
                      className={styles.dateInput}
                      value={asOfDate}
                      onChange={(e) => setAsOfDate(e.target.value)}
                    />
                  </div>
                )}

                <div className={styles.generateActions}>
                  <Button
                    id="generate-report"
                    variant="primary"
                    onClick={generateReport}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Generating…' : '⚡ Generate Report'}
                  </Button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div role="alert" className={styles.errorBanner}>
                  <span>⚠️ {error}</span>
                  <button
                    className={styles.errorDismiss}
                    onClick={() => setError(null)}
                    aria-label="Dismiss error"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Loading */}
              {isLoading && (
                <Card padding="lg">
                  <div className={styles.skeletonGrid}>
                    <Skeleton variant="rect" height={200} />
                    <Skeleton variant="rect" height={200} />
                    <Skeleton variant="rect" height={200} />
                  </div>
                </Card>
              )}

              {/* Empty State */}
              {!isLoading && !hasReport && !error && (
                <Card padding="lg">
                  <div className={styles.emptyReport}>
                    <div className={styles.emptyIcon}>
                      {reportType === 'profit-loss' ? '📈' : '🏦'}
                    </div>
                    <div className={styles.emptyTitle}>
                      No report generated yet
                    </div>
                    <p className={styles.emptyDesc}>
                      Select your date range and click &quot;Generate Report&quot; to create a{' '}
                      {reportType === 'profit-loss' ? 'Profit & Loss statement' : 'Balance Sheet'}.
                    </p>
                  </div>
                </Card>
              )}

              {/* P&L Report */}
              {!isLoading && pnlReport && (
                <>
                  <PnLReportView report={pnlReport} fmtCurrency={fmtCurrency} />
                  <div className={styles.exportActions}>
                    <Button variant="ghost" onClick={exportHtml}>
                      📥 Download as HTML
                    </Button>
                    <Button variant="ghost" onClick={generateReport}>
                      🔄 Regenerate
                    </Button>
                  </div>
                </>
              )}

              {/* Balance Sheet Report */}
              {!isLoading && bsReport && (
                <>
                  <BalanceSheetView report={bsReport} fmtCurrency={fmtCurrency} />
                  <div className={styles.exportActions}>
                    <Button variant="ghost" onClick={exportHtml}>
                      📥 Download as HTML
                    </Button>
                    <Button variant="ghost" onClick={generateReport}>
                      🔄 Regenerate
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
