// ============================================
// CHART DATA HELPERS
// Transform API data → chart-ready formats
// ============================================

/**
 * Curated chart color palette — vibrant but harmonious.
 * Designed for both light and dark backgrounds.
 */
const CHART_COLORS = [
  '#6366F1', // Indigo
  '#06B6D4', // Cyan
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#8B5CF6', // Violet
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#EF4444', // Red
  '#3B82F6', // Blue
] as const;

export function getChartColorPalette(): readonly string[] {
  return CHART_COLORS;
}

/**
 * Get a single color from the palette by index (wraps around).
 */
export function getChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// ─── Trend Data ─────────────────────────────────────────────────────────────

export interface TrendDataPoint {
  month: string;
  income: number;
  expenses: number;
}

interface MonthlyVolume {
  month?: string;
  period?: string;
  label?: string;
  income?: number;
  revenue?: number;
  expenses?: number;
  spending?: number;
}

/**
 * Transform monthly stats from the API into the format
 * expected by SpendingTrendChart and CashFlowBarChart.
 */
export function transformStatsToTrendData(
  monthlyData: MonthlyVolume[]
): Array<TrendDataPoint & { net: number }> {
  if (!monthlyData || monthlyData.length === 0) return [];

  return monthlyData.map((item) => {
    const income = item.income ?? item.revenue ?? 0;
    const expenses = item.expenses ?? item.spending ?? 0;
    return {
      month: item.month ?? item.period ?? item.label ?? '',
      income,
      expenses,
      net: income - expenses,
    };
  });
}

// ─── Donut / Category Data ──────────────────────────────────────────────────

export interface DonutDataPoint {
  name: string;
  value: number;
  code: string;
}

interface CategoryEntry {
  code?: string;
  category_code?: string;
  amount?: number;
  total?: number;
  value?: number;
}

interface ChartOfAccountEntry {
  code: string;
  name?: string;
  label?: string;
  description?: string;
}

/**
 * Map raw category totals to donut chart data, resolving
 * codes to human-readable names via a chart-of-accounts lookup.
 */
export function transformCategoriesToDonutData(
  categories: CategoryEntry[],
  chartOfAccounts?: ChartOfAccountEntry[]
): DonutDataPoint[] {
  if (!categories || categories.length === 0) return [];

  // Build lookup map
  const nameMap = new Map<string, string>();
  if (chartOfAccounts) {
    for (const account of chartOfAccounts) {
      nameMap.set(
        account.code,
        account.name ?? account.label ?? account.description ?? account.code
      );
    }
  }

  return categories.map((cat) => {
    const code = cat.code ?? cat.category_code ?? 'UNKNOWN';
    return {
      code,
      name: nameMap.get(code) ?? code,
      value: Math.abs(cat.amount ?? cat.total ?? cat.value ?? 0),
    };
  });
}
