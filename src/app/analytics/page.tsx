'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useEntity } from '@/lib/context/EntityContext';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';
import { formatCurrency } from '@/lib/currency/converter';
import { getTaxRules } from '@/lib/tax/rules';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Progress, Skeleton, EmptyState } from '@/components/ui';
import styles from './analytics.module.css';

type TimeRange = '7d' | '30d' | '90d' | 'ytd';

interface AnalyticsData {
  totalTransactions: number;
  autoApproved: number;
  humanReviewed: number;
  pending: number;
  accuracy: number;
  avgProcessingTime: number;
  receiptsCaptured: number;
  receiptsMissing: number;
  syncedToLedger: number;
  dailyVolume: number[];
  dailyLabels: string[];
  topCategories: { name: string; code: string; count: number; amount: number }[];
  recentExceptions: { merchant: string; amount: number; confidence: number; reason: string }[];
}

interface RawTxn {
  date: string;
  status: string;
  category_human: string | null;
  category_ai: string | null;
  confidence: number | null;
  amount: number;
  merchant_name: string | null;
  merchant_raw: string | null;
  ai_reasoning: string | null;
  document_status: string | null;
}

const EMPTY_RANGE: AnalyticsData = {
  totalTransactions: 0, autoApproved: 0, humanReviewed: 0, pending: 0,
  accuracy: 0, avgProcessingTime: 0, receiptsCaptured: 0, receiptsMissing: 0, syncedToLedger: 0,
  dailyVolume: [0, 0, 0, 0, 0, 0, 0],
  dailyLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  topCategories: [],
  recentExceptions: [],
};

// Default empty state — zeros until real data loads
const EMPTY_DATA: Record<TimeRange, AnalyticsData> = {
  '7d': { ...EMPTY_RANGE },
  '30d': { ...EMPTY_RANGE, dailyVolume: Array(30).fill(0), dailyLabels: Array.from({ length: 30 }, (_, i) => `Day ${i + 1}`) },
  '90d': { ...EMPTY_RANGE, dailyVolume: Array(12).fill(0), dailyLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  'ytd': { ...EMPTY_RANGE, dailyVolume: Array(12).fill(0), dailyLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }};

export default function AnalyticsPage() {
  const { selectedEntity } = useEntity();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [analyticsData, setAnalyticsData] = useState<Record<TimeRange, AnalyticsData>>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [rawTransactions, setRawTransactions] = useState<RawTxn[]>([]);
  const [customTaxRate, setCustomTaxRate] = useState<number | null>(null);
  const [estimatedMileage, setEstimatedMileage] = useState<number>(3000);
  const [estimatedHomeOfficeSqFt, setEstimatedHomeOfficeSqFt] = useState<number>(200);

  // Reset custom tax rate when selectedEntity changes
  useEffect(() => {
    setCustomTaxRate(null);
  }, [selectedEntity?.id]);

  // Fetch real transaction stats on mount
  useEffect(() => {
    if (!selectedEntity?.id) return;
    const controller = new AbortController();
    async function fetchAnalytics() {
      setError(null);
      try {
        const res = await fetch(`/api/transactions?entityId=${selectedEntity!.id}`, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to fetch');
        const result = await res.json();
        const txns = result.transactions || [];

        if (txns.length === 0) {
          setRawTransactions([]);
          setIsLoading(false);
          return; // No data yet — show empty state
        }

        setRawTransactions(txns);
        setHasData(true);

        const now = Date.now();
        const ranges: Record<TimeRange, number> = {
          '7d': 7, '30d': 30, '90d': 90, 'ytd': Math.max(1, Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)),
        };

        const updated = { ...EMPTY_DATA };

        for (const [range, days] of Object.entries(ranges) as [TimeRange, number][]) {
          const cutoff = new Date(now - days * 86400000).toISOString();
          const filtered = txns.filter((tx: RawTxn) => tx.date >= cutoff.slice(0, 10));

          if (filtered.length === 0) continue;

          const autoApproved = filtered.filter((t: RawTxn) => t.status === TRANSACTION_STATUS.AUTO_CATEGORIZED || t.status === TRANSACTION_STATUS.APPROVED).length;
          const humanReviewed = filtered.filter((t: RawTxn) => t.status === TRANSACTION_STATUS.APPROVED && t.category_human).length;
          const pending = filtered.filter((t: RawTxn) => t.status === TRANSACTION_STATUS.PENDING || t.status === TRANSACTION_STATUS.HUMAN_REVIEW).length;
          const synced = filtered.filter((t: RawTxn) => t.status === TRANSACTION_STATUS.SYNCED).length;
          const highConf = filtered.filter((t: RawTxn) => (t.confidence || 0) >= 80).length;

          // Build category aggregation
          const catMap = new Map<string, { count: number; amount: number }>();
          for (const tx of filtered) {
            const cat = tx.category_human || tx.category_ai || 'Uncategorized';
            const existing = catMap.get(cat) || { count: 0, amount: 0 };
            catMap.set(cat, { count: existing.count + 1, amount: existing.amount + Math.abs(tx.amount) });
          }
          const topCategories = Array.from(catMap.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([code, data]) => ({ name: code, code, count: data.count, amount: Math.round(data.amount) }));

          // Build exceptions
          const exceptions = filtered
            .filter((t: RawTxn) => (t.confidence || 0) < 85 && t.status !== TRANSACTION_STATUS.SYNCED)
            .slice(0, 3)
            .map((t: RawTxn) => ({
              merchant: t.merchant_name || t.merchant_raw || 'Unknown',
              amount: Math.abs(t.amount),
              confidence: t.confidence || 0,
              reason: t.ai_reasoning?.slice(0, 60) || 'Needs review',
            }));

          updated[range] = {
            totalTransactions: filtered.length,
            autoApproved,
            humanReviewed,
            pending,
            accuracy: filtered.length > 0 ? Math.round((highConf / filtered.length) * 1000) / 10 : 0,
            avgProcessingTime: 0, // Not tracked per-transaction
            receiptsCaptured: filtered.filter((t: RawTxn) => t.document_status === 'found').length,
            receiptsMissing: filtered.filter((t: RawTxn) => t.document_status === 'missing' || !t.document_status).length,
            syncedToLedger: synced,
            dailyVolume: (() => {
              // Compute real daily volume from transactions
              const dayCount = Math.min(days, 30); // Show max 30 data points
              const volumeMap = new Map<string, number>();
              for (const tx of filtered) {
                const d = tx.date?.slice(0, 10);
                if (d) volumeMap.set(d, (volumeMap.get(d) || 0) + 1);
              }
              const result: number[] = [];
              for (let i = dayCount - 1; i >= 0; i--) {
                const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
                result.push(volumeMap.get(d) || 0);
              }
              return result;
            })(),
            dailyLabels: (() => {
              const dayCount = Math.min(days, 30);
              const labels: string[] = [];
              const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
              for (let i = dayCount - 1; i >= 0; i--) {
                const d = new Date(now - i * 86400000);
                labels.push(dayNames[d.getDay()]);
              }
              return labels;
            })(),
            topCategories: topCategories.length > 0 ? topCategories : [],
            recentExceptions: exceptions.length > 0 ? exceptions : [],
          };
        }

        setAnalyticsData(updated);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[Analytics] Failed to load data:', err);
          setError(err instanceof Error ? err.message : 'Failed to load analytics data');
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
    return () => controller.abort();
  }, [selectedEntity?.id, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = analyticsData[timeRange];
  const entityCurrency = selectedEntity?.currency || 'USD';

  const fmtCurrency = (n: number) => formatCurrency(n, entityCurrency);

  const taxRules = useMemo(() => {
    return getTaxRules(selectedEntity?.country);
  }, [selectedEntity?.country]);

  const activeTaxRate = customTaxRate !== null ? customTaxRate : (taxRules.defaultTaxRate * 100);

  const taxMetrics = useMemo(() => {
    if (rawTransactions.length === 0) {
      return { revenue: 0, expenses: 0, mealsTotal: 0, mealsNonDeductible: 0, netIncome: 0, taxableIncome: 0, estimatedTax: 0, mileageDeduction: 0, homeOfficeDeduction: 0 };
    }

    const cutoffDays: Record<TimeRange, number> = {
      '7d': 7, '30d': 30, '90d': 90, 'ytd': Math.max(1, Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)),
    };
    const cutoff = new Date(Date.now() - cutoffDays[timeRange] * 86400000).toISOString();
    const filtered = rawTransactions.filter((tx) => tx.date >= cutoff.slice(0, 10));

    let revenue = 0;
    let expenses = 0;
    let mealsTotal = 0;

    const mealsKeywords = ['meals', 'entertainment', 'dining', 'restaurant', 'food & drink'];

    for (const tx of filtered) {
      const amt = Math.abs(tx.amount);
      if (tx.amount < 0) {
        revenue += amt;
      } else {
        expenses += amt;
        const cat = (tx.category_human || tx.category_ai || '').toLowerCase();
        if (mealsKeywords.some((kw) => cat.includes(kw))) {
          mealsTotal += amt;
        }
      }
    }

    const mealsNonDeductible = mealsTotal * (1 - taxRules.mealsDeductionRate);
    
    // Mileage deduction
    let mileageRate = 0.5;
    if (selectedEntity?.country === 'US') mileageRate = 0.67;
    else if (selectedEntity?.country === 'CA') mileageRate = 0.70;
    else if (selectedEntity?.country === 'GB') mileageRate = 0.45;
    else if (selectedEntity?.country === 'AU') mileageRate = 0.85;

    const mileageDeduction = taxRules.hasMileageDeduction ? (estimatedMileage * mileageRate) : 0;

    // Home office deduction
    let homeOfficeDeduction = 0;
    if (taxRules.hasHomeOfficeDeduction) {
      if (selectedEntity?.country === 'US') {
        homeOfficeDeduction = Math.min(estimatedHomeOfficeSqFt * 5, 1500);
      } else if (selectedEntity?.country === 'DE') {
        homeOfficeDeduction = 1260;
      } else if (selectedEntity?.country === 'GB') {
        homeOfficeDeduction = 312;
      } else if (selectedEntity?.country === 'CA') {
        homeOfficeDeduction = 500;
      } else if (selectedEntity?.country === 'AU') {
        homeOfficeDeduction = 1000;
      }
    }

    const netIncome = revenue - expenses;
    const taxableIncome = Math.max(0, netIncome - mealsNonDeductible - mileageDeduction - homeOfficeDeduction);
    const estimatedTax = taxableIncome * (activeTaxRate / 100);

    return {
      revenue,
      expenses,
      mealsTotal,
      mealsNonDeductible,
      netIncome,
      taxableIncome,
      estimatedTax,
      mileageDeduction,
      homeOfficeDeduction,
    };
  }, [rawTransactions, timeRange, taxRules, activeTaxRate, estimatedMileage, estimatedHomeOfficeSqFt, selectedEntity?.country]);

  const autoRate = useMemo(() => data.totalTransactions > 0
    ? ((data.autoApproved / data.totalTransactions) * 100).toFixed(1)
    : '0.0', [data.totalTransactions, data.autoApproved]);
  const maxVolume = useMemo(() => Math.max(...data.dailyVolume, 1), [data.dailyVolume]);

  // Determine accuracy color class
  const getAccuracyClass = () => {
    if (data.accuracy >= 95) return styles.kpiValueSuccess;
    if (data.accuracy >= 90) return styles.kpiValueWarning;
    return styles.kpiValueDestructive;
  };

  const receiptRate = useMemo(() => (data.receiptsCaptured + data.receiptsMissing) > 0
    ? ((data.receiptsCaptured / (data.receiptsCaptured + data.receiptsMissing)) * 100).toFixed(0)
    : '0', [data.receiptsCaptured, data.receiptsMissing]);

  const timeRangeButtons: { id: TimeRange; label: string }[] = [
    { id: '7d', label: '7 Days' },
    { id: '30d', label: '30 Days' },
    { id: '90d', label: '90 Days' },
    { id: 'ytd', label: 'YTD' },
  ];

  // Pipeline stages config
  const pipelineStages = useMemo(() => [
    { label: 'Imported', value: data.totalTransactions, boxClass: styles.pipelineBoxAccent, valueClass: styles.pipelineValueAccent },
    { label: 'Auto-Approved', value: data.autoApproved, boxClass: styles.pipelineBoxSuccess, valueClass: styles.pipelineValueSuccess },
    { label: 'Human-Reviewed', value: data.humanReviewed, boxClass: styles.pipelineBoxWarning, valueClass: styles.pipelineValueWarning },
    { label: 'Pending', value: data.pending, boxClass: styles.pipelineBoxDestructive, valueClass: styles.pipelineValueDestructive },
  ], [data.totalTransactions, data.autoApproved, data.humanReviewed, data.pending]);

  // Loading state
  if (isLoading) {
    return (
      <ErrorBoundary>
        <AppShell>
          <div className={styles.pageContainer}>
            <div className={styles.loadingContainer}>
              <div className={styles.loadingGrid}>
                {Array.from({ length: 4 }, (_, i) => (
                  <Card key={i} variant="elevated" padding="lg">
                    <Skeleton width="60%" height={14} />
                    <Skeleton width="40%" height={32} />
                    <Skeleton width="80%" height={12} />
                  </Card>
                ))}
              </div>
              <Card padding="lg">
                <Skeleton width="30%" height={18} />
                <Skeleton variant="rect" height={160} />
              </Card>
            </div>
          </div>
        </AppShell>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell>
        <div className={styles.pageContainer}>
          <h1 className="sr-only">Analytics</h1>
          {/* Empty state banner */}
          {!hasData && (
            <EmptyState
              icon="📊"
              title="No transaction data yet"
              description="Connect your bank account to start seeing real analytics. All charts will populate automatically as transactions flow in."
              action={
                <Button onClick={() => router.push('/onboarding')}>
                  Connect Bank Account →
                </Button>
              }
            />
          )}

          {/* Error banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              <span className={styles.errorBannerContent}>
                <span className={styles.errorBannerIcon}>⚠️</span>
                {error}
              </span>
              <span className={styles.errorBannerActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setIsLoading(true);
                    setRetryKey(k => k + 1);
                  }}
                >
                  Retry
                </Button>
                <button
                  className={styles.errorDismiss}
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </span>
            </div>
          )}

          {/* Time Range Selector */}
          <div className={styles.toolbar}>
            <h2 className={styles.toolbarTitle}>Performance Overview</h2>
            <div className={styles.timeRangeGroup}>
              {timeRangeButtons.map((range) => (
                <Button
                  key={range.id}
                  variant={timeRange === range.id ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeRange(range.id)}
                  aria-pressed={timeRange === range.id}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </div>

          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <Card variant="elevated" padding="lg">
              <div className={styles.kpiLabel}>Total Transactions</div>
              <div className={styles.kpiValue}>
                {data.totalTransactions.toLocaleString()}
              </div>
              <div className={styles.kpiSubSuccess}>
                {data.syncedToLedger} synced to ledger
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div className={styles.kpiLabel}>AI Accuracy</div>
              <div className={getAccuracyClass()}>
                {data.accuracy}%
              </div>
              <div className={styles.kpiSub}>
                {autoRate}% auto-approved
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div className={styles.kpiLabel}>Avg Processing Time</div>
              <div className={styles.kpiValueMuted}>
                N/A
              </div>
              <div className={styles.kpiSub}>
                Not yet tracked
              </div>
            </Card>

            <Card variant="elevated" padding="lg">
              <div className={styles.kpiLabel}>Receipts Captured</div>
              <div className={styles.kpiValue}>
                {receiptRate}%
              </div>
              <div className={styles.kpiSub}>
                {data.receiptsMissing} still missing
              </div>
            </Card>
          </div>

          {/* Processing Pipeline */}
          <Card padding="lg" className={styles.pipelineCard}>
            <div className={styles.sectionTitle}>Processing Pipeline</div>
            <div className={styles.pipelineFlow}>
              {pipelineStages.map((stage, i) => (
                <div key={stage.label} className={styles.pipelineStage}>
                  <div className={stage.boxClass}>
                    <div className={stage.valueClass}>
                      {stage.value}
                    </div>
                    <div className={styles.pipelineLabel}>{stage.label}</div>
                  </div>
                  {i < pipelineStages.length - 1 && (
                    <div className={styles.pipelineArrow}>→</div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Two Column: Volume Chart + Top Categories */}
          <div className={styles.twoColumnGrid}>
            {/* Volume Chart (CSS bars) */}
            <Card padding="lg">
              <div className={styles.sectionTitle}>Daily Transaction Volume</div>
              <div className={styles.chartContainer}>
                {data.dailyVolume.slice(-30).map((v, i) => (
                  <div
                    key={i}
                    className={styles.chartBar}
                    style={{
                      '--bar-height': `${(v / maxVolume) * 100}%`,
                      height: `${(v / maxVolume) * 100}%`,
                      opacity: 0.7 + (v / maxVolume) * 0.3,
                    } as React.CSSProperties}
                    title={`${v} transactions`}
                  />
                ))}
              </div>
              <div className={styles.chartCaption}>
                Last {Math.min(30, data.dailyVolume.length)} days
              </div>
            </Card>

            {/* Top Categories */}
            <Card padding="lg">
              <div className={styles.sectionTitle}>Top GL Categories</div>
              <div className={styles.categoryList}>
                {data.topCategories.map((cat, i) => (
                  <div key={cat.code}>
                    <div className={styles.categoryRow}>
                      <span className={styles.categoryName}>
                        {i + 1}. {cat.name}
                      </span>
                      <span className={styles.categoryAmount}>
                        {fmtCurrency(cat.amount)}
                      </span>
                    </div>
                    <Progress
                      value={data.topCategories[0].count > 0 ? (cat.count / data.topCategories[0].count) * 100 : 0}
                      size="sm"
                      color="accent"
                    />
                    <div className={styles.categoryCount}>
                      {cat.count} transactions
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Tax Estimator & Deductions Panel */}
          {taxRules.hasIncomeTax && (
            <Card padding="lg" className={styles.taxEstimatorCard}>
              <div className={styles.taxEstimatorHeader}>
                <div className={styles.sectionTitle}>
                  🏛️ Tax Estimate & Regional Deductions ({taxRules.authority})
                </div>
                <Badge variant="success">{taxRules.taxSystemLabel}</Badge>
              </div>

              <div className={styles.taxEstimatorGrid}>
                {/* Left side: Rates & Sliders */}
                <div className={styles.taxControls}>
                  <div className={styles.controlRow}>
                    <label className={styles.controlLabel}>
                      Effective Tax Rate: <strong>{activeTaxRate.toFixed(1)}%</strong>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="50"
                      step="0.5"
                      value={activeTaxRate}
                      onChange={(e) => setCustomTaxRate(parseFloat(e.target.value))}
                      className={styles.sliderInput}
                    />
                    <div className={styles.sliderTicks}>
                      <span>0%</span>
                      <span>Default ({ (taxRules.defaultTaxRate * 100).toFixed(0) }%)</span>
                      <span>50%</span>
                    </div>
                  </div>

                  {taxRules.hasMileageDeduction && (
                    <div className={styles.controlRow}>
                      <label className={styles.controlLabel}>
                        Estimated Business Travel: <strong>{estimatedMileage.toLocaleString()} {selectedEntity?.country === 'US' || selectedEntity?.country === 'GB' ? 'miles' : 'km'}</strong>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="20000"
                        step="500"
                        value={estimatedMileage}
                        onChange={(e) => setEstimatedMileage(parseInt(e.target.value, 10))}
                        className={styles.sliderInput}
                      />
                    </div>
                  )}

                  {taxRules.hasHomeOfficeDeduction && selectedEntity?.country === 'US' && (
                    <div className={styles.controlRow}>
                      <label className={styles.controlLabel}>
                        Home Office Size: <strong>{estimatedHomeOfficeSqFt} sq ft</strong>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="500"
                        step="10"
                        value={estimatedHomeOfficeSqFt}
                        onChange={(e) => setEstimatedHomeOfficeSqFt(parseInt(e.target.value, 10))}
                        className={styles.sliderInput}
                      />
                    </div>
                  )}
                </div>

                {/* Right side: Calculations breakdown */}
                <div className={styles.taxCalculations}>
                  <div className={styles.calcRow}>
                    <span>Net Business Income:</span>
                    <span className={styles.calcVal}>{fmtCurrency(taxMetrics.netIncome)}</span>
                  </div>
                  {taxMetrics.mealsTotal > 0 && (
                    <div className={styles.calcRowSub}>
                      <span>Non-Deductible Meals ({((1 - taxRules.mealsDeductionRate) * 100).toFixed(0)}% limit):</span>
                      <span className={styles.calcValWarning}>+ {fmtCurrency(taxMetrics.mealsNonDeductible)}</span>
                    </div>
                  )}
                  {taxMetrics.mileageDeduction > 0 && (
                    <div className={styles.calcRowSub}>
                      <span>Mileage Allowance Deduction:</span>
                      <span className={styles.calcValSuccess}>- {fmtCurrency(taxMetrics.mileageDeduction)}</span>
                    </div>
                  )}
                  {taxMetrics.homeOfficeDeduction > 0 && (
                    <div className={styles.calcRowSub}>
                      <span>Home Office Deduction:</span>
                      <span className={styles.calcValSuccess}>- {fmtCurrency(taxMetrics.homeOfficeDeduction)}</span>
                    </div>
                  )}
                  <div className={styles.calcDivider} />
                  <div className={styles.calcRowHighlight}>
                    <span>Estimated Taxable Income:</span>
                    <span>{fmtCurrency(taxMetrics.taxableIncome)}</span>
                  </div>
                  <div className={styles.calcRowTotal}>
                    <span>Est. Tax Liability ({activeTaxRate.toFixed(1)}%):</span>
                    <span className={styles.calcValHighlight}>{fmtCurrency(taxMetrics.estimatedTax)}</span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Recent Exceptions */}
          <Card padding="lg" className={styles.exceptionsCard}>
            <div className={styles.exceptionsHeader}>
              <div className={styles.sectionTitle}>Recent Exceptions</div>
              <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
                View All →
              </Button>
            </div>
            <div className={styles.exceptionsList}>
              {data.recentExceptions.map((ex, i) => (
                <div key={i} className={styles.exceptionRow}>
                  <div className={styles.exceptionInfo}>
                    <span className={styles.exceptionMerchant}>{ex.merchant}</span>
                    <span className={styles.exceptionReason}>{ex.reason}</span>
                  </div>
                  <div className={styles.exceptionMeta}>
                    <span className={styles.exceptionAmount}>
                      {fmtCurrency(ex.amount)}
                    </span>
                    <Badge variant={ex.confidence >= 80 ? 'warning' : 'destructive'}>
                      {ex.confidence}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Monthly Close Status */}
          <Card variant="accent" padding="lg" className={styles.closeStatusCard}>
            <div className={styles.closeStatusInner}>
              <div>
                <div className={styles.closeStatusTitle}>
                  📊 Monthly Close Status — {new Date().toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                </div>
                <p className={styles.closeStatusDesc}>
                  {data.pending > 0
                    ? `${data.pending} transactions pending review. Resolve them to close the month.`
                    : '✅ All transactions processed! Ready to close.'}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={data.pending > 0}
              >
                {data.pending > 0 ? `${data.pending} Pending` : 'Close Month ✓'}
              </Button>
            </div>
          </Card>
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}
