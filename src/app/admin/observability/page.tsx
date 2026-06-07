'use client';

import React from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton, EmptyState, Tabs, Toggle, useToast } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import styles from './observability.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface RateLimitStat {
  endpoint: string;
  totalRequests: number;
  throttledRequests: number;
  throttleRate: number;
  lastThrottledAt: string | null;
  windowSeconds: number;
  maxRequests: number;
}

interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTime: string;
  endTime: string | null;
  durationMs: number | null;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateId(id: string, length = 12): string {
  return id.length > length ? id.slice(0, length) + '…' : id;
}

function throttleRateClass(rate: number): string {
  if (rate > 20) return styles.throttleRed;
  if (rate >= 5) return styles.throttleYellow;
  return styles.throttleGreen;
}

function durationClass(ms: number | null): string {
  if (ms === null) return styles.durationGreen;
  if (ms > 500) return styles.durationRed;
  if (ms >= 100) return styles.durationYellow;
  return styles.durationGreen;
}

function statusVariant(status: string): 'success' | 'destructive' | 'default' {
  switch (status) {
    case 'ok': return 'success';
    case 'error': return 'destructive';
    default: return 'default';
  }
}

function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  loading,
}: {
  label: string;
  value: string;
  icon: string;
  loading: boolean;
}) {
  return (
    <Card variant="elevated">
      <div className={styles.kpiCardInner}>
        <div>
          <div className={styles.kpiLabel}>{label}</div>
          {loading ? (
            <Skeleton width={80} height={32} />
          ) : (
            <div className={styles.kpiValue}>{value}</div>
          )}
        </div>
        <div className={styles.kpiIcon}>{icon}</div>
      </div>
    </Card>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────────

const AUTO_REFRESH_INTERVAL = 30_000;

export default function ObservabilityPage() {
  const toast = useToast();
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  // Rate limit state
  const [rateLimits, setRateLimits] = React.useState<RateLimitStat[]>([]);
  const [rlLoading, setRlLoading] = React.useState(true);
  const [rlError, setRlError] = React.useState<string | null>(null);

  // Traces state
  const [traces, setTraces] = React.useState<TraceSpan[]>([]);
  const [tracesLoading, setTracesLoading] = React.useState(true);
  const [tracesError, setTracesError] = React.useState<string | null>(null);
  const [expandedTraceId, setExpandedTraceId] = React.useState<string | null>(null);

  // ── Fetch Functions ─────────────────────────────────────────────────────

  const fetchRateLimits = React.useCallback(async () => {
    setRlLoading(true);
    setRlError(null);
    try {
      const res = await fetch('/api/admin/rate-limits');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRateLimits(data.stats || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load rate limits';
      setRlError(msg);
    } finally {
      setRlLoading(false);
    }
  }, []);

  const fetchTraces = React.useCallback(async () => {
    setTracesLoading(true);
    setTracesError(null);
    try {
      const res = await fetch('/api/admin/traces?limit=50');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setTraces(data.spans || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load traces';
      setTracesError(msg);
    } finally {
      setTracesLoading(false);
    }
  }, []);

  const fetchAll = React.useCallback(async () => {
    await Promise.all([fetchRateLimits(), fetchTraces()]);
    setLastUpdated(new Date());
  }, [fetchRateLimits, fetchTraces]);

  // ── Initial Fetch ────────────────────────────────────────────────────────

  React.useEffect(() => {
    void (async () => {
      await Promise.all([fetchRateLimits(), fetchTraces()]);
      setLastUpdated(new Date());
    })();
  }, [fetchRateLimits, fetchTraces]);

  // ── Auto Refresh ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchAll();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  // ── Computed KPIs ────────────────────────────────────────────────────────

  const totalRequests = rateLimits.reduce((sum, r) => sum + r.totalRequests, 0);
  const totalThrottled = rateLimits.reduce((sum, r) => sum + r.throttledRequests, 0);
  const avgThrottleRate =
    totalRequests > 0
      ? Math.round((totalThrottled / totalRequests) * 10000) / 100
      : 0;
  const errorSpans = traces.filter((t) => t.status === 'error').length;

  return (
    <ErrorBoundary componentName="Observability">
      <AppShell>
        <div className={styles.page}>
          {/* Back nav */}
          <Link href="/admin" className={styles.backLink}>
            ← Back to Admin
          </Link>

          {/* Header */}
          <div>
            <div className={styles.pageHeader}>
              <h1 className={styles.pageTitle}>🔭 Observability</h1>
              <Badge variant="warning">ADMIN</Badge>
            </div>
            <p className={styles.pageDescription}>
              Real-time monitoring of rate limits, request throttling, and distributed traces.
            </p>
          </div>

          {/* KPI Summary */}
          <div className={styles.kpiGrid}>
            <KPICard
              label="Total Requests"
              value={rlLoading ? '—' : formatNumber(totalRequests)}
              icon="📊"
              loading={rlLoading}
            />
            <KPICard
              label="Throttled Requests"
              value={rlLoading ? '—' : formatNumber(totalThrottled)}
              icon="🚫"
              loading={rlLoading}
            />
            <KPICard
              label="Avg Throttle Rate"
              value={rlLoading ? '—' : `${avgThrottleRate}%`}
              icon="📈"
              loading={rlLoading}
            />
            <KPICard
              label="Error Spans"
              value={tracesLoading ? '—' : formatNumber(errorSpans)}
              icon="⚠️"
              loading={tracesLoading}
            />
          </div>

          {/* Toolbar */}
          <Card padding="sm">
            <div className={styles.toolbar}>
              <div className={styles.toolbarLeft}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    fetchAll();
                    toast.success('Data refreshed');
                  }}
                >
                  🔄 Refresh
                </Button>
                {lastUpdated && (
                  <span className={styles.lastUpdated}>
                    Updated {relativeTime(lastUpdated.toISOString())}
                  </span>
                )}
              </div>
              <div className={styles.toolbarRight}>
                {autoRefresh && <span className={styles.liveDot} />}
                <Toggle
                  checked={autoRefresh}
                  onChange={setAutoRefresh}
                  label="Auto-refresh (30s)"
                  size="sm"
                />
              </div>
            </div>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="rate-limits">
            <Tabs.List>
              <Tabs.Tab value="rate-limits">🛡️ Rate Limits</Tabs.Tab>
              <Tabs.Tab value="traces">🔍 Traces</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="rate-limits">
              <RateLimitsTab
                stats={rateLimits}
                loading={rlLoading}
                error={rlError}
                onRetry={fetchRateLimits}
              />
            </Tabs.Panel>

            <Tabs.Panel value="traces">
              <TracesTab
                spans={traces}
                loading={tracesLoading}
                error={tracesError}
                expandedId={expandedTraceId}
                onToggleExpand={(id) =>
                  setExpandedTraceId(expandedTraceId === id ? null : id)
                }
                onRetry={fetchTraces}
              />
            </Tabs.Panel>
          </Tabs>
        </div>
      </AppShell>
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITS TAB
// ═══════════════════════════════════════════════════════════════════════════════

function RateLimitsTab({
  stats,
  loading,
  error,
  onRetry,
}: {
  stats: RateLimitStat[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className={styles.tabContent}>
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {error}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.tabContent}>
        <Card>
          <div className={styles.skeletonStack}>
            <Skeleton width="100%" height={40} />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} width="100%" height={36} />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className={styles.tabContent}>
        <EmptyState
          icon="🛡️"
          title="No rate limit data"
          description="Rate limit statistics will appear here once endpoints begin receiving traffic."
        />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <Card>
        <h2 className={styles.sectionTitle}>Endpoint Throttle Rates</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th style={{ textAlign: 'right' }}>Total Requests</th>
                <th style={{ textAlign: 'right' }}>Throttled</th>
                <th>Throttle Rate</th>
                <th>Window Config</th>
                <th>Last Throttled</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.endpoint}>
                  <td className={styles.endpointCell}>{stat.endpoint}</td>
                  <td className={styles.numberCell}>
                    {formatNumber(stat.totalRequests)}
                  </td>
                  <td className={styles.numberCell}>
                    {formatNumber(stat.throttledRequests)}
                  </td>
                  <td>
                    <span
                      className={`${styles.throttleBadge} ${throttleRateClass(stat.throttleRate)}`}
                    >
                      {stat.throttleRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className={styles.windowConfig}>
                    {stat.maxRequests} / {stat.windowSeconds}s
                  </td>
                  <td className={styles.timestampCell}>
                    {stat.lastThrottledAt
                      ? relativeTime(stat.lastThrottledAt)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACES TAB
// ═══════════════════════════════════════════════════════════════════════════════

function TracesTab({
  spans,
  loading,
  error,
  expandedId,
  onToggleExpand,
  onRetry,
}: {
  spans: TraceSpan[];
  loading: boolean;
  error: string | null;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className={styles.tabContent}>
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {error}</span>
          <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.tabContent}>
        <div className={styles.skeletonStack}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i} padding="sm">
              <div className={styles.skeletonRow}>
                <Skeleton width="30%" height={20} />
                <Skeleton width="15%" height={20} />
                <Skeleton width="10%" height={20} />
                <Skeleton width="10%" height={20} />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (spans.length === 0) {
    return (
      <div className={styles.tabContent}>
        <EmptyState
          icon="🔍"
          title="No traces recorded"
          description="Trace spans will appear here once instrumented operations are executed."
        />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      <Card>
        <h2 className={styles.sectionTitle}>
          Recent Spans ({spans.length})
        </h2>
      </Card>
      <div className={styles.traceList}>
        {spans.map((span) => {
          const isExpanded = expandedId === span.spanId;

          return (
            <div key={span.spanId}>
              <Card
                variant="interactive"
                padding="sm"
                className={styles.traceRow}
                onClick={() => onToggleExpand(span.spanId)}
                tabIndex={0}
                role="button"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleExpand(span.spanId);
                  }
                }}
              >
                <div className={styles.traceRowInner}>
                  {/* Operation + Service */}
                  <div className={styles.traceInfo}>
                    <div className={styles.operationName}>
                      {span.operationName}
                    </div>
                    <div className={styles.serviceName}>
                      {span.serviceName}
                    </div>
                  </div>

                  {/* Duration */}
                  <span
                    className={`${styles.durationBadge} ${durationClass(span.durationMs)}`}
                  >
                    {span.durationMs !== null ? `${span.durationMs}ms` : '—'}
                  </span>

                  {/* Status */}
                  <Badge variant={statusVariant(span.status)}>
                    {span.status}
                  </Badge>

                  {/* Trace ID */}
                  <span
                    className={styles.traceId}
                    title={span.traceId}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(span.traceId);
                    }}
                  >
                    {truncateId(span.traceId)}
                  </span>

                  {/* Start time */}
                  <span className={styles.relativeTime}>
                    {relativeTime(span.startTime)}
                  </span>

                  {/* Expand arrow */}
                  <span className={styles.expandIcon}>
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </div>
              </Card>

              {/* Expanded detail view */}
              {isExpanded && (
                <Card className={styles.expandedDetails} padding="sm">
                  {/* Core IDs */}
                  <div className={styles.detailsGrid}>
                    <div>
                      <div className={styles.detailLabel}>Trace ID</div>
                      <div className={styles.detailMono}>{span.traceId}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Span ID</div>
                      <div className={styles.detailMono}>{span.spanId}</div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Parent Span ID</div>
                      <div className={styles.detailMono}>
                        {span.parentSpanId || '— (root span)'}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Start Time</div>
                      <div className={styles.detailValue}>
                        {new Date(span.startTime).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>End Time</div>
                      <div className={styles.detailValue}>
                        {span.endTime
                          ? new Date(span.endTime).toLocaleString()
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className={styles.detailLabel}>Duration</div>
                      <div className={styles.detailValue}>
                        {span.durationMs !== null
                          ? `${span.durationMs}ms`
                          : 'In progress'}
                      </div>
                    </div>
                  </div>

                  {/* Attributes */}
                  {Object.keys(span.attributes).length > 0 && (
                    <div className={styles.attributesSection}>
                      <div className={styles.attributesTitle}>Attributes</div>
                      <div className={styles.attributesList}>
                        {Object.entries(span.attributes).map(([key, value]) => (
                          <div key={key} className={styles.attributeItem}>
                            <span className={styles.attributeKey}>{key}:</span>
                            <span className={styles.attributeValue}>
                              {formatAttributeValue(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Events */}
                  {span.events.length > 0 && (
                    <div className={styles.eventsSection}>
                      <div className={styles.eventsTitle}>Events</div>
                      <div className={styles.eventsList}>
                        {span.events.map((event, idx) => (
                          <div key={idx} className={styles.eventItem}>
                            <span className={styles.eventName}>
                              {event.name}
                            </span>
                            <span className={styles.eventTime}>
                              {new Date(event.timestamp).toLocaleTimeString()}
                            </span>
                            {event.attributes &&
                              Object.entries(event.attributes).map(
                                ([k, v]) => (
                                  <Badge key={k} size="sm" variant="default">
                                    {k}: {formatAttributeValue(v)}
                                  </Badge>
                                )
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
