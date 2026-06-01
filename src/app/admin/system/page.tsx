'use client';

import React from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';

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

function Skeleton({ width, height = '20px' }: { width?: string; height?: string }) {
  return (
    <div
      style={{
        width: width || '100%',
        height,
        borderRadius: '6px',
        background: 'var(--bg-elevated)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
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
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/admin" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <Logo size={32} />
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-warning" style={{ fontSize: '11px' }}>ADMIN</span>
        </div>
        <Link href="/admin" className="btn btn-ghost btn-sm">
          ← Back to Admin
        </Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 32px)', maxWidth: '1100px' }}>
        <h1 className="text-h2" style={{ marginBottom: '32px' }}>
          ⚙️ System Health
        </h1>

        {error && (
          <div className="card" style={{
            padding: '16px',
            marginBottom: '24px',
            borderLeft: '4px solid var(--destructive)',
          }}>
            <div className="text-body" style={{ color: 'var(--destructive)' }}>
              ⚠️ {error}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ padding: '24px' }}>
                <Skeleton width="40%" height="24px" />
                <div style={{ marginTop: '12px' }}><Skeleton width="80%" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton width="60%" /></div>
              </div>
            ))}
          </div>
        ) : data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Health Overview */}
            <div className="card-elevated" style={{ padding: '24px' }}>
              <div className="text-h4" style={{ marginBottom: '16px' }}>Service Health</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
                    {statusIcon(data.database.status)}
                  </div>
                  <div className="text-h4">Database</div>
                  <div className="text-caption">{data.database.latencyMs}ms</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>
                    {statusIcon(data.redis.status)}
                  </div>
                  <div className="text-h4">Redis</div>
                  <div className="text-caption">{data.redis.status}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>⏱️</div>
                  <div className="text-h4">Uptime</div>
                  <div className="text-caption">{formatUptime(data.uptime)}</div>
                </div>
                <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>📝</div>
                  <div className="text-h4">Audit (24h)</div>
                  <div className="text-caption">{formatNumber(data.audit.actionsLast24h)} actions</div>
                </div>
              </div>
            </div>

            {/* Cron Status */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="text-h4" style={{ marginBottom: '16px' }}>Cron / Sync Status</div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div>
                  <div className="text-caption" style={{ marginBottom: '4px' }}>Last Transaction Sync</div>
                  <div className="text-body">
                    {data.cron.lastTransactionSync
                      ? new Date(data.cron.lastTransactionSync).toLocaleString()
                      : 'No sync activity recorded'}
                  </div>
                </div>
              </div>
            </div>

            {/* Environment Variables */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="text-h4" style={{ marginBottom: '16px' }}>Environment Configuration</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {data.environment.map((group) => {
                  const setCount = group.vars.filter((v) => v.set).length;
                  const totalCount = group.vars.length;
                  const allSet = setCount === totalCount;

                  return (
                    <div key={group.group}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span>{allSet ? '✅' : '⚠️'}</span>
                        <span className="text-h4" style={{ fontSize: '14px' }}>
                          {group.group}
                        </span>
                        <span className="text-caption">
                          ({setCount}/{totalCount})
                        </span>
                      </div>
                      <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        paddingLeft: '28px',
                      }}>
                        {group.vars.map((v) => (
                          <span
                            key={v.name}
                            style={{
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontFamily: 'var(--font-mono, monospace)',
                              background: v.set
                                ? 'var(--success-subtle)'
                                : 'var(--destructive-subtle)',
                              color: v.set ? 'var(--success)' : 'var(--destructive)',
                              border: `1px solid ${v.set ? 'var(--success-border)' : 'var(--destructive-border)'}`,
                            }}
                          >
                            {v.set ? '✓' : '✗'} {v.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Server Info */}
            <div className="card" style={{ padding: '24px' }}>
              <div className="text-h4" style={{ marginBottom: '12px' }}>Server Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="text-caption">Timestamp</div>
                  <div className="text-body">{new Date(data.timestamp).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-caption">Runtime</div>
                  <div className="text-body">Node.js (Next.js)</div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <div className="text-caption">Failed to load system status</div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
