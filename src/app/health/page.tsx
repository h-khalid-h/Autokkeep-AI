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

// ─── Health Dashboard Page ──────────────────────────────────────────────────

export default function HealthPage() {
  const { selectedEntity } = useEntity();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [dismissingIds, setDismissingIds] = React.useState<Set<string>>(new Set());
  const toast = useToast();

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
        setIsRefreshing(true);
        try {
          const url = `/api/insights/health?entityId=${selectedEntity.id}&refresh=true`;
          const res = await fetch(url);
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Failed to fetch health data (${res.status})`);
          }
          // After refresh, refetch via hook to update state
          await refetch();
        } catch (err) {
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
              ⚠️ {error}
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
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
