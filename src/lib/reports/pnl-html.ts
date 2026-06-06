// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — P&L HTML Renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Renders a ProfitAndLossReport into a standalone HTML string with inline CSS.
// Suitable for PDF generation, email embedding, or direct browser display.

import type { ProfitAndLossReport, PnLLineItem } from './profit-loss';

// ─── Formatting Helpers ─────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$',
    JPY: '¥', CHF: 'CHF ', AED: 'AED ', SAR: 'SAR ',
  };
  const sym = symbols[currency] || `${currency} `;
  return `${sign}${sym}${abs}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPeriod(start: string, end: string): string {
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function percentChange(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? '—' : '+∞%';
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── HTML Generation ────────────────────────────────────────────────────────────

function renderLineItemRows(
  items: PnLLineItem[],
  currency: string,
  hasComparison: boolean
): string {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; color: #555; font-size: 13px;">${escapeHtml(item.code)}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee;">${escapeHtml(item.name)}</td>
          <td style="padding: 6px 12px; border-bottom: 1px solid #eee; text-align: right; font-family: 'Courier New', monospace;">${formatCurrency(item.amount, currency)}</td>
          ${hasComparison ? '<td style="padding: 6px 12px; border-bottom: 1px solid #eee;"></td><td style="padding: 6px 12px; border-bottom: 1px solid #eee;"></td>' : ''}
        </tr>`
    )
    .join('\n');
}

/**
 * Renders a ProfitAndLossReport as a standalone HTML document string.
 * Uses only inline CSS for maximum compatibility with PDF renderers.
 */
export function renderPnLHtml(report: ProfitAndLossReport): string {
  const { entityName, entityCurrency: currency, periodStart, periodEnd, generatedAt } = report;
  const hasComparison = !!report.comparisonPeriod;

  const colCount = hasComparison ? 5 : 3;

  const comparisonHeaders = hasComparison
    ? `
        <th style="padding: 8px 12px; text-align: right; font-weight: 600; color: #666; border-bottom: 2px solid #333;">Previous Period</th>
        <th style="padding: 8px 12px; text-align: right; font-weight: 600; color: #666; border-bottom: 2px solid #333;">% Change</th>`
    : '';

  // ── Revenue Section ─────────────────────────────────────────────────────────
  const revenueRows = renderLineItemRows(report.revenue, currency, hasComparison);

  const revenueTotalComparison = hasComparison
    ? `
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.comparisonPeriod!.totalRevenue, currency)}</td>
        <td style="padding: 8px 12px; text-align: right; border-top: 1px solid #999; font-weight: 600; color: ${report.totalRevenue >= report.comparisonPeriod!.totalRevenue ? '#16a34a' : '#dc2626'};">${percentChange(report.totalRevenue, report.comparisonPeriod!.totalRevenue)}</td>`
    : '';

  // ── Expense Section ─────────────────────────────────────────────────────────
  const expenseRows = renderLineItemRows(report.expenses, currency, hasComparison);

  const expenseTotalComparison = hasComparison
    ? `
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.comparisonPeriod!.totalExpenses, currency)}</td>
        <td style="padding: 8px 12px; text-align: right; border-top: 1px solid #999; font-weight: 600; color: ${report.totalExpenses <= report.comparisonPeriod!.totalExpenses ? '#16a34a' : '#dc2626'};">${percentChange(report.totalExpenses, report.comparisonPeriod!.totalExpenses)}</td>`
    : '';

  // ── Net Income ──────────────────────────────────────────────────────────────
  const netIncomeColor = report.netIncome >= 0 ? '#16a34a' : '#dc2626';

  const netIncomeComparison = hasComparison
    ? `
        <td style="padding: 10px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 3px double #333; font-weight: 700; font-size: 15px;">${formatCurrency(report.comparisonPeriod!.netIncome, currency)}</td>
        <td style="padding: 10px 12px; text-align: right; border-top: 3px double #333; font-weight: 700; font-size: 15px; color: ${report.netIncome >= report.comparisonPeriod!.netIncome ? '#16a34a' : '#dc2626'};">${percentChange(report.netIncome, report.comparisonPeriod!.netIncome)}</td>`
    : '';

  // ── Comparison Period Subtitle ──────────────────────────────────────────────
  const comparisonSubtitle = hasComparison
    ? `<p style="margin: 4px 0 0; font-size: 12px; color: #888;">Compared with: ${formatPeriod(report.comparisonPeriod!.periodStart, report.comparisonPeriod!.periodEnd)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profit &amp; Loss Statement — ${escapeHtml(entityName)}</title>
</head>
<body style="margin: 0; padding: 40px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; line-height: 1.5;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 32px; border-bottom: 2px solid #333; padding-bottom: 20px;">
    <h1 style="margin: 0 0 4px; font-size: 22px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">${escapeHtml(entityName)}</h1>
    <h2 style="margin: 0 0 8px; font-size: 16px; font-weight: 400; color: #555;">Profit &amp; Loss Statement</h2>
    <p style="margin: 0; font-size: 13px; color: #777;">For the period ${formatPeriod(periodStart, periodEnd)}</p>
    ${comparisonSubtitle}
    <p style="margin: 8px 0 0; font-size: 11px; color: #999;">Generated on ${formatDate(generatedAt)}</p>
  </div>

  <!-- P&L Table -->
  <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
    <thead>
      <tr style="background: #f8f9fa;">
        <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #666; border-bottom: 2px solid #333; width: 80px;">Code</th>
        <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #666; border-bottom: 2px solid #333;">Account</th>
        <th style="padding: 8px 12px; text-align: right; font-weight: 600; color: #666; border-bottom: 2px solid #333; width: 140px;">Amount</th>
        ${comparisonHeaders}
      </tr>
    </thead>
    <tbody>
      <!-- Revenue Section Header -->
      <tr>
        <td colspan="${colCount}" style="padding: 14px 12px 6px; font-weight: 700; font-size: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; background: #f0fdf4;">REVENUE</td>
      </tr>
      ${revenueRows}
      <!-- Revenue Total -->
      <tr style="background: #f8f9fa;">
        <td style="padding: 8px 12px; border-top: 1px solid #999;"></td>
        <td style="padding: 8px 12px; font-weight: 700; border-top: 1px solid #999;">Total Revenue</td>
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.totalRevenue, currency)}</td>
        ${revenueTotalComparison}
      </tr>

      <!-- Spacer -->
      <tr><td colspan="${colCount}" style="padding: 8px;"></td></tr>

      <!-- Expense Section Header -->
      <tr>
        <td colspan="${colCount}" style="padding: 14px 12px 6px; font-weight: 700; font-size: 15px; color: #1a1a1a; border-bottom: 1px solid #ddd; background: #fef2f2;">EXPENSES</td>
      </tr>
      ${expenseRows}
      <!-- Expense Total -->
      <tr style="background: #f8f9fa;">
        <td style="padding: 8px 12px; border-top: 1px solid #999;"></td>
        <td style="padding: 8px 12px; font-weight: 700; border-top: 1px solid #999;">Total Expenses</td>
        <td style="padding: 8px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 1px solid #999; font-weight: 700;">${formatCurrency(report.totalExpenses, currency)}</td>
        ${expenseTotalComparison}
      </tr>

      <!-- Spacer -->
      <tr><td colspan="${colCount}" style="padding: 8px;"></td></tr>

      <!-- Net Income -->
      <tr style="background: #fafafa;">
        <td style="padding: 10px 12px; border-top: 3px double #333;"></td>
        <td style="padding: 10px 12px; font-weight: 700; font-size: 15px; border-top: 3px double #333;">NET INCOME</td>
        <td style="padding: 10px 12px; text-align: right; font-family: 'Courier New', monospace; border-top: 3px double #333; font-weight: 700; font-size: 15px; color: ${netIncomeColor};">${formatCurrency(report.netIncome, currency)}</td>
        ${netIncomeComparison}
      </tr>
    </tbody>
  </table>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999;">
    <p style="margin: 0;">Autokkeep — AI-Powered Bookkeeping</p>
    <p style="margin: 4px 0 0;">This report was generated automatically. All amounts are in ${escapeHtml(currency)}.</p>
  </div>

</body>
</html>`;
}
