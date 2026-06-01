'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

function getStatusColor(status: string): { bg: string; border: string; text: string } {
  switch (status) {
    case 'pass':
      return {
        bg: 'var(--success-subtle)',
        border: 'var(--success-border)',
        text: 'var(--success)',
      };
    case 'warning':
      return {
        bg: 'var(--warning-subtle)',
        border: 'var(--warning-border)',
        text: 'var(--warning)',
      };
    case 'fail':
      return {
        bg: 'var(--destructive-subtle)',
        border: 'var(--destructive-border)',
        text: 'var(--destructive)',
      };
    default:
      return {
        bg: 'var(--bg-glass)',
        border: 'var(--border-primary)',
        text: 'var(--text-secondary)',
      };
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--destructive)';
}

// ─── Readiness Gauge ────────────────────────────────────────────────────────

function ReadinessGauge({ score }: { score: number }) {
  const color = getScoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="160" height="160" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
        <text
          x="60"
          y="50"
          textAnchor="middle"
          fill={color}
          fontSize="30"
          fontWeight="800"
        >
          {score}
        </text>
        <text
          x="60"
          y="68"
          textAnchor="middle"
          fill="var(--text-tertiary)"
          fontSize="10"
        >
          Readiness
        </text>
        <text
          x="60"
          y="82"
          textAnchor="middle"
          fill={score >= 80 ? 'var(--success)' : 'var(--text-tertiary)'}
          fontSize="10"
          fontWeight="600"
        >
          {score >= 80 ? 'READY' : 'NOT READY'}
        </text>
      </svg>
    </div>
  );
}

// ─── Check Item ─────────────────────────────────────────────────────────────

function CheckItem({ check }: { check: CloseCheck }) {
  const [expanded, setExpanded] = React.useState(false);
  const colors = getStatusColor(check.status);
  const hasDetails = check.details && check.details.length > 0;

  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4) var(--space-5)',
        animation: 'fade-in-up 0.3s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          cursor: hasDetails ? 'pointer' : 'default',
        }}
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
        <span style={{ fontSize: '20px', flexShrink: 0 }}>
          {getStatusIcon(check.status)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h4
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              {check.name}
            </h4>
            <span
              className="badge"
              style={{
                background: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                fontSize: '0.625rem',
                textTransform: 'uppercase',
              }}
            >
              {check.status}
            </span>
            {check.count !== undefined && (
              <span className="text-caption" style={{ fontSize: '0.75rem' }}>
                ({check.count} item{check.count !== 1 ? 's' : ''})
              </span>
            )}
          </div>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem',
              margin: 0,
              marginTop: 'var(--space-1)',
            }}
          >
            {check.description}
          </p>
        </div>
        {hasDetails && (
          <span
            style={{
              color: 'var(--text-tertiary)',
              fontSize: '12px',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              flexShrink: 0,
            }}
          >
            ▼
          </span>
        )}
      </div>
      {expanded && check.details && (
        <ul
          style={{
            marginTop: 'var(--space-3)',
            paddingLeft: 'var(--space-10)',
            listStyle: 'disc',
            color: 'var(--text-secondary)',
            fontSize: '0.8125rem',
            lineHeight: 1.8,
          }}
        >
          {check.details.map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      )}
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

  return (
    <ErrorBoundary componentName="Close">
      <div
        style={{
          padding: 'var(--space-8)',
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h1
            style={{
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Month-End Close
          </h1>
          <p className="text-caption" style={{ marginTop: 'var(--space-1)' }}>
            AI-powered close process for {selectedEntity?.name || 'your entity'}
          </p>
        </div>

        {/* Period selector */}
        <div
          className="card-elevated"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            flexWrap: 'wrap',
          }}
        >
          <label
            htmlFor="close-month-select"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            Period:
          </label>
          <select
            id="close-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            className="input"
            aria-label="Close period month"
            style={{ width: 'auto', minWidth: '160px' }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                {name}
              </option>
            ))}
          </select>
          <select
            id="close-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="input"
            aria-label="Close period year"
            style={{ width: 'auto', minWidth: '100px' }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={fetchReport}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            {isLoading ? 'Analyzing…' : 'Run Checks'}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--destructive-subtle)',
              color: 'var(--destructive)',
              padding: 'var(--space-3) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: 'var(--space-6)',
              border: '1px solid var(--destructive-border)',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Success banner */}
        {closeResult && (
          <div
            role="status"
            style={{
              background: 'var(--success-subtle)',
              color: 'var(--success)',
              padding: 'var(--space-3) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: 'var(--space-6)',
              border: '1px solid var(--success-border)',
            }}
          >
            🔒 {closeResult}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 'var(--space-16)',
              gap: 'var(--space-4)',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--border-primary)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p className="text-caption">
              Running {MONTH_NAMES[selectedMonth - 1]} {selectedYear} close checks…
            </p>
          </div>
        )}

        {/* Empty state — no report yet */}
        {!data && !isLoading && !error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 'var(--space-16)',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>📋</span>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Select a period to begin your month-end review
            </h2>
            <p className="text-caption">
              Choose a month and year above, then click &quot;Run Checks&quot; to analyze your close readiness.
            </p>
          </div>
        )}

        {/* Period already locked notice */}
        {data?.periodStatus.isLocked && (
          <div
            style={{
              background: 'var(--success-subtle)',
              border: '1px solid var(--success-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-6)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <span style={{ fontSize: '24px' }}>🔒</span>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Period Closed</h4>
              <p className="text-caption" style={{ margin: 0 }}>
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear} was closed
                {data.periodStatus.lockedAt
                  ? ` on ${new Date(data.periodStatus.lockedAt).toLocaleDateString()}`
                  : ''}.
                Transactions in this period are locked.
              </p>
            </div>
          </div>
        )}

        {/* Report content */}
        {data && !isLoading && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '220px 1fr',
              gap: 'var(--space-8)',
              alignItems: 'start',
            }}
          >
            {/* Score panel */}
            <div
              className="card-elevated"
              style={{
                textAlign: 'center',
                position: 'sticky',
                top: 'calc(var(--header-height) + var(--space-8))',
              }}
            >
              <ReadinessGauge score={data.report.readinessScore} />
              <div style={{ marginTop: 'var(--space-4)' }}>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  {data.report.summary}
                </p>
                {!data.periodStatus.isLocked && (
                  <button
                    onClick={handleClosePeriod}
                    disabled={!data.report.isReady || isClosing}
                    className="btn btn-primary"
                    aria-label="Close period"
                    style={{
                      width: '100%',
                      opacity: !data.report.isReady ? 0.5 : 1,
                      cursor: !data.report.isReady ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isClosing ? 'Closing…' : '🔒 Close Period'}
                  </button>
                )}
                {!data.report.isReady && !data.periodStatus.isLocked && (
                  <p
                    className="text-caption"
                    style={{ marginTop: 'var(--space-2)', fontSize: '0.75rem' }}
                  >
                    Score must be 80+ to close
                  </p>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <h3
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--text-primary)',
                }}
              >
                Close Checklist — {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </h3>
              {data.report.checks.map((check, i) => (
                <CheckItem key={i} check={check} />
              ))}
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @media (max-width: 768px) {
            div[style*="grid-template-columns: 220px"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
