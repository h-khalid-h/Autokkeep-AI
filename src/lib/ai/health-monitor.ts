// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Financial Health Monitoring Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Continuously monitors financial health and generates alerts for anomalies.
// Checks: cash flow trends, expense spikes, duplicate payments,
//         subscription audit, revenue concentration, uncategorized backlog,
//         missing receipts, and burn rate.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AlertType =
  | 'cash_flow_decline'
  | 'expense_anomaly'
  | 'duplicate_payment'
  | 'subscription_waste'
  | 'revenue_concentration'
  | 'uncategorized_backlog'
  | 'missing_receipts'
  | 'burn_rate_warning';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface HealthAlert {
  id?: string;
  entityId: string;
  alertType: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  data: Record<string, unknown>;
  isRead: boolean;
  isDismissed: boolean;
}

interface TransactionRow {
  id: string;
  amount: number;
  date: string;
  merchant_name: string | null;
  category_ai: string | null;
  category_human: string | null;
  status: string;
  document_status: string | null;
}

// ─── Utility Helpers ────────────────────────────────────────────────────────

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function groupByMonth(transactions: TransactionRow[]): Map<string, TransactionRow[]> {
  const groups = new Map<string, TransactionRow[]>();
  for (const tx of transactions) {
    const key = getMonthKey(tx.date);
    const arr = groups.get(key) || [];
    arr.push(tx);
    groups.set(key, arr);
  }
  return groups;
}

function sortedMonthKeys(months: Map<string, TransactionRow[]>): string[] {
  return Array.from(months.keys()).sort();
}

// ─── Individual Health Checks ──────────────────────────────────────────────

function checkCashFlowTrend(
  entityId: string,
  months: Map<string, TransactionRow[]>
): HealthAlert | null {
  const keys = sortedMonthKeys(months);
  if (keys.length < 2) return null;

  const currentMonth = keys[keys.length - 1];
  const priorMonth = keys[keys.length - 2];

  const sumInflows = (txs: TransactionRow[]) =>
    txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

  const currentInflows = sumInflows(months.get(currentMonth) || []);
  const priorInflows = sumInflows(months.get(priorMonth) || []);

  if (priorInflows === 0) return null;

  const changePercent = ((currentInflows - priorInflows) / priorInflows) * 100;

  if (changePercent < -20) {
    return {
      entityId,
      alertType: 'cash_flow_decline',
      severity: changePercent < -40 ? 'critical' : 'warning',
      title: 'Cash flow declining',
      description: `Inflows dropped ${Math.abs(Math.round(changePercent))}% from ${priorMonth} to ${currentMonth}. Prior: $${priorInflows.toFixed(2)}, Current: $${currentInflows.toFixed(2)}.`,
      data: {
        currentMonth,
        priorMonth,
        currentInflows,
        priorInflows,
        changePercent: Math.round(changePercent),
      },
      isRead: false,
      isDismissed: false,
    };
  }

  return null;
}

function checkExpenseAnomalies(
  entityId: string,
  months: Map<string, TransactionRow[]>
): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const keys = sortedMonthKeys(months);
  if (keys.length < 2) return alerts;

  const currentMonth = keys[keys.length - 1];
  const priorMonth = keys[keys.length - 2];

  // Group expenses by category
  const categorize = (txs: TransactionRow[]) => {
    const cats = new Map<string, number>();
    for (const tx of txs) {
      if (tx.amount >= 0) continue; // Only expenses (negative amounts)
      const cat = tx.category_human || tx.category_ai || 'Uncategorized';
      cats.set(cat, (cats.get(cat) || 0) + Math.abs(tx.amount));
    }
    return cats;
  };

  const currentCats = categorize(months.get(currentMonth) || []);
  const priorCats = categorize(months.get(priorMonth) || []);

  for (const [category, currentAmount] of currentCats) {
    const priorAmount = priorCats.get(category) || 0;
    if (priorAmount === 0) continue;

    const changePercent = ((currentAmount - priorAmount) / priorAmount) * 100;

    if (changePercent > 30 && currentAmount > 50) {
      alerts.push({
        entityId,
        alertType: 'expense_anomaly',
        severity: changePercent > 100 ? 'critical' : 'warning',
        title: `Spending spike in "${category}"`,
        description: `"${category}" expenses increased ${Math.round(changePercent)}% from $${priorAmount.toFixed(2)} to $${currentAmount.toFixed(2)}.`,
        data: {
          category,
          currentMonth,
          priorMonth,
          currentAmount,
          priorAmount,
          changePercent: Math.round(changePercent),
        },
        isRead: false,
        isDismissed: false,
      });
    }
  }

  return alerts;
}

function checkDuplicatePayments(
  entityId: string,
  transactions: TransactionRow[]
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // Sort by date ascending
  const sorted = [...transactions]
    .filter((t) => t.amount < 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const seen = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    const vendor = (tx.merchant_name || '').toLowerCase().trim();
    if (!vendor) continue;

    for (let j = i + 1; j < sorted.length; j++) {
      const other = sorted[j];
      const daysDiff =
        (new Date(other.date).getTime() - new Date(tx.date).getTime()) /
        (1000 * 60 * 60 * 24);

      if (daysDiff > 7) break;

      const otherVendor = (other.merchant_name || '').toLowerCase().trim();
      if (
        otherVendor === vendor &&
        Math.abs(tx.amount) === Math.abs(other.amount)
      ) {
        const key = `${tx.id}-${other.id}`;
        const reverseKey = `${other.id}-${tx.id}`;
        if (seen.has(key) || seen.has(reverseKey)) continue;
        seen.add(key);

        alerts.push({
          entityId,
          alertType: 'duplicate_payment',
          severity: Math.abs(tx.amount) > 500 ? 'critical' : 'warning',
          title: `Possible duplicate: ${tx.merchant_name}`,
          description: `Two payments of $${Math.abs(tx.amount).toFixed(2)} to "${tx.merchant_name}" within ${Math.round(daysDiff)} day(s) (${tx.date} and ${other.date}).`,
          data: {
            transactionIds: [tx.id, other.id],
            vendor: tx.merchant_name,
            amount: Math.abs(tx.amount),
            dates: [tx.date, other.date],
            daysDiff: Math.round(daysDiff),
          },
          isRead: false,
          isDismissed: false,
        });
      }
    }
  }

  return alerts;
}

function checkSubscriptionWaste(
  entityId: string,
  transactions: TransactionRow[]
): HealthAlert[] {
  const alerts: HealthAlert[] = [];

  // Group by vendor + approximate amount (within 10% tolerance)
  const vendorCharges = new Map<string, { amounts: number[]; dates: string[] }>();

  for (const tx of transactions) {
    if (tx.amount >= 0) continue;
    const vendor = (tx.merchant_name || '').toLowerCase().trim();
    if (!vendor) continue;

    const existing = vendorCharges.get(vendor);
    if (existing) {
      existing.amounts.push(Math.abs(tx.amount));
      existing.dates.push(tx.date);
    } else {
      vendorCharges.set(vendor, {
        amounts: [Math.abs(tx.amount)],
        dates: [tx.date],
      });
    }
  }

  for (const [vendor, data] of vendorCharges) {
    if (data.amounts.length < 2) continue;

    // Check if amounts are within 10% tolerance of average
    const avg = data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length;
    const allSimilar = data.amounts.every(
      (a) => Math.abs(a - avg) / avg < 0.10
    );

    if (allSimilar && data.amounts.length >= 2) {
      const monthlyEstimate = avg;

      alerts.push({
        entityId,
        alertType: 'subscription_waste',
        severity: 'info',
        title: `Recurring charge: ${vendor}`,
        description: `"${vendor}" has ${data.amounts.length} charges averaging $${monthlyEstimate.toFixed(2)}/mo. Annual estimate: $${(monthlyEstimate * 12).toFixed(2)}. Review if this subscription is still needed.`,
        data: {
          vendor,
          chargeCount: data.amounts.length,
          averageAmount: monthlyEstimate,
          annualEstimate: monthlyEstimate * 12,
          dates: data.dates,
        },
        isRead: false,
        isDismissed: false,
      });
    }
  }

  return alerts;
}

function checkRevenueConcentration(
  entityId: string,
  transactions: TransactionRow[]
): HealthAlert | null {
  // Only look at positive amounts (revenue/inflows)
  const inflows = transactions.filter((t) => t.amount > 0);
  if (inflows.length < 3) return null;

  const totalRevenue = inflows.reduce((s, t) => s + t.amount, 0);
  if (totalRevenue === 0) return null;

  // Group by source
  const sourceMap = new Map<string, number>();
  for (const tx of inflows) {
    const source = (tx.merchant_name || 'Unknown').toLowerCase().trim();
    sourceMap.set(source, (sourceMap.get(source) || 0) + tx.amount);
  }

  for (const [source, amount] of sourceMap) {
    const percentage = (amount / totalRevenue) * 100;
    if (percentage > 50) {
      return {
        entityId,
        alertType: 'revenue_concentration',
        severity: percentage > 80 ? 'critical' : 'warning',
        title: 'Revenue concentration risk',
        description: `${Math.round(percentage)}% of your revenue ($${amount.toFixed(2)} of $${totalRevenue.toFixed(2)}) comes from "${source}". Diversifying revenue sources reduces risk.`,
        data: {
          source,
          sourceAmount: amount,
          totalRevenue,
          concentrationPercent: Math.round(percentage),
        },
        isRead: false,
        isDismissed: false,
      };
    }
  }

  return null;
}

function checkUncategorizedBacklog(
  entityId: string,
  transactions: TransactionRow[]
): HealthAlert | null {
  const uncategorized = transactions.filter(
    (t) =>
      !t.category_human &&
      !t.category_ai &&
      t.status !== 'approved' &&
      t.status !== 'removed'
  );

  if (uncategorized.length > 10) {
    return {
      entityId,
      alertType: 'uncategorized_backlog',
      severity: uncategorized.length > 50 ? 'critical' : 'warning',
      title: `${uncategorized.length} uncategorized transactions`,
      description: `You have ${uncategorized.length} transactions without categories. This can delay month-end close and reduce report accuracy.`,
      data: {
        count: uncategorized.length,
        sampleIds: uncategorized.slice(0, 5).map((t) => t.id),
      },
      isRead: false,
      isDismissed: false,
    };
  }

  return null;
}

function checkMissingReceipts(
  entityId: string,
  transactions: TransactionRow[]
): HealthAlert | null {
  const missing = transactions.filter(
    (t) =>
      t.document_status === 'missing' &&
      Math.abs(t.amount) > 25 &&
      t.status !== 'removed'
  );

  if (missing.length > 0) {
    const totalAmount = missing.reduce((s, t) => s + Math.abs(t.amount), 0);

    return {
      entityId,
      alertType: 'missing_receipts',
      severity:
        missing.length > 20
          ? 'critical'
          : missing.length > 5
            ? 'warning'
            : 'info',
      title: `${missing.length} transactions without receipts`,
      description: `${missing.length} transactions totaling $${totalAmount.toFixed(2)} are missing receipt documentation. This may affect compliance.`,
      data: {
        count: missing.length,
        totalAmount,
        sampleIds: missing.slice(0, 5).map((t) => t.id),
      },
      isRead: false,
      isDismissed: false,
    };
  }

  return null;
}

function checkBurnRate(
  entityId: string,
  months: Map<string, TransactionRow[]>,
  cashBalance: number | null
): HealthAlert | null {
  if (cashBalance === null) return null;

  const keys = sortedMonthKeys(months);
  if (keys.length < 1) return null;

  // Calculate average monthly burn (outflows)
  let totalExpenses = 0;
  for (const [, txs] of months) {
    totalExpenses += txs
      .filter((t) => t.amount < 0)
      .reduce((s, t) => s + Math.abs(t.amount), 0);
  }

  const avgMonthlyBurn = totalExpenses / keys.length;
  if (avgMonthlyBurn === 0) return null;

  const runwayMonths = cashBalance / avgMonthlyBurn;

  if (runwayMonths < 6) {
    return {
      entityId,
      alertType: 'burn_rate_warning',
      severity: runwayMonths < 3 ? 'critical' : 'warning',
      title: `${Math.round(runwayMonths)} months of runway remaining`,
      description: `At your current burn rate of $${avgMonthlyBurn.toFixed(2)}/month, your cash balance of $${cashBalance.toFixed(2)} will last approximately ${runwayMonths.toFixed(1)} months.`,
      data: {
        cashBalance,
        avgMonthlyBurn,
        runwayMonths: Math.round(runwayMonths * 10) / 10,
        monthsAnalyzed: keys.length,
      },
      isRead: false,
      isDismissed: false,
    };
  }

  return null;
}

// ─── Main Health Check Entry Point ─────────────────────────────────────────

/**
 * Runs a comprehensive financial health check for an entity.
 * Fetches the last 90 days of transactions, runs all health checks,
 * persists new alerts to the health_alerts table, and returns them.
 */
export async function runHealthCheck(
  entityId: string,
  supabase: SupabaseQueryClient
): Promise<HealthAlert[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateThreshold = ninetyDaysAgo.toISOString().split('T')[0];

  // 1. Fetch last 90 days of transactions
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select(
      'id, amount, date, merchant_name, category_ai, category_human, status, document_status'
    )
    .eq('entity_id', entityId)
    .gte('date', dateThreshold)
    .neq('status', 'removed')
    .order('date', { ascending: true });

  if (txError) {
    console.error('[HealthMonitor] Failed to fetch transactions:', txError);
    return [];
  }

  const txns: TransactionRow[] = transactions || [];
  if (txns.length === 0) return [];

  const months = groupByMonth(txns);

  // 2. Optionally fetch cash balance from bank_accounts
  let cashBalance: number | null = null;
  try {
    const { data: accounts } = await supabase
      .from('bank_accounts')
      .select('current_balance, connection_id')
      .order('created_at', { ascending: false });

    if (accounts && accounts.length > 0) {
      // Get accounts that belong to this entity via bank_connections
      const { data: connections } = await supabase
        .from('bank_connections')
        .select('id')
        .eq('entity_id', entityId);

      if (connections && connections.length > 0) {
        const connectionIds = new Set(
          connections.map((c: { id: string }) => c.id)
        );
        const entityAccounts = accounts.filter(
          (a: { connection_id: string }) => connectionIds.has(a.connection_id)
        );
        cashBalance = entityAccounts.reduce(
          (sum: number, a: { current_balance: number | null }) =>
            sum + (a.current_balance || 0),
          0
        );
      }
    }
  } catch {
    // Cash balance is optional — proceed without it
  }

  // 3. Run all health checks
  const alerts: HealthAlert[] = [];

  const cashFlowAlert = checkCashFlowTrend(entityId, months);
  if (cashFlowAlert) alerts.push(cashFlowAlert);

  const expenseAlerts = checkExpenseAnomalies(entityId, months);
  alerts.push(...expenseAlerts);

  const duplicateAlerts = checkDuplicatePayments(entityId, txns);
  alerts.push(...duplicateAlerts);

  const subscriptionAlerts = checkSubscriptionWaste(entityId, txns);
  alerts.push(...subscriptionAlerts);

  const revenueAlert = checkRevenueConcentration(entityId, txns);
  if (revenueAlert) alerts.push(revenueAlert);

  const backlogAlert = checkUncategorizedBacklog(entityId, txns);
  if (backlogAlert) alerts.push(backlogAlert);

  const receiptAlert = checkMissingReceipts(entityId, txns);
  if (receiptAlert) alerts.push(receiptAlert);

  const burnRateAlert = checkBurnRate(entityId, months, cashBalance);
  if (burnRateAlert) alerts.push(burnRateAlert);

  // 4. Persist new alerts (clear stale ones from the last 24h first)
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);

  try {
    // Dismiss old non-dismissed alerts older than 24h to prevent duplicates
    await supabase
      .from('health_alerts')
      .update({ is_dismissed: true })
      .eq('entity_id', entityId)
      .eq('is_dismissed', false)
      .lt('created_at', oneDayAgo.toISOString());

    // Insert new alerts
    if (alerts.length > 0) {
      const rows = alerts.map((alert) => ({
        entity_id: alert.entityId,
        alert_type: alert.alertType,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        data: alert.data,
        is_read: false,
        is_dismissed: false,
      }));

      const { data: inserted, error: insertError } = await supabase
        .from('health_alerts')
        .insert(rows)
        .select('id');

      if (insertError) {
        console.error('[HealthMonitor] Failed to insert alerts:', insertError);
      } else if (inserted) {
        // Attach IDs back to the alerts
        for (let i = 0; i < inserted.length && i < alerts.length; i++) {
          alerts[i].id = (inserted[i] as { id: string }).id;
        }
      }
    }
  } catch (error) {
    console.error('[HealthMonitor] Failed to persist alerts:', error);
  }

  return alerts;
}

/**
 * Computes a financial health score (0–100) from a set of alerts.
 * Critical alerts deduct 20 pts each, warnings 10 pts, info 3 pts.
 */
export function computeHealthScore(alerts: HealthAlert[]): number {
  const activeAlerts = alerts.filter((a) => !a.isDismissed);
  let score = 100;

  for (const alert of activeAlerts) {
    switch (alert.severity) {
      case 'critical':
        score -= 20;
        break;
      case 'warning':
        score -= 10;
        break;
      case 'info':
        score -= 3;
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}
