// ============================================
// CHART COMPONENTS — BARREL EXPORT
// ============================================

export { default as SpendingTrendChart } from './SpendingTrendChart';
export { default as CategoryDonutChart } from './CategoryDonutChart';
export { default as CashFlowBarChart } from './CashFlowBarChart';
export { default as MiniSparkline } from './MiniSparkline';

export {
  getChartColorPalette,
  getChartColor,
  transformStatsToTrendData,
  transformCategoriesToDonutData,
} from './chart-helpers';

export type {
  TrendDataPoint,
  DonutDataPoint,
} from './chart-helpers';
