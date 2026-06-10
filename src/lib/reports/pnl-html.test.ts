import { describe, it, expect } from 'vitest';
import { renderPnLHtml } from './pnl-html';
import type { ProfitAndLossReport } from './profit-loss';

// ─── Test Data Factories ────────────────────────────────────────────────────────

function createBasicReport(overrides?: Partial<ProfitAndLossReport>): ProfitAndLossReport {
  return {
    entityName: 'Acme Corp',
    entityCurrency: 'USD',
    periodStart: '2026-01-01',
    periodEnd: '2026-03-31',
    generatedAt: '2026-04-01T12:00:00.000Z',
    revenue: [
      { code: '4000', name: 'Service Revenue', amount: 50000, type: 'revenue' },
      { code: '4100', name: 'Product Sales', amount: 25000, type: 'revenue' },
    ],
    totalRevenue: 75000,
    expenses: [
      { code: '5000', name: 'Salaries', amount: 30000, type: 'expense' },
      { code: '5100', name: 'Rent', amount: 5000, type: 'expense' },
      { code: '5200', name: 'Utilities', amount: 1500, type: 'expense' },
    ],
    totalExpenses: 36500,
    netIncome: 38500,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('pnl-html - renderPnLHtml', () => {
  // ── Basic Structure ─────────────────────────────────────────────────

  describe('HTML document structure', () => {
    it('returns a valid HTML document with DOCTYPE', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('includes charset and viewport meta tags', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
    });

    it('includes the entity name in the title', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('<title>Profit &amp; Loss Statement — Acme Corp</title>');
    });

    it('includes Autokkeep footer', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Autokkeep — AI-Powered Bookkeeping');
    });
  });

  // ── Entity Name & Period ──────────────────────────────────────────────

  describe('header content', () => {
    it('displays the entity name in the header', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Acme Corp');
    });

    it('displays the period date range', () => {
      const html = renderPnLHtml(createBasicReport());
      // Formatted as "Month Day, Year"
      expect(html).toContain('January');
      expect(html).toContain('2026');
      expect(html).toContain('March');
    });

    it('displays the generated date', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('April');
    });
  });

  // ── Revenue Section ───────────────────────────────────────────────────

  describe('revenue section', () => {
    it('includes REVENUE section header', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('REVENUE');
    });

    it('renders all revenue line items', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Service Revenue');
      expect(html).toContain('Product Sales');
      expect(html).toContain('4000');
      expect(html).toContain('4100');
    });

    it('shows Total Revenue with formatted amount', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Total Revenue');
      expect(html).toContain('$75,000.00');
    });
  });

  // ── Expense Section ───────────────────────────────────────────────────

  describe('expense section', () => {
    it('includes EXPENSES section header', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('EXPENSES');
    });

    it('renders all expense line items', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Salaries');
      expect(html).toContain('Rent');
      expect(html).toContain('Utilities');
    });

    it('shows Total Expenses with formatted amount', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('Total Expenses');
      expect(html).toContain('$36,500.00');
    });
  });

  // ── Net Income ────────────────────────────────────────────────────────

  describe('net income', () => {
    it('shows NET INCOME label', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('NET INCOME');
    });

    it('formats positive net income with green color', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('$38,500.00');
      expect(html).toContain('#16a34a'); // Green color
    });

    it('formats negative net income with red color', () => {
      const html = renderPnLHtml(createBasicReport({
        netIncome: -5000,
      }));
      expect(html).toContain('-$5,000.00');
      expect(html).toContain('#dc2626'); // Red color
    });

    it('formats zero net income with green color', () => {
      const html = renderPnLHtml(createBasicReport({
        netIncome: 0,
      }));
      expect(html).toContain('$0.00');
      expect(html).toContain('#16a34a');
    });
  });

  // ── Currency Formatting ───────────────────────────────────────────────

  describe('currency formatting', () => {
    it('uses $ symbol for USD', () => {
      const html = renderPnLHtml(createBasicReport({ entityCurrency: 'USD' }));
      expect(html).toContain('$50,000.00');
    });

    it('uses € symbol for EUR', () => {
      const html = renderPnLHtml(createBasicReport({ entityCurrency: 'EUR' }));
      expect(html).toContain('€50,000.00');
    });

    it('uses £ symbol for GBP', () => {
      const html = renderPnLHtml(createBasicReport({ entityCurrency: 'GBP' }));
      expect(html).toContain('£50,000.00');
    });

    it('uses C$ for CAD', () => {
      const html = renderPnLHtml(createBasicReport({ entityCurrency: 'CAD' }));
      expect(html).toContain('C$50,000.00');
    });

    it('falls back to currency code for unknown currencies', () => {
      const html = renderPnLHtml(createBasicReport({ entityCurrency: 'BRL' }));
      expect(html).toContain('BRL 50,000.00');
    });

    it('formats negative amounts with minus sign before symbol', () => {
      const html = renderPnLHtml(createBasicReport({
        netIncome: -1234.56,
      }));
      expect(html).toContain('-$1,234.56');
    });

    it('includes currency in footer text', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).toContain('All amounts are in USD');
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles empty revenue and expense arrays', () => {
      const html = renderPnLHtml(createBasicReport({
        revenue: [],
        totalRevenue: 0,
        expenses: [],
        totalExpenses: 0,
        netIncome: 0,
      }));
      expect(html).toContain('REVENUE');
      expect(html).toContain('EXPENSES');
      expect(html).toContain('$0.00');
    });

    it('handles zero-value line items', () => {
      const html = renderPnLHtml(createBasicReport({
        revenue: [{ code: '4000', name: 'Zero Revenue', amount: 0, type: 'revenue' }],
        totalRevenue: 0,
      }));
      expect(html).toContain('Zero Revenue');
      expect(html).toContain('$0.00');
    });

    it('handles very large amounts', () => {
      const html = renderPnLHtml(createBasicReport({
        totalRevenue: 1234567890.12,
        netIncome: 1234567890.12,
      }));
      expect(html).toContain('$1,234,567,890.12');
    });

    it('handles decimal precision correctly', () => {
      const html = renderPnLHtml(createBasicReport({
        revenue: [{ code: '4000', name: 'Decimal Test', amount: 0.10, type: 'revenue' }],
      }));
      expect(html).toContain('$0.10');
    });
  });

  // ── HTML Escaping ─────────────────────────────────────────────────────

  describe('HTML escaping', () => {
    it('escapes entity name with special characters', () => {
      const html = renderPnLHtml(createBasicReport({
        entityName: 'Tom & Jerry <Corp>',
      }));
      expect(html).toContain('Tom &amp; Jerry &lt;Corp&gt;');
    });

    it('escapes account names with HTML characters', () => {
      const html = renderPnLHtml(createBasicReport({
        revenue: [
          { code: '4000', name: 'Revenue <script>alert("xss")</script>', amount: 100, type: 'revenue' },
        ],
      }));
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('escapes account codes with special characters', () => {
      const html = renderPnLHtml(createBasicReport({
        revenue: [
          { code: '40&00', name: 'Test', amount: 100, type: 'revenue' },
        ],
      }));
      expect(html).toContain('40&amp;00');
    });

    it('escapes currency code in footer', () => {
      const html = renderPnLHtml(createBasicReport({
        entityCurrency: 'A&B',
      }));
      expect(html).toContain('A&amp;B');
    });
  });

  // ── Comparison Period ─────────────────────────────────────────────────

  describe('comparison period', () => {
    const reportWithComparison = createBasicReport({
      comparisonPeriod: {
        periodStart: '2025-10-01',
        periodEnd: '2025-12-31',
        totalRevenue: 60000,
        totalExpenses: 30000,
        netIncome: 30000,
      },
    });

    it('includes comparison headers when comparison data is present', () => {
      const html = renderPnLHtml(reportWithComparison);
      expect(html).toContain('Previous Period');
      expect(html).toContain('% Change');
    });

    it('shows comparison period dates', () => {
      const html = renderPnLHtml(reportWithComparison);
      expect(html).toContain('Compared with');
      expect(html).toContain('October');
      expect(html).toContain('December');
    });

    it('shows revenue percent change', () => {
      const html = renderPnLHtml(reportWithComparison);
      // (75000 - 60000) / 60000 * 100 = +25.0%
      expect(html).toContain('+25.0%');
    });

    it('does NOT show comparison columns when no comparison data', () => {
      const html = renderPnLHtml(createBasicReport());
      expect(html).not.toContain('Previous Period');
      expect(html).not.toContain('% Change');
    });

    it('handles comparison with zero previous revenue', () => {
      const html = renderPnLHtml(createBasicReport({
        comparisonPeriod: {
          periodStart: '2025-10-01',
          periodEnd: '2025-12-31',
          totalRevenue: 0,
          totalExpenses: 0,
          netIncome: 0,
        },
      }));
      // Current revenue 75000, previous 0 → +∞%
      expect(html).toContain('+∞%');
    });

    it('handles comparison where both periods are zero', () => {
      const html = renderPnLHtml(createBasicReport({
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        comparisonPeriod: {
          periodStart: '2025-10-01',
          periodEnd: '2025-12-31',
          totalRevenue: 0,
          totalExpenses: 0,
          netIncome: 0,
        },
      }));
      expect(html).toContain('—');
    });
  });
});
