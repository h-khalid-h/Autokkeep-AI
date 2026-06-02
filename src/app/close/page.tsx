'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Gauge, Progress, Skeleton, EmptyState } from '@/components/ui';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CloseCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  count?: number;
  details?: string[];
}

interface CloseReport {
  entityId: string;
  period: { year: number; month: number };
  readinessScore: number;
  checks: CloseCheck[];
  summary: string;
  isReady: boolean;
}

interface PeriodStatus {
  isLocked: boolean;
  lockedAt?: string;
  lockedBy?: string;
}

interface CloseResponse {
  report: CloseReport;
  periodStatus: PeriodStatus;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pass': return '✅';
    case 'warning': return '⚠️';
    case 'fail': return '❌';
    default: return '⬜';
  }
}

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'destructive' | 'default' {
  switch (status) {
    case 'pass': return 'success';
    case 'warning': return 'warning';
    case 'fail': return 'destructive';
    default: return 'default';
  }
}

function getGaugeColor(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

// ─── Timeline Check Item ────────────────────────────────────────────────────

function CheckItem({ check, isLast }: { check: CloseCheck; isLast: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const hasDetails = check.details && check.details.length > 0;
  const isPassed = check.status === 'pass';

  const nodeClass = [
    styles.timelineNode,
    isPassed ? styles.timelineNodePass
      : check.status === 'warning' ? styles.timelineNodeWarning
      : check.status === 'fail' ? styles.timelineNodeFail
      : '',
  ].filter(Boolean).join(' ');

  const lineClass = [
    styles.timelineLine,
    isPassed ? styles.timelineLinePass : '',
  ].filter(Boolean).join(' ');

  const contentClass = [
    styles.checkContent,
    isPassed ? styles.checkContentPass : '',
  ].filter(Boolean).join(' ');

  const headerClass = [
    styles.checkHeader,
    hasDetails ? styles.checkHeaderClickable : '',
  ].filter(Boolean).join(' ');

  const chevronClass = [
    styles.chevron,
    expanded ? styles.chevronExpanded : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.checkItem}>
      {/* Timeline connector */}
      <div className={styles.timelineConnector}>
        <div className={nodeClass}>
          {getStatusIcon(check.status)}
        </div>
        {!isLast && <div className={lineClass} />}
      </div>

      {/* Check content card */}
      <Card padding="sm" className={contentClass}>
        <div
          className={headerClass}
          onClick={() => hasDetails && setExpanded(!expanded)}
          onKeyDown={(e) => {
            if (hasDetails && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              setExpanded(!expanded);
            }
          }}
          role={hasDetails ? 'button' : undefined}
          tabIndex={hasDetails ? 0 : undefined}
        >
          <div className={styles.checkBody}>
            <div className={styles.checkNameRow}>
              <h4 className={styles.checkName}>{check.name}</h4>
              <Badge variant={getStatusBadgeVariant(check.status)} size="sm">
                {check.status}
              </Badge>
              {check.count !== undefined && (
                <span className={styles.checkCount}>({check.count})</span>
              )}
            </div>
            <p className={styles.checkDescription}>{check.description}</p>
          </div>
          {hasDetails && (
            <span className={chevronClass}>▼</span>
          )}
        </div>
        {expanded && check.details && (
          <ul className={styles.checkDetails}>
            {check.details.map((detail, i) => (
              <li key={i}>{detail}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ─── Close Page ─────────────────────────────────────────────────────────────

export default function ClosePage() {
  const { selectedEntity } = useEntity();
  const [selectedYear, setSelectedYear] = React.useState(() => {
    const now = new Date();
    return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  });
  const [selectedMonth, setSelectedMonth] = React.useState(() => {
    const now = new Date();
    return now.getMonth() === 0 ? 12 : now.getMonth();
  });
  const [data, setData] = React.useState<CloseResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isClosing, setIsClosing] = React.useState(false);
  const [closeResult, setCloseResult] = React.useState<string | null>(null);

  // ─── Fetch close report ───────────────────────────────────────────────────
  const fetchReport = React.useCallback(async () => {
    if (!selectedEntity?.id || !selectedMonth) return;

    setIsLoading(true);
    setError(null);
    setCloseResult(null);

    try {
      const res = await fetch(
        `/api/insights/close?entityId=${selectedEntity.id}&year=${selectedYear}&month=${selectedMonth}`
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to fetch close report (${res.status})`);
      }

      const result: CloseResponse = await res.json();
      setData(result);
    } catch (err) {
      console.error('[Close] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load close report');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntity, selectedYear, selectedMonth]);

  // Auto-fetch when entity or period changes
  const hasFetched = React.useRef(false);
  React.useEffect(() => {
    if (selectedEntity?.id && selectedMonth > 0) {
      if (!hasFetched.current) {
        hasFetched.current = true;
      }
      const controller = new AbortController();
      const doFetch = async () => {
        setIsLoading(true);
        setError(null);
        setCloseResult(null);
        try {
          const res = await fetch(
            `/api/insights/close?entityId=${selectedEntity.id}&year=${selectedYear}&month=${selectedMonth}`,
            { signal: controller.signal }
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Failed to fetch close report (${res.status})`);
          }
          const result: CloseResponse = await res.json();
          setData(result);
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.error('[Close] Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load close report');
          }
        } finally {
          setIsLoading(false);
        }
      };
      doFetch();
      return () => controller.abort();
    }
  }, [selectedEntity, selectedYear, selectedMonth]);

  // ─── Close period handler ─────────────────────────────────────────────────
  const handleClosePeriod = React.useCallback(async () => {
    if (!selectedEntity?.id || !data?.report.isReady) return;

    setIsClosing(true);
    setCloseResult(null);

    try {
      const res = await fetch('/api/insights/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: selectedEntity.id,
          year: selectedYear,
          month: selectedMonth,
          action: 'close',
        }),
      });

      const result = await res.json();

      if (res.ok && result.success) {
        setCloseResult(result.message);
        // Re-fetch to update period status
        await fetchReport();
      } else {
        setError(result.error || result.message || 'Failed to close period');
      }
    } catch (err) {
      console.error('[Close] Close error:', err);
      setError('Network error — could not close period');
    } finally {
      setIsClosing(false);
    }
  }, [selectedEntity, selectedYear, selectedMonth, data, fetchReport]);

  // ─── Year options ─────────────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ─── Sync progress counters ───────────────────────────────────────────────
  const passCount = data?.report.checks.filter(c => c.status === 'pass').length ?? 0;
  const totalChecks = data?.report.checks.length ?? 0;
  const progressValue = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0;

  return (
    <AppShell>
      <ErrorBoundary componentName="Close">
        <div className={styles.page}>
          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.title}>Month-End Close</h1>
            <p className={styles.subtitle}>
              AI-powered close process for {selectedEntity?.name || 'your entity'}
            </p>
          </div>

          {/* Period selector */}
          <Card padding="md" className={styles.periodSelector}>
            <label htmlFor="close-month-select" className={styles.periodLabel}>
              Period:
            </label>
            <select
              id="close-month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
              className={styles.periodSelect}
              aria-label="Close period month"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i + 1} className={styles.selectOption}>
                  {name}
                </option>
              ))}
            </select>
            <select
              id="close-year-select"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className={`${styles.periodSelect} ${styles.periodSelectSmall}`}
              aria-label="Close period year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y} className={styles.selectOption}>
                  {y}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              onClick={fetchReport}
              disabled={isLoading}
              isLoading={isLoading}
            >
              {isLoading ? 'Analyzing…' : 'Run Checks'}
            </Button>
          </Card>

          {/* Error banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              ⚠️ {error}
            </div>
          )}

          {/* Success banner */}
          {closeResult && (
            <div role="status" className={styles.successBanner}>
              🔒 {closeResult}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className={styles.loadingContainer}>
              <Skeleton variant="circle" width={160} height={160} />
              <Skeleton variant="text" width={300} />
              <Skeleton variant="rect" width="100%" height={80} />
              <Skeleton variant="rect" width="100%" height={80} />
              <Skeleton variant="rect" width="100%" height={80} />
            </div>
          )}

          {/* Empty state — no report yet */}
          {!data && !isLoading && !error && (
            <EmptyState
              icon="📋"
              title="Select a period to begin your month-end review"
              description='Choose a month and year above, then click "Run Checks" to analyze your close readiness.'
            />
          )}

          {/* Period already locked notice */}
          {data?.periodStatus.isLocked && (
            <Card variant="accent" padding="md" className={styles.lockedNotice}>
              <span className={styles.lockedIcon}>🔒</span>
              <div>
                <h4 className={styles.lockedTitle}>Period Closed</h4>
                <p className={styles.lockedDescription}>
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear} was closed
                  {data.periodStatus.lockedAt
                    ? ` on ${new Date(data.periodStatus.lockedAt).toLocaleDateString()}`
                    : ''}.
                  Transactions in this period are locked.
                </p>
              </div>
            </Card>
          )}

          {/* Report content */}
          {data && !isLoading && (
            <div className={styles.reportGrid}>
              {/* Score panel */}
              <Card variant="elevated" padding="md" className={styles.scorePanel}>
                <div className={styles.gaugeWrapper}>
                  <Gauge
                    value={data.report.readinessScore}
                    size="lg"
                    color={getGaugeColor(data.report.readinessScore)}
                    caption="Readiness"
                  />
                </div>
                <div>
                  <p className={styles.scoreSummary}>
                    {data.report.summary}
                  </p>

                  {/* Sync progress counter */}
                  <div className={styles.checkCounter}>
                    <span className={`${styles.checkCountValue} ${passCount === totalChecks ? styles.checkCountValueComplete : ''}`}>
                      {passCount}/{totalChecks}
                    </span>
                    <span className={styles.checkCountLabel}>checks passed</span>
                  </div>

                  {/* Progress bar */}
                  <div className={styles.progressWrapper}>
                    <Progress
                      value={progressValue}
                      color={passCount === totalChecks ? 'success' : 'accent'}
                    />
                  </div>

                  {!data.periodStatus.isLocked && (
                    <div className={styles.closeButtonWrapper}>
                      <Button
                        variant="primary"
                        onClick={handleClosePeriod}
                        disabled={!data.report.isReady || isClosing}
                        isLoading={isClosing}
                        aria-label="Close period"
                      >
                        {isClosing ? 'Closing…' : '🔒 Close Period'}
                      </Button>
                    </div>
                  )}
                  {!data.report.isReady && !data.periodStatus.isLocked && (
                    <p className={styles.readinessHint}>
                      Score must be 80+ to close
                    </p>
                  )}
                </div>
              </Card>

              {/* Timeline Checklist */}
              <div>
                <h3 className={styles.checklistTitle}>
                  Close Checklist — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </h3>
                <div className={styles.checklistContainer}>
                  {data.report.checks.map((check, i) => (
                    <CheckItem
                      key={i}
                      check={check}
                      isLast={i === data.report.checks.length - 1}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
