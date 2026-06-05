// Convention: Plaid amounts — positive = expense (money leaving account), negative = income (money entering account)
// ============================================
// TAX READINESS ANALYZER
// Scans approved transactions for deductions, categorizes expenses,
// identifies compliance risks, and estimates tax savings.
// ============================================

import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { formatCurrency } from '@/lib/currency/converter';
import { RECEIPT_REQUIRED_THRESHOLD, HIGH_VALUE_RECEIPT_THRESHOLD } from '@/lib/constants/compliance';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaxReadinessReport {
  entityId: string;
  taxYear: number;
  totalExpenses: number;
  totalDeductible: number;
  estimatedSavings: number;
  deductionsByCategory: Array<{ category: string; amount: number; count: number }>;
  missingReceipts: Array<{ id: string; merchant: string; amount: number; date: string }>;
  readinessScore: number; // 0-100
  recommendations: string[];
}

interface TransactionRow {
  id: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  category_ai: string | null;
  category_human: string | null;
  document_url: string | null;
  status: string;
}

interface TaxCategory {
  label: string;
  deductible: boolean;
  keywords: string[];
  glPrefixes: string[];
}

// ─── Tax Category Definitions ───────────────────────────────────────────────

const TAX_CATEGORIES: TaxCategory[] = [
  {
    label: 'Office Supplies',
    deductible: true,
    keywords: ['office', 'supplies', 'staples', 'paper', 'ink', 'toner', 'pens'],
    glPrefixes: ['6100', '6110', '6120'],
  },
  {
    label: 'Software & Technology',
    deductible: true,
    keywords: ['software', 'saas', 'cloud', 'subscription', 'adobe', 'microsoft', 'google', 'aws', 'hosting'],
    glPrefixes: ['6200', '6210', '6220'],
  },
  {
    label: 'Travel',
    deductible: true,
    keywords: ['travel', 'flight', 'airline', 'hotel', 'airbnb', 'uber', 'lyft', 'taxi', 'car rental'],
    glPrefixes: ['6300', '6310', '6320'],
  },
  {
    label: 'Meals & Entertainment',
    deductible: true,
    keywords: ['restaurant', 'food', 'meal', 'lunch', 'dinner', 'coffee', 'catering', 'doordash', 'grubhub'],
    glPrefixes: ['6400', '6410'],
  },
  {
    label: 'Insurance',
    deductible: true,
    keywords: ['insurance', 'premium', 'liability', 'health insurance', 'workers comp'],
    glPrefixes: ['6500', '6510', '6520'],
  },
  {
    label: 'Professional Services',
    deductible: true,
    keywords: ['legal', 'accounting', 'consulting', 'lawyer', 'attorney', 'cpa', 'advisory'],
    glPrefixes: ['6600', '6610', '6620'],
  },
  {
    label: 'Marketing & Advertising',
    deductible: true,
    keywords: ['marketing', 'advertising', 'google ads', 'facebook ads', 'promotion', 'print', 'seo'],
    glPrefixes: ['6700', '6710', '6720'],
  },
  {
    label: 'Rent & Utilities',
    deductible: true,
    keywords: ['rent', 'lease', 'utility', 'electric', 'water', 'internet', 'phone'],
    glPrefixes: ['6800', '6810', '6820'],
  },
  {
    label: 'Vehicle & Transport',
    deductible: true,
    keywords: ['gas', 'fuel', 'parking', 'toll', 'vehicle', 'maintenance', 'auto'],
    glPrefixes: ['6900', '6910'],
  },
  {
    label: 'Education & Training',
    deductible: true,
    keywords: ['training', 'education', 'course', 'conference', 'seminar', 'workshop', 'certification'],
    glPrefixes: ['7100', '7110'],
  },
  {
    label: 'Equipment & Depreciation',
    deductible: true,
    keywords: ['equipment', 'machinery', 'furniture', 'computer', 'hardware'],
    glPrefixes: ['1500', '1510', '7200'],
  },
  {
    label: 'Payroll & Benefits',
    deductible: true,
    keywords: ['payroll', 'salary', 'wages', 'bonus', 'benefits', '401k', 'pension'],
    glPrefixes: ['5000', '5100', '5200'],
  },
  {
    label: 'Personal / Non-Deductible',
    deductible: false,
    keywords: ['personal', 'gift', 'entertainment', 'fine', 'penalty', 'political'],
    glPrefixes: ['9000', '9100', '9200'],
  },
];

// ─── Categorization Logic ───────────────────────────────────────────────────

function categorizeTransaction(tx: TransactionRow): { category: string; deductible: boolean } {
  const glCode = tx.category_human || tx.category_ai || '';
  const merchant = (tx.merchant_name || '').toLowerCase();

  // 1. Try GL code prefix matching first (most reliable)
  for (const cat of TAX_CATEGORIES) {
    for (const prefix of cat.glPrefixes) {
      if (glCode.startsWith(prefix)) {
        return { category: cat.label, deductible: cat.deductible };
      }
    }
  }

  // 2. Fall back to keyword matching on GL label and merchant name
  const searchText = merchant;
  for (const cat of TAX_CATEGORIES) {
    for (const keyword of cat.keywords) {
      if (searchText.includes(keyword)) {
        return { category: cat.label, deductible: cat.deductible };
      }
    }
  }

  // 3. Default: unknown expenses should NOT default to deductible
  // Require explicit categorization for deduction eligibility
  return { category: 'Other Business Expenses', deductible: false };
}

// ─── Receipt Threshold ──────────────────────────────────────────────────────
// IRS requires receipts for expenses ≥ $75 (centralized via compliance constants)

// ─── Main Analyzer ──────────────────────────────────────────────────────────

export async function analyzeTaxReadiness(
  entityId: string,
  taxYear: number,
  db: SupabaseQueryClient,
  taxRate: number = 0.25
): Promise<TaxReadinessReport> {
  // Fetch all approved/categorized transactions for the tax year
  const startDate = `${taxYear}-01-01`;
  const endDate = `${taxYear}-12-31`;

  const { data: transactions, error } = await db
    .from('transactions')
    .select('id, merchant_name, amount, date, category_ai, category_human, document_url, status')
    .eq('entity_id', entityId)
    .in('status', [TRANSACTION_STATUS.APPROVED, TRANSACTION_STATUS.AUTO_CATEGORIZED, TRANSACTION_STATUS.SYNCED])
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (error) {
    console.error('[TaxReadiness] Query error:', error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const txList: TransactionRow[] = transactions || [];

  // Filter to expense transactions — Plaid convention: positive amount = expense (outflow)
  const expenses = txList.filter((tx: TransactionRow) => tx.amount > 0);

  // Categorize each transaction
  const categoryMap = new Map<string, { amount: number; count: number; deductible: boolean }>();
  const missingReceipts: TaxReadinessReport['missingReceipts'] = [];
  let totalExpenses = 0;
  let totalDeductible = 0;
  let totalWithReceipts = 0;
  let deductibleWithReceipts = 0;
  let totalDeductibleCount = 0;

  for (const tx of expenses) {
    const absAmount = Math.abs(tx.amount);
    totalExpenses += absAmount;

    const { category, deductible } = categorizeTransaction(tx);

    // Accumulate category totals
    const existing = categoryMap.get(category) || { amount: 0, count: 0, deductible };
    existing.amount += absAmount;
    existing.count += 1;
    categoryMap.set(category, existing);

    if (deductible) {
      // IRS: Meals & entertainment only 50% deductible
      const isMeals = category === 'Meals & Entertainment';
      totalDeductible += isMeals ? absAmount * 0.5 : absAmount;
      totalDeductibleCount += 1;
    }

    // Track receipt compliance
    const hasReceipt = !!tx.document_url;
    if (hasReceipt) {
      totalWithReceipts++;
      if (deductible) deductibleWithReceipts++;
    }

    // Flag missing receipts on deductible expenses above threshold
    if (deductible && !hasReceipt && absAmount >= RECEIPT_REQUIRED_THRESHOLD) {
      missingReceipts.push({
        id: tx.id,
        merchant: tx.merchant_name || 'Unknown',
        amount: absAmount,
        date: tx.date,
      });
    }
  }

  // Build deductions by category (sorted by amount descending)
  const deductionsByCategory = Array.from(categoryMap.entries())
    .filter(([, data]) => data.deductible)
    .map(([category, data]) => {
      // IRS: Meals & entertainment only 50% deductible
      const isMeals = category === 'Meals & Entertainment';
      const adjustedAmount = isMeals ? data.amount * 0.5 : data.amount;
      return {
        category,
        amount: Math.round(adjustedAmount * 100) / 100,
        count: data.count,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Calculate estimated savings
  const estimatedSavings = Math.round(totalDeductible * taxRate * 100) / 100;

  // Calculate readiness score (0-100)
  const readinessScore = calculateReadinessScore({
    totalExpenses,
    totalDeductible,
    expenses,
    missingReceipts,
    totalWithReceipts,
    deductibleWithReceipts,
    totalDeductibleCount,
  });

  // Generate recommendations
  // Fetch accounting basis for basis-aware recommendations
  let accountingBasis = 'cash';
  try {
    const { data: entity } = await db
      .from('entities')
      .select('accounting_basis')
      .eq('id', entityId)
      .single();

    accountingBasis = (entity?.accounting_basis as string) ?? 'cash';
  } catch {
    // Non-fatal — default to cash
  }

  const recommendations = generateRecommendations({
    missingReceipts,
    deductionsByCategory,
    readinessScore,
    totalExpenses,
    totalDeductible,
    expenses,
    totalWithReceipts,
    accountingBasis,
  });

  return {
    entityId,
    taxYear,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalDeductible: Math.round(totalDeductible * 100) / 100,
    estimatedSavings,
    deductionsByCategory,
    missingReceipts: missingReceipts.slice(0, 50), // Cap at 50 for UI
    readinessScore,
    recommendations,
  };
}

// ─── Readiness Score Calculation ────────────────────────────────────────────

function calculateReadinessScore(data: {
  totalExpenses: number;
  totalDeductible: number;
  expenses: TransactionRow[];
  missingReceipts: TaxReadinessReport['missingReceipts'];
  totalWithReceipts: number;
  deductibleWithReceipts: number;
  totalDeductibleCount: number;
}): number {
  if (data.expenses.length === 0) return 100;

  let score = 100;

  // Receipt compliance (40% weight)
  // What percentage of deductible expenses have receipts?
  const receiptRate = data.totalDeductibleCount > 0
    ? data.deductibleWithReceipts / data.totalDeductibleCount
    : 1;
  score -= Math.round((1 - receiptRate) * 40);

  // Missing high-value receipts penalty (20% weight)
  const highValueMissing = data.missingReceipts.filter(r => r.amount >= HIGH_VALUE_RECEIPT_THRESHOLD);
  if (highValueMissing.length > 0) {
    const penalty = Math.min(20, highValueMissing.length * 3);
    score -= penalty;
  }

  // Categorization coverage (20% weight)
  // Transactions with GL codes are categorized
  const categorizedRate = data.expenses.length > 0
    ? data.expenses.filter((tx: TransactionRow) => !!(tx.category_human || tx.category_ai)).length / data.expenses.length
    : 1;
  score -= Math.round((1 - categorizedRate) * 20);

  // Volume-based confidence (20% weight)
  // Having more transactions gives us more data confidence
  const volumeScore = Math.min(1, data.expenses.length / 50);
  score -= Math.round((1 - volumeScore) * 10);

  // Deduction ratio sanity check
  // If less than 30% of expenses are deductible, something might be miscategorized
  const deductionRatio = data.totalExpenses > 0
    ? data.totalDeductible / data.totalExpenses
    : 0;
  if (deductionRatio < 0.3 && data.expenses.length > 20) {
    score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Recommendation Generator ───────────────────────────────────────────────

function generateRecommendations(data: {
  missingReceipts: TaxReadinessReport['missingReceipts'];
  deductionsByCategory: TaxReadinessReport['deductionsByCategory'];
  readinessScore: number;
  totalExpenses: number;
  totalDeductible: number;
  expenses: TransactionRow[];
  totalWithReceipts: number;
  accountingBasis: string;
}): string[] {
  const recs: string[] = [];

  // Missing receipts
  if (data.missingReceipts.length > 0) {
    const totalMissingAmount = data.missingReceipts.reduce((sum, r) => sum + r.amount, 0);
    recs.push(
      `Upload ${data.missingReceipts.length} missing receipt${data.missingReceipts.length !== 1 ? 's' : ''} totaling ${formatCurrency(totalMissingAmount)} to maximize deductions and ensure audit compliance.`
    );
  }

  // High-value missing receipts
  const highValueMissing = data.missingReceipts.filter(r => r.amount >= 500);
  if (highValueMissing.length > 0) {
    recs.push(
      `⚠️ ${highValueMissing.length} expense${highValueMissing.length !== 1 ? 's' : ''} over $500 missing receipts — these are high-priority for IRS audit compliance.`
    );
  }

  // Uncategorized transactions
  const uncategorized = data.expenses.filter((tx: TransactionRow) => !(tx.category_human || tx.category_ai));
  if (uncategorized.length > 0) {
    recs.push(
      `Categorize ${uncategorized.length} uncategorized transaction${uncategorized.length !== 1 ? 's' : ''} — some may qualify as deductible expenses.`
    );
  }

  // Meals deduction note (50% rule)
  const mealsCategory = data.deductionsByCategory.find(c => c.category === 'Meals & Entertainment');
  if (mealsCategory && mealsCategory.amount > 0) {
    recs.push(
      `Meals & entertainment expenses of ${formatCurrency(mealsCategory.amount)} — note: only 50% is deductible per IRS rules. Estimated deductible portion: ${formatCurrency(mealsCategory.amount * 0.5)}.`
    );
  }

  // Vehicle expenses
  const vehicleCategory = data.deductionsByCategory.find(c => c.category === 'Vehicle & Transport');
  if (vehicleCategory && vehicleCategory.amount > 1000) {
    recs.push(
      'Consider maintaining a mileage log for vehicle expenses — the standard mileage rate may provide a larger deduction than actual expenses.'
    );
  }

  // Home office suggestion
  const rentCategory = data.deductionsByCategory.find(c => c.category === 'Rent & Utilities');
  if (!rentCategory || rentCategory.amount === 0) {
    recs.push(
      'If you work from home, consider tracking home office expenses — you may qualify for the simplified home office deduction.'
    );
  }

  // Score-based recommendations
  if (data.readinessScore >= 90) {
    recs.push(
      '✅ Your tax records are in excellent shape. Consider scheduling a review with your CPA to finalize deductions.'
    );
  } else if (data.readinessScore >= 70) {
    recs.push(
      'Your records are mostly ready. Address the missing receipts above to improve your readiness score before filing.'
    );
  } else {
    recs.push(
      'Your tax readiness needs attention. Focus on uploading receipts and categorizing expenses to avoid potential audit issues.'
    );
  }

  // Receipt compliance rate
  const receiptRate = data.expenses.length > 0
    ? Math.round((data.totalWithReceipts / data.expenses.length) * 100)
    : 100;
  if (receiptRate < 80) {
    recs.push(
      `Receipt compliance is at ${receiptRate}%. Target 95%+ for full audit readiness.`
    );
  }

  // Accounting basis recommendation
  if (data.accountingBasis === 'accrual') {
    recs.push(
      'This entity uses accrual basis accounting. Ensure all accrued expenses and revenue are recognized in the correct period for accurate tax reporting.'
    );
  } else {
    recs.push(
      'This entity uses cash basis accounting. Deductions are recognized when paid — consider timing large expenses before year-end to maximize current-year deductions.'
    );
  }

  return recs;
}
