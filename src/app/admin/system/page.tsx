'use client';

import React from 'react';
import AppShell from '@/components/layout/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Card, Badge, Skeleton, EmptyState } from '@/components/ui';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SystemData {
  uptime: number;
  timestamp: string;
  database: { status: string; latencyMs: number };
  redis: { status: string };
  cron: { lastTransactionSync: string | null };
  audit: { actionsLast24h: number };
  environment: { group: string; vars: { name: string; set: boolean }[] }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function statusIcon(status: string) {
  switch (status) {
    case 'healthy':
    case 'connected':
      return '✅';
    case 'degraded':
    case 'disconnected':
      return '⚠️';
    case 'unhealthy':
      return '❌';
    case 'not_configured':
      return '➖';
    default:
      return '❓';
  }
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function AdminSystemPage() {
  const [data, setData] = React.useState<SystemData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function fetchSystem() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/system');
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchSystem();
    return () => { cancelled = true; };
  }, []);

  return (
    <ErrorBoundary componentName="Admin System">
    <AppShell>
      <div className={styles.page}>
        <div>
          <h1 className={styles.pageTitle}>⚙️ System Health</h1>
          <p className={styles.pageDescription}>
            Monitor service health, environment configuration, and system status.
          </p>
        </div>

        {error && (
          <Card className={styles.errorBanner} padding="sm">
            <span className={styles.errorText}>⚠️ {error}</span>
          </Card>
        )}

        {loading ? (
          <div className={styles.skeletonStack}>
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <div className={styles.skeletonCardInner}>
                  <Skeleton width="40%" height={24} />
                  <Skeleton width="80%" />
                  <Skeleton width="60%" />
                </div>
              </Card>
            ))}
          </div>
        ) : data ? (
          <>
            {/* Health Overview */}
            <Card variant="elevated">
              <h2 className={styles.sectionTitle}>Service Health</h2>
              <div className={styles.healthGrid}>
                <Card className={styles.healthItem} padding="sm">
                  <div className={styles.healthIcon}>
                    {statusIcon(data.database.status)}
                  </div>
                  <div className={styles.healthLabel}>Database</div>
                  <div className={styles.healthCaption}>{data.database.latencyMs}ms</div>
                </Card>
                <Card className={styles.healthItem} padding="sm">
                  <div className={styles.healthIcon}>
                    {statusIcon(data.redis.status)}
                  </div>
                  <div className={styles.healthLabel}>Redis</div>
                  <div className={styles.healthCaption}>{data.redis.status}</div>
                </Card>
                <Card className={styles.healthItem} padding="sm">
                  <div className={styles.healthIcon}>⏱️</div>
                  <div className={styles.healthLabel}>Uptime</div>
                  <div className={styles.healthCaption}>{formatUptime(data.uptime)}</div>
                </Card>
                <Card className={styles.healthItem} padding="sm">
                  <div className={styles.healthIcon}>📝</div>
                  <div className={styles.healthLabel}>Audit (24h)</div>
                  <div className={styles.healthCaption}>{formatNumber(data.audit.actionsLast24h)} actions</div>
                </Card>
              </div>
            </Card>

            {/* Cron Status */}
            <Card>
              <h2 className={styles.sectionTitle}>Cron / Sync Status</h2>
              <div className={styles.cronRow}>
                <div>
                  <div className={styles.cronLabel}>Last Transaction Sync</div>
                  <div className={styles.cronValue}>
                    {data.cron.lastTransactionSync
                      ? new Date(data.cron.lastTransactionSync).toLocaleString()
                      : 'No sync activity recorded'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Environment Variables */}
            <Card>
              <h2 className={styles.sectionTitle}>Environment Configuration</h2>
              <div className={styles.envGroups}>
                {data.environment.map((group) => {
                  const setCount = group.vars.filter((v) => v.set).length;
                  const totalCount = group.vars.length;
                  const allSet = setCount === totalCount;

                  return (
                    <div key={group.group}>
                      <div className={styles.envGroupHeader}>
                        <span>{allSet ? '✅' : '⚠️'}</span>
                        <span className={styles.envGroupName}>{group.group}</span>
                        <span className={styles.envGroupCount}>
                          ({setCount}/{totalCount})
                        </span>
                      </div>
                      <div className={styles.envVars}>
                        {group.vars.map((v) => (
                          <Badge
                            key={v.name}
                            variant={v.set ? 'success' : 'destructive'}
                            size="sm"
                          >
                            {v.set ? '✓' : '✗'} {v.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Server Info */}
            <Card>
              <h2 className={styles.sectionTitle}>Server Info</h2>
              <div className={styles.serverGrid}>
                <div>
                  <div className={styles.serverLabel}>Timestamp</div>
                  <div className={styles.serverValue}>{new Date(data.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <div className={styles.serverLabel}>Runtime</div>
                  <div className={styles.serverValue}>Node.js (Next.js)</div>
                </div>
              </div>
            </Card>
          </>
        ) : (
          <EmptyState
            icon="⚠️"
            title="Failed to load system status"
            description="Unable to retrieve system health data. Please try again later."
          />
        )}
      </div>
    </AppShell>
    </ErrorBoundary>
  );
}
