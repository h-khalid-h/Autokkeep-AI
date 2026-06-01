'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthAlertData {
  id: string;
  alertType: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  data: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
}

interface HealthResponse {
  alerts: HealthAlertData[];
  healthScore: number;
  cached: boolean;
  alertCount: { critical: number; warning: number; info: number };
}

// ─── Alert Icon Map ─────────────────────────────────────────────────────────

function getAlertIcon(alertType: string): string {
  switch (alertType) {
    case 'cash_flow_decline': return '📉';
    case 'expense_anomaly': return '📊';
    case 'duplicate_payment': return '🔁';
    case 'subscription_waste': return '💳';
    case 'revenue_concentration': return '⚠️';
    case 'uncategorized_backlog': return '📋';
    case 'missing_receipts': return '🧾';
    case 'burn_rate_warning': return '🔥';
    default: return '🔔';
  }
}

function getSeverityStyles(severity: string): {
  bg: string; border: string; text: string; leftBorder: string; glowColor: string;
} {
  switch (severity) {
    case 'critical':
      return {
        bg: 'var(--destructive-subtle)',
        border: 'var(--destructive-border)',
        text: 'var(--destructive)',
        leftBorder: 'var(--destructive)',
        glowColor: 'rgba(220, 60, 60, 0.1)',
      };
    case 'warning':
      return {
        bg: 'var(--warning-subtle)',
        border: 'var(--warning-border)',
        text: 'var(--warning)',
        leftBorder: 'var(--warning)',
        glowColor: 'rgba(245, 158, 11, 0.08)',
      };
    default:
      return {
        bg: 'var(--info-subtle)',
        border: 'rgba(var(--accent-glow-rgb), 0.25)',
        text: 'var(--accent-secondary)',
        leftBorder: 'var(--accent-secondary)',
        glowColor: 'rgba(0, 245, 255, 0.06)',
      };
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--destructive)';
}

// ─── Health Score Gauge ─────────────────────────────────────────────────────

function HealthScoreGauge({ score }: { score: number }) {
  const color = getScoreColor(score);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ textAlign: 'center' }}>
      <svg width="140" height="140" viewBox="0 0 120 120" role="img" aria-label={`Health score: ${score} out of 100`}>
        {/* Background ring */}
        <circle
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="var(--border-primary)"
          strokeWidth="8"
        />
        {/* Score arc */}
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
        {/* Score text */}
        <text
          x="60"
          y="55"
          textAnchor="middle"
          fill={color}
          fontSize="28"
          fontWeight="800"
        >
          {score}
        </text>
        <text
          x="60"
          y="75"
          textAnchor="middle"
          fill="var(--text-tertiary)"
          fontSize="11"
        >
          Health Score
        </text>
      </svg>
    </div>
  );
}

// ─── Alert Card ─────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
  dismissing,
  index,
}: {
  alert: HealthAlertData;
  onDismiss: (id: string) => void;
  dismissing: boolean;
  index: number;
}) {
  const styles = getSeverityStyles(alert.severity);
  const icon = getAlertIcon(alert.alertType);

  return (
    <div
      style={{
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderLeft: `3px solid ${styles.leftBorder}`,
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-5)',
        display: 'flex',
        gap: 'var(--space-4)',
        alignItems: 'flex-start',
        animation: `fade-in-up 0.3s ease-out ${index * 0.05}s both`,
        transition: 'all 200ms ease-out',
        boxShadow: `0 0 16px ${styles.glowColor}`,
      }}
    >
      <span
        style={{
          fontSize: '24px',
          flexShrink: 0,
          lineHeight: 1,
          width: '36px',
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.03)',
        }}
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-1)',
          }}
        >
          <h4
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {alert.title}
          </h4>
          <span
            className="badge"
            style={{
              background: styles.bg,
              color: styles.text,
              border: `1px solid ${styles.border}`,
              fontSize: '0.625rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 800,
            }}
          >
            {alert.severity}
          </span>
        </div>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {alert.description}
        </p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        disabled={dismissing}
        className="btn btn-ghost btn-sm"
        aria-label="Dismiss alert"
        style={{
          flexShrink: 0,
          fontSize: '0.75rem',
          opacity: dismissing ? 0.5 : 1,
        }}
      >
        {dismissing ? '…' : 'Dismiss'}
      </button>
    </div>
  );
}

// ─── Health Dashboard Page ──────────────────────────────────────────────────

export default function HealthPage() {
  const { selectedEntity } = useEntity();
  const [data, setData] = React.useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [dismissingIds, setDismissingIds] = React.useState<Set<string>>(new Set());

  // ─── Fetch health data ────────────────────────────────────────────────────
  const fetchHealth = React.useCallback(
    async (refresh = false) => {
      if (!selectedEntity?.id) return;

      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      setError(null);

      try {
        const url = `/api/insights/health?entityId=${selectedEntity.id}${refresh ? '&refresh=true' : ''}`;
        const res = await fetch(url);

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch health data (${res.status})`);
        }

        const result: HealthResponse = await res.json();
        setData(result);
      } catch (err) {
        console.error('[Health] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load health data');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedEntity]
  );

  React.useEffect(() => {
    if (!selectedEntity?.id) return;
    const controller = new AbortController();
    const doFetch = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/insights/health?entityId=${selectedEntity.id}`,
          { signal: controller.signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch health data (${res.status})`);
        }
        const result: HealthResponse = await res.json();
        setData(result);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[Health] Fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load health data');
        }
      } finally {
        setIsLoading(false);
      }
    };
    doFetch();
    return () => controller.abort();
  }, [selectedEntity]);

  // ─── Dismiss handler ──────────────────────────────────────────────────────
  const handleDismiss = React.useCallback(
    async (alertId: string) => {
      setDismissingIds((prev) => new Set(prev).add(alertId));

      try {
        const res = await fetch('/api/insights/health', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alertId, action: 'dismiss' }),
        });

        if (res.ok) {
          setData((prev) => {
            if (!prev) return prev;
            const alerts = prev.alerts.filter((a) => a.id !== alertId);
            // Recalculate counts
            return {
              ...prev,
              alerts,
              alertCount: {
                critical: alerts.filter((a) => a.severity === 'critical').length,
                warning: alerts.filter((a) => a.severity === 'warning').length,
                info: alerts.filter((a) => a.severity === 'info').length,
              },
            };
          });
        }
      } catch (err) {
        console.error('[Health] Dismiss error:', err);
      } finally {
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }
    },
    []
  );

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary componentName="Health">
        <div
          style={{
            padding: 'var(--space-8)',
            maxWidth: 'var(--max-width)',
            margin: '0 auto',
          }}
        >
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <div
              style={{
                width: '250px',
                height: '32px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 'var(--radius-md)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-8)',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: '160px',
                height: '160px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                animation: 'pulse 1.5s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    height: '80px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                />
              ))}
            </div>
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
          `}</style>
        </div>
      </ErrorBoundary>
    );
  }

  // ─── Group alerts by severity ─────────────────────────────────────────────
  const criticalAlerts = data?.alerts.filter((a) => a.severity === 'critical') || [];
  const warningAlerts = data?.alerts.filter((a) => a.severity === 'warning') || [];
  const infoAlerts = data?.alerts.filter((a) => a.severity === 'info') || [];
  const healthScore = data?.healthScore ?? 100;
  const hasAlerts = (data?.alerts.length ?? 0) > 0;

  return (
    <ErrorBoundary componentName="Health">
      <div
        style={{
          padding: 'var(--space-8)',
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--space-8)',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Financial Health
            </h1>
            <p className="text-caption" style={{ marginTop: 'var(--space-1)' }}>
              {data?.cached
                ? 'Showing cached results from the last 24 hours'
                : 'Freshly analyzed'}{' '}
              · {selectedEntity?.name || 'All entities'}
            </p>
          </div>
          <button
            onClick={() => fetchHealth(true)}
            disabled={isRefreshing}
            className="btn btn-secondary"
            aria-label="Re-scan financial health"
            style={{ gap: 'var(--space-2)' }}
          >
            <span
              style={{
                display: 'inline-block',
                animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
              }}
            >
              ↻
            </span>
            {isRefreshing ? 'Scanning…' : 'Re-scan'}
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

        {/* Empty state */}
        {!hasAlerts && !error && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-16) var(--space-8)',
              textAlign: 'center',
            }}
          >
            <HealthScoreGauge score={healthScore} />
            <div style={{ marginTop: 'var(--space-6)' }}>
              <span style={{ fontSize: '48px', display: 'block', marginBottom: 'var(--space-4)' }}>
                ✅
              </span>
              <h2
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  marginBottom: 'var(--space-2)',
                }}
              >
                Your finances look healthy!
              </h2>
              <p className="text-caption">
                No anomalies detected. We&apos;ll keep monitoring and alert you if anything changes.
              </p>
            </div>
          </div>
        )}

        {/* Main content with score + alerts */}
        {hasAlerts && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '200px 1fr',
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
              <HealthScoreGauge score={healthScore} />
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {data && data.alertCount.critical > 0 && (
                  <span className="badge badge-destructive" style={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                    {data.alertCount.critical} critical
                  </span>
                )}
                {data && data.alertCount.warning > 0 && (
                  <span className="badge badge-warning" style={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                    {data.alertCount.warning} warning
                  </span>
                )}
                {data && data.alertCount.info > 0 && (
                  <span className="badge badge-info" style={{ fontWeight: 800, letterSpacing: '0.04em' }}>
                    {data.alertCount.info} info
                  </span>
                )}
              </div>
            </div>

            {/* Alert cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              {/* Critical */}
              {criticalAlerts.length > 0 && (
                <section>
                  <h3
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: 'var(--destructive)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 'var(--space-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>🚨</span> Critical ({criticalAlerts.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {criticalAlerts.map((alert, i) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onDismiss={handleDismiss}
                        dismissing={dismissingIds.has(alert.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Warning */}
              {warningAlerts.length > 0 && (
                <section>
                  <h3
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: 'var(--warning)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 'var(--space-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>⚠️</span> Warnings ({warningAlerts.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {warningAlerts.map((alert, i) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onDismiss={handleDismiss}
                        dismissing={dismissingIds.has(alert.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Info */}
              {infoAlerts.length > 0 && (
                <section>
                  <h3
                    style={{
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      color: 'var(--accent-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 'var(--space-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span style={{ fontSize: '14px' }}>ℹ️</span> Info ({infoAlerts.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {infoAlerts.map((alert, i) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onDismiss={handleDismiss}
                        dismissing={dismissingIds.has(alert.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @media (max-width: 768px) {
            div[style*="grid-template-columns: 200px"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
