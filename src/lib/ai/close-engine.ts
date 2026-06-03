// Convention: Plaid amounts — positive = expense (money leaving account), negative = income (money entering account)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — AI Month-End Close Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Automates the month-end close process by running reconciliation,
// receipt detection, categorization completeness, and expense reviews.
// Produces a readiness score and checklist for closing an accounting period.

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { analyzeVariance } from '@/lib/reconciliation/engine';

// ─── F16: Separation of Duties (SOD) — Approver ≠ Closer ───────────────────

/**
 * Checks whether the user closing the period also approved a disproportionate
 * share of transactions in that period. This is a Separation of Duties (SOD)
 * control: the person locking the books should not be the same person who
 * approved the majority of items in those books.
 *
 * - >50% → warning  (advisory)
 * - >80% → fail     (strong SOD violation signal)
 */
async function approverCloserSodCheck(
  entityId: string,
  startDate: string,
  endDate: string,
  closingUserId: string,
  supabase: SupabaseQueryClient
): Promise<CloseCheck> {
  try {
    // Count all approved requests in the period
    const { data: allApprovals, error: allErr } = await supabase
      .from('approval_requests')
      .select('id', { count: 'exact' })
      .eq('entity_id', entityId)
      .eq('status', 'approved')
      .gte('decided_at', startDate)
      .lt('decided_at', endDate);

    if (allErr || !allApprovals) {
      return {
        name: 'Separation of Duties',
        status: 'warning',
        description: `Could not verify SOD: ${allErr?.message ?? 'no data'}`,
      };
    }

    const totalApproved = allApprovals.length;
    if (totalApproved === 0) {
      return {
        name: 'Separation of Duties',
        status: 'pass',
        description: 'No approved transactions in this period — SOD check not applicable.',
      };
    }

    // Count approvals made by the closing user
    const { data: userApprovals, error: userErr } = await supabase
      .from('approval_requests')
      .select('id', { count: 'exact' })
      .eq('entity_id', entityId)
      .eq('status', 'approved')
      .eq('approver_user_id', closingUserId)
      .gte('decided_at', startDate)
      .lt('decided_at', endDate);

    if (userErr || !userApprovals) {
      return {
        name: 'Separation of Duties',
        status: 'warning',
        description: `Could not verify SOD for closing user: ${userErr?.message ?? 'no data'}`,
      };
    }

    const closerApproved = userApprovals.length;
    const pct = (closerApproved / totalApproved) * 100;

    if (pct > 80) {
      return {
        name: 'Separation of Duties',
        status: 'fail',
        description: `SOD violation: closing user approved ${closerApproved}/${totalApproved} (${Math.round(pct)}%) of transactions in this period.`,
        count: closerApproved,
        details: [
          `Closing user approved ${closerApproved} of ${totalApproved} transactions (${Math.round(pct)}%)`,
          'Threshold: >80% = fail. Consider having a different user close this period.',
        ],
      };
    }

    if (pct > 50) {
      return {
        name: 'Separation of Duties',
        status: 'warning',
        description: `Closing user approved ${closerApproved}/${totalApproved} (${Math.round(pct)}%) of transactions. Consider a different closer for stronger internal controls.`,
        count: closerApproved,
        details: [
          `Closing user approved ${closerApproved} of ${totalApproved} transactions (${Math.round(pct)}%)`,
          'Threshold: >50% = warning.',
        ],
      };
    }

    return {
      name: 'Separation of Duties',
      status: 'pass',
      description: `SOD check passed. Closing user approved ${closerApproved}/${totalApproved} (${Math.round(pct)}%) of transactions.`,
    };
  } catch (error) {
    console.error('[CloseEngine] SOD check error:', error);
    return {
      name: 'Separation of Duties',
      status: 'warning',
      description: 'SOD check encountered an error.',
    };
  }
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface CloseReport {
  entityId: string;
  period: { year: number; month: number };
  readinessScore: number;
  checks: CloseCheck[];
  summary: string;
  isReady: boolean;
}

export interface CloseCheck {
  name: string;
  status: 'pass' | 'warning' | 'fail';
  description: string;
  count?: number;
  details?: string[];
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

interface BankAccountRow {
  id: string;
  current_balance: number | null;
  name: string | null;
  connection_id: string;
}

interface BankConnectionRow {
  id: string;
  last_synced_at: string | null;
  status: string;
}

// ─── Check Implementations ─────────────────────────────────────────────────

function reconciliationCheck(
  allTransactions: TransactionRow[],
  bankAccounts: BankAccountRow[]
): CloseCheck {
  if (bankAccounts.length === 0) {
    return {
      name: 'Bank Reconciliation',
      status: 'warning',
      description: 'No bank accounts connected. Cannot verify balances.',
    };
  }

  // Sum ALL transaction amounts to get cumulative book balance.
  // Plaid convention: positive = outflow (expense), negative = inflow (income).
  // Negating the sum converts net outflows into a net position (positive = net inflows).
  const bookBalance = -allTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  // Sum bank account balances
  const bankBalance = bankAccounts.reduce(
    (sum, acc) => sum + (acc.current_balance || 0),
    0
  );

  // Use the variance analysis engine
  const varianceResult = analyzeVariance(bankBalance, bookBalance, 'bank_reconciliation');

  const variance = Math.abs(bankBalance - bookBalance);

  if (variance < 0.01) {
    return {
      name: 'Bank Reconciliation',
      status: 'pass',
      description: 'Bank and book balances match.',
      details: [
        `Bank balance: $${bankBalance.toFixed(2)}`,
        `Book balance: $${bookBalance.toFixed(2)}`,
      ],
    };
  }

  if (varianceResult.isKnownFee || variance < 100) {
    return {
      name: 'Bank Reconciliation',
      status: 'warning',
      description: `Minor variance of $${variance.toFixed(2)} detected. ${varianceResult.description}`,
      details: [
        `Bank balance: $${bankBalance.toFixed(2)}`,
        `Book balance: $${bookBalance.toFixed(2)}`,
        `Variance: $${variance.toFixed(2)} (${varianceResult.glName})`,
      ],
    };
  }

  return {
    name: 'Bank Reconciliation',
    status: 'fail',
    description: `Significant variance of $${variance.toFixed(2)} between bank and books. Manual reconciliation required.`,
    details: [
      `Bank balance: $${bankBalance.toFixed(2)}`,
      `Book balance: $${bookBalance.toFixed(2)}`,
      `Variance: $${variance.toFixed(2)}`,
    ],
  };
}

function missingReceiptCheck(transactions: TransactionRow[]): CloseCheck {
  const missing = transactions.filter(
    (t) =>
      t.document_status === 'missing' &&
      Math.abs(t.amount) > 25 &&
      t.status !== 'removed'
  );

  if (missing.length === 0) {
    return {
      name: 'Receipt Documentation',
      status: 'pass',
      description: 'All significant transactions have receipts attached.',
    };
  }

  const totalAmount = missing.reduce((s, t) => s + Math.abs(t.amount), 0);

  return {
    name: 'Receipt Documentation',
    status: missing.length > 10 ? 'fail' : 'warning',
    description: `${missing.length} transactions ($${totalAmount.toFixed(2)}) are missing receipt documentation.`,
    count: missing.length,
    details: missing.slice(0, 5).map(
      (t) =>
        `${t.merchant_name || 'Unknown'}: $${Math.abs(t.amount).toFixed(2)} on ${t.date}`
    ),
  };
}

function uncategorizedCheck(transactions: TransactionRow[]): CloseCheck {
  const uncategorized = transactions.filter(
    (t) =>
      (t.status === 'pending' || t.status === 'human_review')
  );

  if (uncategorized.length === 0) {
    return {
      name: 'Transaction Categorization',
      status: 'pass',
      description: 'All transactions are categorized and reviewed.',
    };
  }

  return {
    name: 'Transaction Categorization',
    status: uncategorized.length > 5 ? 'fail' : 'warning',
    description: `${uncategorized.length} transactions still pending review or categorization.`,
    count: uncategorized.length,
    details: uncategorized.slice(0, 5).map(
      (t) =>
        `${t.merchant_name || 'Unknown'}: $${Math.abs(t.amount).toFixed(2)} (${t.status})`
    ),
  };
}

function expenseReviewCheck(
  currentTransactions: TransactionRow[],
  historicalAvg: Map<string, number>
): CloseCheck {
  const flagged: string[] = [];

  // Group current expenses by category
  const currentCategories = new Map<string, number>();
  for (const tx of currentTransactions) {
    if (tx.amount <= 0) continue; // Skip non-expenses (Plaid: positive = expense)
    const cat = tx.category_human || tx.category_ai || 'Uncategorized';
    currentCategories.set(cat, (currentCategories.get(cat) || 0) + Math.abs(tx.amount));
  }

  for (const [cat, amount] of currentCategories) {
    const avg = historicalAvg.get(cat);
    if (avg && avg > 0) {
      const deviation = ((amount - avg) / avg) * 100;
      if (deviation > 50 && amount > 100) {
        flagged.push(
          `"${cat}": $${amount.toFixed(2)} (+${Math.round(deviation)}% vs $${avg.toFixed(2)} avg)`
        );
      }
    }
  }

  if (flagged.length === 0) {
    return {
      name: 'Expense Review',
      status: 'pass',
      description: 'All expense categories are within normal ranges.',
    };
  }

  return {
    name: 'Expense Review',
    status: flagged.length > 3 ? 'fail' : 'warning',
    description: `${flagged.length} expense categories are significantly above historical averages.`,
    count: flagged.length,
    details: flagged,
  };
}

function bankFeedCheck(connections: BankConnectionRow[]): CloseCheck {
  if (connections.length === 0) {
    return {
      name: 'Bank Feed Sync',
      status: 'warning',
      description: 'No bank connections configured.',
    };
  }

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const stale = connections.filter((c) => {
    if (!c.last_synced_at) return true;
    return new Date(c.last_synced_at) < threeDaysAgo;
  });

  const errored = connections.filter((c) => c.status === 'error');

  if (stale.length === 0 && errored.length === 0) {
    return {
      name: 'Bank Feed Sync',
      status: 'pass',
      description: 'All bank feeds are synced within the last 3 days.',
    };
  }

  const details: string[] = [];
  if (stale.length > 0) {
    details.push(`${stale.length} connection(s) haven't synced recently`);
  }
  if (errored.length > 0) {
    details.push(`${errored.length} connection(s) have errors`);
  }

  return {
    name: 'Bank Feed Sync',
    status: errored.length > 0 ? 'fail' : 'warning',
    description: `${stale.length + errored.length} bank connection(s) may have incomplete data.`,
    count: stale.length + errored.length,
    details,
  };
}

// ─── F6: Trial Balance Check ───────────────────────────────────────────────

/**
 * Verifies that SUM(debit) = SUM(credit) across all posted journal lines
 * for the period. An unbalanced trial balance is a fundamental GAAP failure
 * that MUST block period close.
 */
async function trialBalanceCheck(
  entityId: string,
  startDate: string,
  endDate: string,
  supabase: SupabaseQueryClient
): Promise<CloseCheck> {
  try {
    // Fetch all posted journal entries for the period, then sum their lines
    const { data: entries, error: jeError } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('entity_id', entityId)
      .eq('status', 'posted')
      .gte('entry_date', startDate)
      .lt('entry_date', endDate);

    if (jeError || !entries || entries.length === 0) {
      return {
        name: 'Trial Balance',
        status: entries?.length === 0 ? 'pass' : 'warning',
        description: entries?.length === 0
          ? 'No posted journal entries in this period.'
          : `Failed to query journal entries: ${jeError?.message}`,
      };
    }

    const entryIds = entries.map((e: { id: string }) => e.id);

    // Sum all debits and credits across journal lines
    const { data: lines, error: lineError } = await supabase
      .from('journal_lines')
      .select('debit, credit')
      .in('journal_entry_id', entryIds);

    if (lineError || !lines) {
      return {
        name: 'Trial Balance',
        status: 'warning',
        description: `Failed to query journal lines: ${lineError?.message}`,
      };
    }

    const totalDebit = (lines as { debit: number; credit: number }[]).reduce(
      (sum, l) => sum + (l.debit || 0), 0
    );
    const totalCredit = (lines as { debit: number; credit: number }[]).reduce(
      (sum, l) => sum + (l.credit || 0), 0
    );

    // Allow $0.01 tolerance for floating-point rounding
    const imbalance = Math.abs(totalDebit - totalCredit);

    if (imbalance < 0.01) {
      return {
        name: 'Trial Balance',
        status: 'pass',
        description: `Trial balance verified. Total debits ($${totalDebit.toFixed(2)}) equal total credits ($${totalCredit.toFixed(2)}).`,
        details: [
          `Journal entries: ${entries.length}`,
          `Journal lines: ${lines.length}`,
          `Total debits: $${totalDebit.toFixed(2)}`,
          `Total credits: $${totalCredit.toFixed(2)}`,
        ],
      };
    }

    return {
      name: 'Trial Balance',
      status: 'fail',
      description: `Trial balance is OUT OF BALANCE by $${imbalance.toFixed(2)}. This must be resolved before closing.`,
      details: [
        `Total debits: $${totalDebit.toFixed(2)}`,
        `Total credits: $${totalCredit.toFixed(2)}`,
        `Imbalance: $${imbalance.toFixed(2)}`,
      ],
    };
  } catch (error) {
    console.error('[CloseEngine] Trial balance check error:', error);
    return {
      name: 'Trial Balance',
      status: 'warning',
      description: 'Trial balance check encountered an error.',
    };
  }
}

// ─── Score Calculation ─────────────────────────────────────────────────────

function calculateReadinessScore(checks: CloseCheck[]): number {
  let score = 100;

  for (const check of checks) {
    switch (check.status) {
      case 'fail':
        score -= 20;
        break;
      case 'warning':
        score -= 8;
        break;
      case 'pass':
        break;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function generateSummary(checks: CloseCheck[], readinessScore: number): string {
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const warnCount = checks.filter((c) => c.status === 'warning').length;
  const passCount = checks.filter((c) => c.status === 'pass').length;

  if (readinessScore >= 90) {
    return `Excellent! All ${passCount} core checks passed. Your books are ready to close.${warnCount > 0 ? ` ${warnCount} minor item(s) noted for review.` : ''}`;
  }

  if (readinessScore >= 80) {
    return `Nearly there — ${passCount} checks passed with ${warnCount} warning(s). Address the warnings and you're good to close.`;
  }

  if (readinessScore >= 60) {
    return `Some work needed before closing. ${failCount} check(s) failed and ${warnCount} warning(s) noted. Review the flagged items below.`;
  }

  return `Not ready to close. ${failCount} critical check(s) failed. Resolve these issues before attempting month-end close.`;
}

// ─── Main Close Engine Entry Point ─────────────────────────────────────────

/**
 * Runs all month-end close checks for a given entity and period.
 * Returns a comprehensive CloseReport with readiness score.
 */
export async function runMonthEndClose(
  entityId: string,
  year: number,
  month: number,
  supabase: SupabaseQueryClient,
  closingUserId?: string
): Promise<CloseReport> {
  // Compute date range for the period
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  // Fetch transactions for the period
  const { data: transactions, error: txError } = await supabase
    .from('transactions')
    .select(
      'id, amount, date, merchant_name, category_ai, category_human, status, document_status'
    )
    .eq('entity_id', entityId)
    .gte('date', startDate)
    .lt('date', endDate)
    .neq('status', 'removed')
    .order('date', { ascending: true });

  if (txError) {
    console.error('[CloseEngine] Failed to fetch transactions:', txError);
    return {
      entityId,
      period: { year, month },
      readinessScore: 0,
      checks: [
        {
          name: 'Data Fetch',
          status: 'fail',
          description: `Failed to load transactions: ${txError.message}`,
        },
      ],
      summary: 'Unable to run close checks due to a data access error.',
      isReady: false,
    };
  }

  const txns: TransactionRow[] = transactions || [];

  // Fetch bank accounts for this entity
  let bankAccounts: BankAccountRow[] = [];
  try {
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('id')
      .eq('entity_id', entityId);

    if (connections && connections.length > 0) {
      const connectionIds = connections.map((c: { id: string }) => c.id);
      const { data: accounts } = await supabase
        .from('bank_accounts')
        .select('id, current_balance, name, connection_id')
        .in('connection_id', connectionIds);

      bankAccounts = (accounts || []) as BankAccountRow[];
    }
  } catch {
    // Non-fatal — bank reconciliation will show a warning
  }

  // Fetch bank connections for sync check
  let bankConnections: BankConnectionRow[] = [];
  try {
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('id, last_synced_at, status')
      .eq('entity_id', entityId);

    bankConnections = (connections || []) as BankConnectionRow[];
  } catch {
    // Non-fatal
  }

  // Calculate historical averages (prior 3 months) for expense review
  const historicalAvg = new Map<string, number>();
  try {
    const histStart = new Date(year, month - 4, 1); // 3 months back
    const histEnd = new Date(year, month - 1, 1); // Up to start of current month

    const { data: histTxns } = await supabase
      .from('transactions')
      .select('amount, category_ai, category_human')
      .eq('entity_id', entityId)
      .gte('date', histStart.toISOString().split('T')[0])
      .lt('date', histEnd.toISOString().split('T')[0])
      .neq('status', 'removed');

    if (histTxns && histTxns.length > 0) {
      const catTotals = new Map<string, number>();
      for (const tx of histTxns as { amount: number; category_ai: string | null; category_human: string | null }[]) {
        if (tx.amount <= 0) continue; // Skip non-expenses (Plaid: positive = expense)
        const cat = tx.category_human || tx.category_ai || 'Uncategorized';
        catTotals.set(cat, (catTotals.get(cat) || 0) + Math.abs(tx.amount));
      }
      // Average over 3 months
      for (const [cat, total] of catTotals) {
        historicalAvg.set(cat, total / 3);
      }
    }
  } catch {
    // Historical data is optional
  }

  // Fetch ALL transactions for reconciliation (cumulative book balance vs bank balance)
  let allTransactions: TransactionRow[] = [];
  try {
    const { data: allTxns } = await supabase
      .from('transactions')
      .select('id, amount, date, merchant_name, category_ai, category_human, status, document_status')
      .eq('entity_id', entityId)
      .neq('status', 'removed');
    allTransactions = (allTxns || []) as TransactionRow[];
  } catch {
    // Non-fatal — reconciliation will use period transactions as fallback
    allTransactions = txns;
  }

  // Run all checks (including async trial balance check and F16 SOD check)
  const tbCheck = await trialBalanceCheck(entityId, startDate, endDate, supabase);

  const checks: CloseCheck[] = [
    tbCheck,
    reconciliationCheck(allTransactions, bankAccounts),
    missingReceiptCheck(txns),
    uncategorizedCheck(txns),
    expenseReviewCheck(txns, historicalAvg),
    bankFeedCheck(bankConnections),
  ];

  // F16: Separation of Duties check — only run when we know who is closing
  if (closingUserId) {
    const sodCheck = await approverCloserSodCheck(
      entityId, startDate, endDate, closingUserId, supabase
    );
    checks.push(sodCheck);
  }

  const readinessScore = calculateReadinessScore(checks);
  const summary = generateSummary(checks, readinessScore);
  const isReady = readinessScore >= 80;

  return {
    entityId,
    period: { year, month },
    readinessScore,
    checks,
    summary,
    isReady,
  };
}

/**
 * Attempts to close an accounting period by inserting/updating the
 * accounting_periods table. Returns success or failure reason.
 */
export async function closePeriod(
  entityId: string,
  year: number,
  month: number,
  userId: string,
  supabase: SupabaseQueryClient
): Promise<{ success: boolean; message: string; error?: string }> {
  const period = `${year}-${String(month).padStart(2, '0')}`;

  // ── Readiness gate: enforce minimum score before locking ────────────
  const readiness = await runMonthEndClose(entityId, year, month, supabase, userId);
  if (readiness.readinessScore < 80) {
    return {
      success: false,
      message: `Cannot close period ${period}: readiness score is ${readiness.readinessScore}%.`,
      error: `Cannot close period: readiness score ${readiness.readinessScore}% is below the 80% minimum. Address outstanding items first.`,
    };
  }

  // Check if already locked
  const { data: existing } = await supabase
    .from('accounting_periods')
    .select('id, is_locked')
    .eq('entity_id', entityId)
    .eq('period', period)
    .maybeSingle();

  if (existing?.is_locked) {
    return {
      success: false,
      message: `Period ${period} is already closed.`,
    };
  }

  if (existing) {
    // Update existing record to lock
    const { error } = await supabase
      .from('accounting_periods')
      .update({
        is_locked: true,
        locked_at: new Date().toISOString(),
        locked_by: userId,
      })
      .eq('id', existing.id);

    if (error) {
      return {
        success: false,
        message: `Failed to close period: ${error.message}`,
      };
    }
  } else {
    // Insert new locked period
    const { error } = await supabase.from('accounting_periods').insert({
      entity_id: entityId,
      period,
      is_locked: true,
      locked_at: new Date().toISOString(),
      locked_by: userId,
    });

    if (error) {
      return {
        success: false,
        message: `Failed to close period: ${error.message}`,
      };
    }
  }

  return {
    success: true,
    message: `Period ${period} has been closed and locked. Transactions in this period can no longer be modified.`,
  };
}

