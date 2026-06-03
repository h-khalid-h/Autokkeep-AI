// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — United States 🇺🇸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - Receipt substantiation for expenses >$75 (IRS §274)
// - Meals deductibility flag for >50% deduction review (IRC §274(n))
// - 1099-NEC threshold monitoring for vendor payments ≥$600
// - Business purpose documentation for deductible expenses >$75
// - Quarterly estimated tax payment reminders (IRS Form 1040-ES)
// - Fiscal year-end reporting reminder

import type {
  CompliancePlugin,
  ComplianceRule,
  ComplianceViolation,
  TransactionForCompliance,
  EntityComplianceConfig,
  ComplianceCheckResult,
} from '../types';

const RULES: ComplianceRule[] = [
  {
    id: 'US-001',
    region: 'united_states',
    name: 'Receipt Substantiation (>$75)',
    description: 'IRS requires substantiation (receipts) for business expenses over $75.',
    category: 'documentation',
  },
  {
    id: 'US-002',
    region: 'united_states',
    name: 'Meals Deductibility Review',
    description: 'Meals & Entertainment expenses should be reviewed for 50% deductibility limitation under IRC §274(n).',
    category: 'tax',
  },
  {
    id: 'US-003',
    region: 'united_states',
    name: '1099-NEC Threshold Monitoring',
    description: 'Vendors receiving cumulative payments of $600+ require a 1099-NEC filing.',
    category: 'threshold',
  },
  {
    id: 'US-004',
    region: 'united_states',
    name: 'Business Purpose Documentation',
    description: 'Deductible business expenses over $75 must document a clear business purpose.',
    category: 'documentation',
  },
  {
    id: 'US-005',
    region: 'united_states',
    name: 'Estimated Tax Payment Reminder',
    description: 'IRS quarterly estimated tax payments are due Apr 15, Jun 15, Sep 15, and Jan 15.',
    category: 'reporting',
  },
  {
    id: 'US-006',
    region: 'united_states',
    name: 'Fiscal Year-End Reporting',
    description: 'Reminder to prepare for year-end financial reporting and tax filings.',
    category: 'reporting',
  },
];

// IRS estimated tax due dates (month, day) — 1-indexed months
const ESTIMATED_TAX_DUE_DATES: [number, number][] = [
  [4, 15],  // Apr 15
  [6, 15],  // Jun 15
  [9, 15],  // Sep 15
  [1, 15],  // Jan 15
];

function checkReceiptSubstantiation(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    if (tx.currency !== 'USD') continue;
    if (tx.amount > 75 && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 250 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} ($${tx.amount.toFixed(2)}) exceeds $${tx.amount > 250 ? '250' : '75'} and is missing receipt substantiation.`,
        transactionId: tx.id,
        suggestion: 'Attach a receipt or invoice. IRS §274 requires substantiation for business expenses over $75.',
      });
    }
  }
}

function checkMealsDeductibility(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const mealsKeywords = ['meals', 'entertainment', 'dining', 'restaurant', 'food & drink'];

  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (mealsKeywords.some((kw) => category.includes(kw))) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} ($${tx.amount.toFixed(2)}) is categorized as "${tx.category_human || tx.category_ai}" — verify 50% deductibility limitation applies.`,
        transactionId: tx.id,
        suggestion: 'Under IRC §274(n), meals are generally 50% deductible. Confirm this transaction qualifies and is correctly limited.',
      });
    }
  }
}

function checkVendor1099Threshold(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];

  // Aggregate payments by merchant name
  const vendorTotals = new Map<string, { total: number; txIds: string[] }>();
  for (const tx of transactions) {
    const vendor = tx.merchant_name?.trim();
    if (!vendor) continue;
    if (tx.currency !== 'USD') continue;
    if (tx.amount <= 0) continue; // Only outgoing payments

    const normalised = vendor.toLowerCase();
    const existing = vendorTotals.get(normalised) || { total: 0, txIds: [] };
    existing.total += tx.amount;
    existing.txIds.push(tx.id);
    vendorTotals.set(normalised, existing);
  }

  for (const [vendor, data] of vendorTotals) {
    if (data.total >= 600) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Vendor "${vendor}" has cumulative payments of $${data.total.toFixed(2)} (${data.txIds.length} transaction(s)) — meets 1099-NEC filing threshold ($600).`,
        suggestion: 'Collect W-9 from this vendor and file Form 1099-NEC by January 31 of the following year.',
      });
    } else if (data.total >= 400) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Vendor "${vendor}" has cumulative payments of $${data.total.toFixed(2)} (${data.txIds.length} transaction(s)) — approaching 1099-NEC threshold ($600).`,
        suggestion: 'Monitor this vendor. If total payments reach $600, a 1099-NEC filing will be required.',
      });
    }
  }
}

function checkBusinessPurposeDocumentation(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    if (tx.currency !== 'USD') continue;
    if (tx.amount > 75 && (!tx.notes || tx.notes.trim() === '')) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} ($${tx.amount.toFixed(2)}) lacks business purpose documentation.`,
        transactionId: tx.id,
        suggestion: 'Add a note describing the business purpose. IRS may disallow deductions without documented business purpose.',
      });
    }
  }
}

function checkEstimatedTaxReminder(violations: ComplianceViolation[]): void {
  const rule = RULES[4];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const currentDay = now.getDate();

  for (const [dueMonth, dueDay] of ESTIMATED_TAX_DUE_DATES) {
    // Calculate days until due date (handle year boundary for Jan 15)
    const currentYear = now.getFullYear();
    let dueYear = currentYear;
    if (dueMonth === 1 && currentMonth >= 10) {
      // Jan 15 of next year when we're in Q4
      dueYear = currentYear + 1;
    }
    const dueDate = new Date(dueYear, dueMonth - 1, dueDay);
    const diffMs = dueDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays <= 30) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `IRS estimated tax payment is due ${dueMonth.toString().padStart(2, '0')}/${dueDay.toString().padStart(2, '0')}/${dueYear}. ${diffDays} day(s) remaining.`,
        suggestion: 'Calculate and submit quarterly estimated tax payment via IRS Direct Pay or EFTPS.',
      });
    }
  }
}

function checkFiscalYearEnd(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[5];
  const now = new Date();

  // Parse fiscal year end from config (format: "MM-DD")
  const fyEnd = config.fiscalYearStart; // Actually used as fiscal year end marker
  if (!fyEnd) return;

  const [monthStr, dayStr] = fyEnd.split('-');
  const fyMonth = parseInt(monthStr, 10);
  const fyDay = parseInt(dayStr, 10);
  if (isNaN(fyMonth) || isNaN(fyDay)) {
    console.error(`[US-006] Invalid fiscal year date format: "${fyEnd}"`);
    return;
  }

  // Compute next fiscal year-end date
  const currentYear = now.getFullYear();
  let fyDate = new Date(currentYear, fyMonth - 1, fyDay);
  if (fyDate.getTime() < now.getTime()) {
    fyDate = new Date(currentYear + 1, fyMonth - 1, fyDay);
  }

  const diffMs = fyDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 0 && diffDays <= 60) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Fiscal year-end is ${fyMonth.toString().padStart(2, '0')}/${fyDay.toString().padStart(2, '0')}. ${diffDays} day(s) remaining — begin year-end close preparations.`,
      suggestion: 'Reconcile accounts, review accruals, and prepare for annual tax filings (Form 1120/1065/1040 Schedule C).',
    });
  }
}

export const unitedStatesPlugin: CompliancePlugin = {
  region: 'united_states',
  name: 'United States Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkReceiptSubstantiation(transactions, violations);
    checkMealsDeductibility(transactions, violations);
    checkVendor1099Threshold(transactions, violations);
    checkBusinessPurposeDocumentation(transactions, violations);
    checkEstimatedTaxReminder(violations);
    checkFiscalYearEnd(violations, entityConfig);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const infoCount = violations.filter((v) => v.severity === 'info').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5 - infoCount * 1
    );

    return {
      region: 'united_states',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `US GAAP/IRS compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s), ${infoCount} info. Score: ${score}/100.`,
    };
  },
};
