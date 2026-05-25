'use client';

import { useState } from 'react';
import Link from 'next/link';

type TimeRange = '7d' | '30d' | '90d' | 'ytd';

// Mock analytics data — in production, fetched from /api/analytics
const MOCK_DATA = {
  '7d': {
    totalTransactions: 47,
    autoApproved: 39,
    humanReviewed: 6,
    pending: 2,
    accuracy: 91.4,
    avgProcessingTime: 3.2,
    receiptsCaptured: 34,
    receiptsMissing: 5,
    syncedToLedger: 37,
    dailyVolume: [12, 8, 6, 5, 7, 4, 5],
    dailyLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    topCategories: [
      { name: 'Software & SaaS', code: '6110', count: 14, amount: 4280 },
      { name: 'Office Supplies', code: '6510', count: 8, amount: 890 },
      { name: 'Travel & Meals', code: '6200', count: 7, amount: 1560 },
      { name: 'Professional Services', code: '6300', count: 6, amount: 8900 },
      { name: 'Marketing', code: '6400', count: 5, amount: 3200 },
    ],
    recentExceptions: [
      { merchant: 'AMZN MKTP', amount: 89.99, confidence: 72, reason: 'Multiple GL code matches' },
      { merchant: 'GOOGLE *ADS', amount: 1200, confidence: 68, reason: 'New vendor pattern' },
      { merchant: 'UBER TRIP', amount: 34.50, confidence: 81, reason: 'Could be travel or meals' },
    ],
  },
  '30d': {
    totalTransactions: 189,
    autoApproved: 162,
    humanReviewed: 22,
    pending: 5,
    accuracy: 93.1,
    avgProcessingTime: 2.8,
    receiptsCaptured: 152,
    receiptsMissing: 14,
    syncedToLedger: 167,
    dailyVolume: [8, 6, 9, 7, 5, 3, 2, 10, 8, 7, 6, 5, 4, 3, 9, 8, 7, 6, 5, 4, 3, 8, 7, 6, 5, 4, 3, 7, 6, 5],
    dailyLabels: Array.from({ length: 30 }, (_, i) => `${i + 1}`),
    topCategories: [
      { name: 'Software & SaaS', code: '6110', count: 42, amount: 18400 },
      { name: 'Professional Services', code: '6300', count: 28, amount: 34200 },
      { name: 'Office Supplies', code: '6510', count: 24, amount: 3800 },
      { name: 'Travel & Meals', code: '6200', count: 22, amount: 6800 },
      { name: 'Advertising', code: '6400', count: 18, amount: 12500 },
    ],
    recentExceptions: [
      { merchant: 'AMZN MKTP', amount: 89.99, confidence: 72, reason: 'Multiple GL code matches' },
      { merchant: 'GOOGLE *ADS', amount: 1200, confidence: 68, reason: 'New vendor pattern' },
      { merchant: 'UBER TRIP', amount: 34.50, confidence: 81, reason: 'Could be travel or meals' },
    ],
  },
  '90d': {
    totalTransactions: 542,
    autoApproved: 498,
    humanReviewed: 38,
    pending: 6,
    accuracy: 94.7,
    avgProcessingTime: 2.4,
    receiptsCaptured: 478,
    receiptsMissing: 28,
    syncedToLedger: 510,
    dailyVolume: Array.from({ length: 90 }, () => Math.floor(Math.random() * 10) + 2),
    dailyLabels: Array.from({ length: 90 }, (_, i) => `${i + 1}`),
    topCategories: [
      { name: 'Software & SaaS', code: '6110', count: 124, amount: 52400 },
      { name: 'Professional Services', code: '6300', count: 89, amount: 98200 },
      { name: 'Payroll Expenses', code: '6100', count: 72, amount: 245000 },
      { name: 'Office Supplies', code: '6510', count: 68, amount: 12800 },
      { name: 'Travel & Meals', code: '6200', count: 54, amount: 18400 },
    ],
    recentExceptions: [
      { merchant: 'AMZN MKTP', amount: 89.99, confidence: 72, reason: 'Multiple GL code matches' },
      { merchant: 'STRIPE PAYOUT', amount: 5400, confidence: 55, reason: 'Revenue vs refund ambiguity' },
      { merchant: 'UBER TRIP', amount: 34.50, confidence: 81, reason: 'Could be travel or meals' },
    ],
  },
  'ytd': {
    totalTransactions: 1247,
    autoApproved: 1168,
    humanReviewed: 68,
    pending: 11,
    accuracy: 95.8,
    avgProcessingTime: 2.1,
    receiptsCaptured: 1102,
    receiptsMissing: 48,
    syncedToLedger: 1190,
    dailyVolume: Array.from({ length: 145 }, () => Math.floor(Math.random() * 12) + 3),
    dailyLabels: Array.from({ length: 145 }, (_, i) => `${i + 1}`),
    topCategories: [
      { name: 'Software & SaaS', code: '6110', count: 298, amount: 124800 },
      { name: 'Payroll Expenses', code: '6100', count: 245, amount: 892000 },
      { name: 'Professional Services', code: '6300', count: 189, amount: 234000 },
      { name: 'Office Supplies', code: '6510', count: 156, amount: 28400 },
      { name: 'Marketing & Ads', code: '6400', count: 112, amount: 67800 },
    ],
    recentExceptions: [
      { merchant: 'AMZN MKTP', amount: 89.99, confidence: 72, reason: 'Multiple GL code matches' },
      { merchant: 'STRIPE PAYOUT', amount: 5400, confidence: 55, reason: 'Revenue vs refund ambiguity' },
      { merchant: 'INTL WIRE 9284', amount: 12500, confidence: 42, reason: 'Unrecognized international transfer' },
    ],
  },
};

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const data = MOCK_DATA[timeRange];

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const autoRate = ((data.autoApproved / data.totalTransactions) * 100).toFixed(1);
  const maxVolume = Math.max(...data.dailyVolume);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo-icon">AK</div>
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <h1 className="text-h3" style={{ margin: 0 }}>Analytics & Reports</h1>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 24px)', maxWidth: '1100px' }}>
        {/* Time Range Selector */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 className="text-h2">Performance Overview</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([
              { id: '7d', label: '7 Days' },
              { id: '30d', label: '30 Days' },
              { id: '90d', label: '90 Days' },
              { id: 'ytd', label: 'YTD' },
            ] as { id: TimeRange; label: string }[]).map((range) => (
              <button
                key={range.id}
                className={`btn ${timeRange === range.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                onClick={() => setTimeRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div className="card-elevated" style={{ padding: '24px' }}>
            <div className="text-caption">Total Transactions</div>
            <div className="stat-value" style={{ fontSize: '2rem', margin: '8px 0 4px' }}>
              {data.totalTransactions.toLocaleString()}
            </div>
            <div className="text-caption" style={{ color: 'var(--status-success)' }}>
              {data.syncedToLedger} synced to ledger
            </div>
          </div>

          <div className="card-elevated" style={{ padding: '24px' }}>
            <div className="text-caption">AI Accuracy</div>
            <div className="stat-value" style={{
              fontSize: '2rem', margin: '8px 0 4px',
              color: data.accuracy >= 95 ? 'var(--status-success)' : data.accuracy >= 90 ? 'var(--status-warning)' : 'var(--status-danger)',
            }}>
              {data.accuracy}%
            </div>
            <div className="text-caption">
              {autoRate}% auto-approved
            </div>
          </div>

          <div className="card-elevated" style={{ padding: '24px' }}>
            <div className="text-caption">Avg Processing Time</div>
            <div className="stat-value" style={{ fontSize: '2rem', margin: '8px 0 4px' }}>
              {data.avgProcessingTime}s
            </div>
            <div className="text-caption" style={{ color: 'var(--status-success)' }}>
              Target: &lt;10s ✓
            </div>
          </div>

          <div className="card-elevated" style={{ padding: '24px' }}>
            <div className="text-caption">Receipts Captured</div>
            <div className="stat-value" style={{ fontSize: '2rem', margin: '8px 0 4px' }}>
              {((data.receiptsCaptured / (data.receiptsCaptured + data.receiptsMissing)) * 100).toFixed(0)}%
            </div>
            <div className="text-caption">
              {data.receiptsMissing} still missing
            </div>
          </div>
        </div>

        {/* Processing Pipeline */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div className="text-h4" style={{ marginBottom: '20px' }}>Processing Pipeline</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {[
              { label: 'Imported', value: data.totalTransactions, color: 'var(--accent-primary)' },
              { label: 'Auto-Approved', value: data.autoApproved, color: 'var(--status-success)' },
              { label: 'Human-Reviewed', value: data.humanReviewed, color: 'var(--status-warning)' },
              { label: 'Pending', value: data.pending, color: 'var(--status-danger)' },
            ].map((stage, i) => (
              <div key={stage.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  flex: 1, padding: '16px', borderRadius: '12px',
                  background: `${stage.color}15`,
                  border: `1px solid ${stage.color}30`,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: stage.color }}>
                    {stage.value}
                  </div>
                  <div className="text-caption">{stage.label}</div>
                </div>
                {i < 3 && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '18px', flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Two Column: Volume Chart + Top Categories */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* Volume Chart (CSS bars) */}
          <div className="card" style={{ padding: '24px' }}>
            <div className="text-h4" style={{ marginBottom: '16px' }}>Daily Transaction Volume</div>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: '2px', height: '160px',
              borderBottom: '1px solid var(--border-primary)',
              paddingBottom: '4px',
            }}>
              {data.dailyVolume.slice(-30).map((v, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${(v / maxVolume) * 100}%`,
                    minHeight: '4px',
                    background: 'var(--accent-gradient)',
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.3s ease',
                    opacity: 0.7 + (v / maxVolume) * 0.3,
                  }}
                  title={`${v} transactions`}
                />
              ))}
            </div>
            <div className="text-caption" style={{ marginTop: '8px', textAlign: 'center' }}>
              Last {Math.min(30, data.dailyVolume.length)} days
            </div>
          </div>

          {/* Top Categories */}
          <div className="card" style={{ padding: '24px' }}>
            <div className="text-h4" style={{ marginBottom: '16px' }}>Top GL Categories</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.topCategories.map((cat, i) => (
                <div key={cat.code}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="text-caption" style={{ fontWeight: 500 }}>
                      {i + 1}. {cat.name}
                    </span>
                    <span className="text-caption" style={{ fontFamily: 'var(--font-mono)' }}>
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                  <div style={{
                    height: '6px', borderRadius: '3px',
                    background: 'var(--bg-tertiary)',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: '3px',
                      background: 'var(--accent-gradient)',
                      width: `${(cat.count / data.topCategories[0].count) * 100}%`,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <div className="text-caption" style={{ marginTop: '2px' }}>
                    {cat.count} transactions
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Exceptions */}
        <div className="card" style={{ padding: '24px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="text-h4">Recent Exceptions</div>
            <Link href="/dashboard" className="btn btn-ghost btn-sm">View All →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.recentExceptions.map((ex, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: '8px',
                background: 'var(--bg-secondary)',
              }}>
                <div>
                  <span className="text-body" style={{ fontWeight: 600 }}>{ex.merchant}</span>
                  <span className="text-caption" style={{ marginLeft: '12px' }}>{ex.reason}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span className="text-body" style={{ fontFamily: 'var(--font-mono)' }}>
                    {formatCurrency(ex.amount)}
                  </span>
                  <span className={`badge ${ex.confidence >= 80 ? 'badge-warning' : 'badge-danger'}`}>
                    {ex.confidence}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Close Status */}
        <div className="card-accent" style={{ padding: '24px', marginBottom: '48px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="text-h4" style={{ marginBottom: '4px' }}>
                📊 Monthly Close Status — {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </div>
              <div className="text-body">
                {data.pending > 0
                  ? `${data.pending} transactions pending review. Resolve them to close the month.`
                  : '✅ All transactions processed! Ready to close.'}
              </div>
            </div>
            <button className="btn btn-primary btn-sm" disabled={data.pending > 0}>
              {data.pending > 0 ? `${data.pending} Pending` : 'Close Month ✓'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
