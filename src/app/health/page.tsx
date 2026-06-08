'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { useEntityFetch } from '@/lib/hooks/useEntityFetch';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Gauge, Skeleton, EmptyState, useToast } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import type { GaugeColor } from '@/components/ui';
import styles from './page.module.css';

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

function getSeverityBadgeVariant(severity: string): BadgeVariant {
  switch (severity) {
    case 'critical': return 'destructive';
    case 'warning': return 'warning';
    default: return 'info';
  }
}

function getSeverityCardClass(severity: string): string {
  switch (severity) {
    case 'critical': return styles.alertCardCritical;
    case 'warning': return styles.alertCardWarning;
    default: return styles.alertCardInfo;
  }
}

function getGaugeColor(score: number): GaugeColor {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

// ─── Alert Card ─────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
  dismissing,
}: {
  alert: HealthAlertData;
  onDismiss: (id: string) => void;
  dismissing: boolean;
}) {
  const icon = getAlertIcon(alert.alertType);
  const cardClass = `${styles.alertCard} ${getSeverityCardClass(alert.severity)}`;

  return (
    <Card padding="md" className={cardClass}>
      <span className={styles.alertIconWrapper}>
        {icon}
      </span>
      <div className={styles.alertBody}>
        <div className={styles.alertTitleRow}>
          <h4 className={styles.alertTitle}>{alert.title}</h4>
          <Badge variant={getSeverityBadgeVariant(alert.severity)} size="sm">
            {alert.severity}
          </Badge>
        </div>
        <p className={styles.alertDescription}>
          {alert.description}
        </p>
      </div>
      <div className={styles.dismissButton}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(alert.id)}
          disabled={dismissing}
          isLoading={dismissing}
          aria-label="Dismiss alert"
        >
          Dismiss
        </Button>
      </div>
    </Card>
  );
}

// ─── Region display names ───────────────────────────────────────────────────

const COMPLIANCE_REGIONS = [
  { key: 'united_states', label: '🇺🇸 United States', flag: '🇺🇸' },
  { key: 'united_kingdom', label: '🇬🇧 United Kingdom', flag: '🇬🇧' },
  { key: 'germany', label: '🇩🇪 Germany', flag: '🇩🇪' },
  { key: 'european_union', label: '🇪🇺 European Union', flag: '🇪🇺' },
  { key: 'estonia', label: '🇪🇪 Estonia', flag: '🇪🇪' },
  { key: 'canada', label: '🇨🇦 Canada', flag: '🇨🇦' },
  { key: 'australia', label: '🇦🇺 Australia', flag: '🇦🇺' },
  { key: 'india', label: '🇮🇳 India', flag: '🇮🇳' },
  { key: 'japan', label: '🇯🇵 Japan', flag: '🇯🇵' },
  { key: 'singapore', label: '🇸🇬 Singapore', flag: '🇸🇬' },
  { key: 'hong_kong', label: '🇭🇰 Hong Kong', flag: '🇭🇰' },
  { key: 'switzerland', label: '🇨🇭 Switzerland', flag: '🇨🇭' },
  { key: 'uae', label: '🇦🇪 UAE', flag: '🇦🇪' },
  { key: 'saudi_arabia', label: '🇸🇦 Saudi Arabia', flag: '🇸🇦' },
  { key: 'qatar', label: '🇶🇦 Qatar', flag: '🇶🇦' },
  { key: 'egypt', label: '🇪🇬 Egypt', flag: '🇪🇬' },
  { key: 'brazil', label: '🇧🇷 Brazil', flag: '🇧🇷' },
  { key: 'mexico', label: '🇲🇽 Mexico', flag: '🇲🇽' },
  { key: 'south_africa', label: '🇿🇦 South Africa', flag: '🇿🇦' },
  { key: 'nigeria', label: '🇳🇬 Nigeria', flag: '🇳🇬' },
  { key: 'kenya', label: '🇰🇪 Kenya', flag: '🇰🇪' },
] as const;

interface ComplianceViolation {
  code: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
}

interface ComplianceResult {
  score: number;
  violations: ComplianceViolation[];
  region: string;
}

const COUNTRY_TO_REGION: Record<string, string> = {
  US: 'united_states',
  GB: 'united_kingdom',
  DE: 'germany',
  FR: 'european_union',
  NL: 'european_union',
  IE: 'european_union',
  SE: 'european_union',
  FI: 'european_union',
  LV: 'european_union',
  LT: 'european_union',
  PL: 'european_union',
  EE: 'estonia',
  CA: 'canada',
  AU: 'australia',
  IN: 'india',
  JP: 'japan',
  SG: 'singapore',
  HK: 'hong_kong',
  CH: 'switzerland',
  AE: 'uae',
  SA: 'saudi_arabia',
  QA: 'qatar',
  EG: 'egypt',
  BR: 'brazil',
  MX: 'mexico',
  ZA: 'south_africa',
  NG: 'nigeria',
  KE: 'kenya',
};

function ComplianceSection({ entityId, countryCode }: { entityId: string; countryCode?: string }) {
  const initialRegion = (countryCode && COUNTRY_TO_REGION[countryCode]) || 'united_states';
  const [selectedRegion, setSelectedRegion] = React.useState<string | null>(initialRegion);
  const [result, setResult] = React.useState<ComplianceResult | null>(null);
  const [meta, setMeta] = React.useState<{ transactionCount: number; periodStart: string; periodEnd: string } | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const complianceAbortRef = React.useRef<AbortController | null>(null);

  const handleRunCheck = React.useCallback(async (region: string) => {
    // Abort any in-flight compliance check
    complianceAbortRef.current?.abort();
    const controller = new AbortController();
    complianceAbortRef.current = controller;

    setSelectedRegion(region);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/compliance/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, region }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Compliance check failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data.result);
      setMeta(data.meta);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to run compliance check');
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const getViolationCardClass = (severity: string) => {
    switch (severity) {
      case 'critical': return styles.violationCardCritical;
      case 'warning': return styles.violationCardWarning;
      default: return styles.violationCardInfo;
    }
  };

  const getViolationIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  return (
    <div className={styles.complianceSection}>
      <h2 className={styles.complianceSectionTitle}>Compliance Check</h2>
      <p className={styles.complianceSectionSubtitle}>
        Run a multi-jurisdiction compliance check against the last 90 days of transactions.
      </p>

      {/* Region selector */}
      <div className={styles.regionSelector} role="group" aria-label="Select jurisdiction">
        {COMPLIANCE_REGIONS.map((region) => (
          <button
            key={region.key}
            className={`${styles.regionButton} ${selectedRegion === region.key ? styles.regionButtonActive : ''}`}
            onClick={() => handleRunCheck(region.key)}
            disabled={loading}
            aria-pressed={selectedRegion === region.key}
          >
            {region.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <Card padding="md">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Skeleton variant="circle" width={60} height={60} />
            <div style={{ flex: 1 }}>
              <Skeleton variant="rect" width="60%" height={16} />
              <Skeleton variant="rect" width="40%" height={12} />
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className={styles.errorBanner}>
          ⚠️ {error}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className={styles.complianceResult}>
          {/* Score */}
          <Card variant="elevated" padding="md" className={styles.complianceScorePanel}>
            <Gauge
              value={result.score}
              size="md"
              color={getGaugeColor(result.score)}
              caption="Compliance"
            />
            {meta && (
              <div className={styles.complianceMeta}>
                <span className={styles.complianceMetaItem}>
                  {meta.transactionCount} txns
                </span>
                <span className={styles.complianceMetaItem}>
                  90 days
                </span>
              </div>
            )}
          </Card>

          {/* Violations */}
          <div className={styles.violationList}>
            {result.violations.length === 0 ? (
              <Card padding="md">
                <div className={styles.complianceEmpty}>
                  <div className={styles.complianceEmptyIcon}>✅</div>
                  <div className={styles.complianceEmptyText}>
                    No compliance violations found for{' '}
                    {COMPLIANCE_REGIONS.find(r => r.key === selectedRegion)?.label || selectedRegion}.
                  </div>
                </div>
              </Card>
            ) : (
              result.violations.map((v, i) => (
                <Card key={`${v.code}-${i}`} padding="sm" className={`${styles.violationCard} ${getViolationCardClass(v.severity)}`}>
                  <span className={styles.violationIcon}>{getViolationIcon(v.severity)}</span>
                  <div className={styles.violationBody}>
                    <div className={styles.violationTitle}>
                      {v.title}
                      <Badge
                        variant={getSeverityBadgeVariant(v.severity)}
                        size="sm"
                        style={{ marginLeft: 'var(--space-2)' }}
                      >
                        {v.severity}
                      </Badge>
                    </div>
                    <p className={styles.violationDescription}>{v.description}</p>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Initial state — no region selected */}
      {!selectedRegion && !loading && (
        <Card padding="md">
          <div className={styles.complianceEmpty}>
            <div className={styles.complianceEmptyIcon}>🏛️</div>
            <div className={styles.complianceEmptyText}>
              Select a jurisdiction above to run a compliance check.
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Health Dashboard Page ──────────────────────────────────────────────────

export default function HealthPage() {
  const { selectedEntity } = useEntity();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [dismissingIds, setDismissingIds] = React.useState<Set<string>>(new Set());
  const toast = useToast();
  const healthAbortRef = React.useRef<AbortController | null>(null);

  // ─── Fetch health data using shared hook ──────────────────────────────────
  const buildHealthUrl = React.useCallback(
    (entityId: string) => `/api/insights/health?entityId=${entityId}`,
    []
  );

  const {
    data,
    setData,
    isLoading,
    error,
    refetch,
  } = useEntityFetch<HealthResponse>(selectedEntity?.id, buildHealthUrl);

  // Manual refresh with cache-bust
  const fetchHealth = React.useCallback(
    async (refresh = false) => {
      if (!selectedEntity?.id) return;

      if (refresh) {
        // Abort any in-flight health refresh
        healthAbortRef.current?.abort();
        const controller = new AbortController();
        healthAbortRef.current = controller;

        setIsRefreshing(true);
        try {
          const url = `/api/insights/health?entityId=${selectedEntity.id}&refresh=true`;
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Failed to fetch health data (${res.status})`);
          }
          // After refresh, refetch via hook to update state
          await refetch();
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.error('[Health] Refresh error:', err);
        } finally {
          setIsRefreshing(false);
        }
      } else {
        await refetch();
      }
    },
    [selectedEntity, refetch]
  );

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
          toast.success('Alert dismissed');
        } else {
          toast.error('Failed to dismiss alert');
        }
      } catch (err) {
        console.error('[Health] Dismiss error:', err);
        toast.error('Network error — could not dismiss alert');
      } finally {
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }
    },
    [setData, toast]
  );

  // ─── Loading state ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell>
        <ErrorBoundary componentName="Health">
          <div className={styles.page}>
            <div className={styles.header}>
              <div className={styles.headerInfo}>
                <Skeleton variant="rect" width={250} height={32} />
              </div>
            </div>
            <div className={styles.loadingContainer}>
              <div className={styles.loadingGauge}>
                <Skeleton variant="circle" width={160} height={160} />
              </div>
              <div className={styles.loadingAlerts}>
                <Skeleton variant="rect" height={80} />
                <Skeleton variant="rect" height={80} />
                <Skeleton variant="rect" height={80} />
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </AppShell>
    );
  }

  // ─── Group alerts by severity ─────────────────────────────────────────────
  const criticalAlerts = data?.alerts.filter((a) => a.severity === 'critical') || [];
  const warningAlerts = data?.alerts.filter((a) => a.severity === 'warning') || [];
  const infoAlerts = data?.alerts.filter((a) => a.severity === 'info') || [];
  const healthScore = data?.healthScore ?? 100;
  const hasAlerts = (data?.alerts.length ?? 0) > 0;

  return (
    <AppShell>
      <ErrorBoundary componentName="Health">
        <div className={styles.page}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <h1 className={styles.title}>Financial Health</h1>
              <p className={styles.subtitle}>
                {data?.cached
                  ? 'Showing cached results from the last 24 hours'
                  : 'Freshly analyzed'}{' '}
                · {selectedEntity?.name || 'All entities'}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => fetchHealth(true)}
              disabled={isRefreshing}
              isLoading={isRefreshing}
              leftIcon={
                <span className={`${styles.refreshIcon} ${isRefreshing ? styles.refreshIconSpinning : ''}`}>
                  ↻
                </span>
              }
              aria-label="Re-scan financial health"
            >
              {isRefreshing ? 'Scanning…' : 'Re-scan'}
            </Button>
          </div>

          {/* Error banner */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          )}

          {/* Empty state */}
          {!hasAlerts && !error && (
            <div className={styles.emptyStateWrapper}>
              {!selectedEntity ? (
                <EmptyState
                  icon="🏢"
                  title="Select an entity to view health status"
                  description="Choose an entity from the sidebar to see its financial health analysis."
                />
              ) : (
                <>
                  <div className={styles.gaugeWrapper}>
                    <Gauge
                      value={healthScore}
                      size="lg"
                      color={getGaugeColor(healthScore)}
                      caption="Health Score"
                    />
                  </div>
                  <EmptyState
                    icon="✅"
                    title="Your finances look healthy!"
                    description="No anomalies detected. We'll keep monitoring and alert you if anything changes."
                  />
                </>
              )}
            </div>
          )}

          {/* Main content with score + alerts */}
          {hasAlerts && (
            <div className={styles.contentGrid}>
              {/* Score panel */}
              <Card variant="elevated" padding="md" className={styles.scorePanel}>
                <div className={styles.gaugeWrapper}>
                  <Gauge
                    value={healthScore}
                    size="lg"
                    color={getGaugeColor(healthScore)}
                    caption="Health Score"
                  />
                </div>
                <div className={styles.scoreBadges}>
                  {data && data.alertCount.critical > 0 && (
                    <Badge variant="destructive">{data.alertCount.critical} critical</Badge>
                  )}
                  {data && data.alertCount.warning > 0 && (
                    <Badge variant="warning">{data.alertCount.warning} warning</Badge>
                  )}
                  {data && data.alertCount.info > 0 && (
                    <Badge variant="info">{data.alertCount.info} info</Badge>
                  )}
                </div>
              </Card>

              {/* Alert cards */}
              <div className={styles.alertSections}>
                {/* Critical */}
                {criticalAlerts.length > 0 && (
                  <section>
                    <h3 className={`${styles.sectionHeader} ${styles.sectionHeaderCritical}`}>
                      <span className={styles.sectionIcon}>🚨</span> Critical ({criticalAlerts.length})
                    </h3>
                    <div className={styles.alertList}>
                      {criticalAlerts.map((alert) => (
                        <AlertCard
                          key={alert.id}
                          alert={alert}
                          onDismiss={handleDismiss}
                          dismissing={dismissingIds.has(alert.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Warning */}
                {warningAlerts.length > 0 && (
                  <section>
                    <h3 className={`${styles.sectionHeader} ${styles.sectionHeaderWarning}`}>
                      <span className={styles.sectionIcon}>⚠️</span> Warnings ({warningAlerts.length})
                    </h3>
                    <div className={styles.alertList}>
                      {warningAlerts.map((alert) => (
                        <AlertCard
                          key={alert.id}
                          alert={alert}
                          onDismiss={handleDismiss}
                          dismissing={dismissingIds.has(alert.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}

                {/* Info */}
                {infoAlerts.length > 0 && (
                  <section>
                    <h3 className={`${styles.sectionHeader} ${styles.sectionHeaderInfo}`}>
                      <span className={styles.sectionIcon}>ℹ️</span> Info ({infoAlerts.length})
                    </h3>
                    <div className={styles.alertList}>
                      {infoAlerts.map((alert) => (
                        <AlertCard
                          key={alert.id}
                          alert={alert}
                          onDismiss={handleDismiss}
                          dismissing={dismissingIds.has(alert.id)}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          )}

          {/* Compliance Section */}
          {selectedEntity && (
            <ComplianceSection entityId={selectedEntity.id} countryCode={selectedEntity.country} />
          )}
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}

