'use client';

import React from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { formatCurrency } from '@/lib/currency/converter';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeductionCategory {
  category: string;
  amount: number;
  count: number;
}

interface MissingReceipt {
  id: string;
  merchant: string;
  amount: number;
  date: string;
}

interface TaxReadinessReport {
  entityId: string;
  taxYear: number;
  totalExpenses: number;
  totalDeductible: number;
  estimatedSavings: number;
  deductionsByCategory: DeductionCategory[];
  missingReceipts: MissingReceipt[];
  readinessScore: number;
  recommendations: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--success)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--destructive)';
}

// formatCurrency is now imported from @/lib/currency/converter
// and accepts (amount, currencyCode) for entity-aware formatting

// ─── Readiness Score Gauge ──────────────────────────────────────────────────

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
          Tax Ready
        </text>
        <text
          x="60"
          y="82"
          textAnchor="middle"
          fill={score >= 80 ? 'var(--success)' : 'var(--text-tertiary)'}
          fontSize="10"
          fontWeight="600"
        >
          {score >= 80 ? 'READY' : 'NEEDS WORK'}
        </text>
      </svg>
    </div>
  );
}

// ─── Deduction Bar Chart ────────────────────────────────────────────────────

function DeductionBarChart({ categories, currency }: { categories: DeductionCategory[]; currency: string }) {
  if (categories.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-tertiary)' }}>
        No deductible expenses found
      </div>
    );
  }

  const maxAmount = Math.max(...categories.map(c => c.amount));
  const barColors = [
    'var(--accent-primary)',
    'var(--success)',
    '#8b5cf6',
    '#ec4899',
    '#f59e0b',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
    '#14b8a6',
    '#e11d48',
    '#a855f7',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {categories.slice(0, 10).map((cat, i) => {
        const barWidth = maxAmount > 0 ? (cat.amount / maxAmount) * 100 : 0;
        const color = barColors[i % barColors.length];

        return (
          <div key={cat.category}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--space-1)',
              }}
            >
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-primary)',
                  fontWeight: 500,
                }}
              >
                {cat.category}
              </span>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}
              >
                {formatCurrency(cat.amount, currency)} ({cat.count})
              </span>
            </div>
            <svg width="100%" height="8" style={{ display: 'block' }}>
              <rect
                x="0"
                y="0"
                width="100%"
                height="8"
                rx="4"
                fill="var(--border-primary)"
              />
              <rect
                x="0"
                y="0"
                width={`${barWidth}%`}
                height="8"
                rx="4"
                fill={color}
                style={{ transition: 'width 0.8s ease-out' }}
              />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tax Dashboard Page ─────────────────────────────────────────────────────

export default function TaxPage() {
  const { selectedEntity } = useEntity();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = React.useState(currentYear);
  const [data, setData] = React.useState<TaxReadinessReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // ─── Fetch tax readiness report ──────────────────────────────────────────
  React.useEffect(() => {
    if (!selectedEntity?.id) return;

    const controller = new AbortController();
    const doFetch = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/tax/readiness?entityId=${selectedEntity.id}&taxYear=${selectedYear}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch tax data (${res.status})`);
        }

        const result = await res.json();
        setData(result.report);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('[Tax] Fetch error:', err);
          setError(err instanceof Error ? err.message : 'Failed to load tax data');
        }
      } finally {
        setIsLoading(false);
      }
    };

    doFetch();
    return () => controller.abort();
  }, [selectedEntity, selectedYear]);

  // ─── Loading state ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary componentName="Tax">
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

  return (
    <ErrorBoundary componentName="Tax">
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
            Tax Readiness
          </h1>
          <p className="text-caption" style={{ marginTop: 'var(--space-1)' }}>
            AI-powered tax deduction analysis for {selectedEntity?.name || 'your entity'}
          </p>
        </div>

        {/* Tax Year Selector */}
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
            htmlFor="tax-year-select"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            Tax Year:
          </label>
          <select
            id="tax-year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="input"
            aria-label="Tax year"
            style={{ width: 'auto', minWidth: '120px' }}
          >
            {yearOptions.map((y) => (
              <option
                key={y}
                value={y}
                style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              // placeholder export
              alert('Export functionality will generate a tax-ready CSV/PDF report for your accountant.');
            }}
            className="btn btn-secondary"
            aria-label="Export tax report for accountant"
            style={{ marginLeft: 'auto' }}
          >
            📤 Export for Accountant
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
        {!data && !error && (
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
              Select an entity and tax year to analyze
            </h2>
            <p className="text-caption">
              Choose a tax year above to see your deduction breakdown, missing receipts, and estimated savings.
            </p>
          </div>
        )}

        {/* Report content */}
        {data && (
          <>
            {/* Summary cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 'var(--space-4)',
                marginBottom: 'var(--space-6)',
              }}
            >
              <div className="card-elevated" style={{ textAlign: 'center' }}>
                <p className="text-caption" style={{ marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Total Expenses
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0 }}>
                  {formatCurrency(data.totalExpenses, selectedEntity?.currency || 'USD')}
                </p>
              </div>
              <div className="card-elevated" style={{ textAlign: 'center' }}>
                <p className="text-caption" style={{ marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Deductible
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0, color: 'var(--success)' }}>
                  {formatCurrency(data.totalDeductible, selectedEntity?.currency || 'USD')}
                </p>
              </div>
              <div className="card-elevated" style={{ textAlign: 'center' }}>
                <p className="text-caption" style={{ marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)' }}>
                  Est. Tax Savings
                </p>
                <p style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-mono)', margin: 0, color: 'var(--accent-primary)' }}>
                  {formatCurrency(data.estimatedSavings, selectedEntity?.currency || 'USD')}
                </p>
              </div>
              <div className="card-elevated" style={{ textAlign: 'center' }}>
                <p className="text-caption" style={{ marginBottom: 'var(--space-1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Missing Receipts
                </p>
                <p style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  margin: 0,
                  color: data.missingReceipts.length > 0 ? 'var(--warning)' : 'var(--success)',
                }}>
                  {data.missingReceipts.length}
                </p>
              </div>
            </div>

            {/* Main 2-column layout */}
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
                <ReadinessGauge score={data.readinessScore} />
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <p
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.8125rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {data.readinessScore >= 80
                      ? 'Records are tax-ready'
                      : data.readinessScore >= 60
                        ? 'Some items need attention'
                        : 'Significant gaps found'}
                  </p>
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      fontSize: '0.75rem',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    Tax Year {data.taxYear}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {/* Deduction Breakdown */}
                <section>
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 600,
                      margin: 0,
                      marginBottom: 'var(--space-4)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    💰 Deduction Breakdown by Category
                  </h3>
                  <div className="card-elevated">
                    <DeductionBarChart categories={data.deductionsByCategory} currency={selectedEntity?.currency || 'USD'} />
                  </div>
                </section>

                {/* Missing Receipts */}
                {data.missingReceipts.length > 0 && (
                  <section>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        margin: 0,
                        marginBottom: 'var(--space-4)',
                        color: 'var(--warning)',
                      }}
                    >
                      🧾 Missing Receipts ({data.missingReceipts.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {data.missingReceipts.slice(0, 20).map((receipt) => (
                        <div
                          key={receipt.id}
                          style={{
                            background: 'var(--warning-subtle)',
                            border: '1px solid var(--warning-border)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-3) var(--space-4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 'var(--space-3)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                            <span style={{ fontSize: '16px', flexShrink: 0 }}>🧾</span>
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {receipt.merchant}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-tertiary)',
                                }}
                              >
                                {new Date(receipt.date).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}
                            >
                              {formatCurrency(receipt.amount, selectedEntity?.currency || 'USD')}
                            </span>
                            <a
                              href={`/transactions?search=${encodeURIComponent(receipt.merchant)}`}
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.75rem', textDecoration: 'none' }}
                            >
                              View →
                            </a>
                          </div>
                        </div>
                      ))}
                      {data.missingReceipts.length > 20 && (
                        <p className="text-caption" style={{ textAlign: 'center', marginTop: 'var(--space-2)' }}>
                          …and {data.missingReceipts.length - 20} more
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {/* Recommendations */}
                {data.recommendations.length > 0 && (
                  <section>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        margin: 0,
                        marginBottom: 'var(--space-4)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      💡 Recommendations
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      {data.recommendations.map((rec, i) => (
                        <div
                          key={i}
                          style={{
                            background: 'var(--info-subtle)',
                            border: '1px solid rgba(30, 111, 255, 0.25)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--space-3) var(--space-5)',
                            fontSize: '0.8125rem',
                            lineHeight: 1.6,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {rec}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @media (max-width: 768px) {
            div[style*="grid-template-columns: 220px"] {
              grid-template-columns: 1fr !important;
            }
            div[style*="grid-template-columns: repeat(4"] {
              grid-template-columns: repeat(2, 1fr) !important;
            }
          }
        `}</style>
      </div>
    </ErrorBoundary>
  );
}
