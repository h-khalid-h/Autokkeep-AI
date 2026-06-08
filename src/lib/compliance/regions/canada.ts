// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Canada 🇨🇦
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - GST/HST registration threshold ($30,000 CAD revenue)
// - CRA receipt required for expenses over $75 CAD
// - Input Tax Credit (ITC) documentation verification
// - T2 Corporate Return deadline (6 months after fiscal year end)
// - GST/HST quarterly/annual filing reminder

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
    id: 'CA-001',
    region: 'canada',
    name: 'GST/HST Registration',
    description: 'Businesses exceeding $30,000 CAD revenue must register for GST/HST.',
    category: 'tax',
  },
  {
    id: 'CA-002',
    region: 'canada',
    name: 'Receipt Required (> $75 CAD)',
    description: 'CRA requires receipts for expenses over $75 CAD.',
    category: 'documentation',
  },
  {
    id: 'CA-003',
    region: 'canada',
    name: 'Input Tax Credits (ITC)',
    description: 'Verify proper ITC documentation for GST/HST paid on business expenses.',
    category: 'tax',
  },
  {
    id: 'CA-004',
    region: 'canada',
    name: 'T2 Corporate Return Deadline',
    description: 'Annual corporate tax return due 6 months after fiscal year end.',
    category: 'reporting',
  },
  {
    id: 'CA-005',
    region: 'canada',
    name: 'GST/HST Filing',
    description: 'Quarterly or annual GST/HST return must be filed with CRA.',
    category: 'reporting',
  },
];

const GST_HST_REGISTRATION_THRESHOLD = 30_000; // $30,000 CAD
const GST_HST_FILING_MONTHS = [1, 4, 7, 10]; // Quarterly: Jan, Apr, Jul, Oct

function checkGstHstRegistration(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[0];
  const totalRevenue = transactions
    .filter((tx) => tx.amount > 0 && tx.currency === 'CAD')
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalRevenue > GST_HST_REGISTRATION_THRESHOLD && !config.taxId) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Total CAD revenue ($${totalRevenue.toFixed(2)}) exceeds $30,000 threshold but no GST/HST registration (BN) is on file.`,
      suggestion: 'Register for a GST/HST account with the Canada Revenue Agency (CRA) and provide your Business Number (BN).',
    });
  } else if (totalRevenue > 25_000 && !config.taxId) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `Total CAD revenue ($${totalRevenue.toFixed(2)}) is approaching the $30,000 GST/HST registration threshold.`,
      suggestion: 'Consider proactive GST/HST registration with CRA before exceeding the $30,000 threshold.',
    });
  }
}

function checkReceiptRequired(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    if (tx.amount > 75 && tx.currency === 'CAD' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 500 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} ($${tx.amount.toFixed(2)} CAD) exceeds $75 but has no receipt attached.`,
        transactionId: tx.id,
        suggestion: 'CRA requires original receipts for expense claims over $75. Upload the receipt to remain compliant.',
      });
    }
  }
}

function checkInputTaxCredits(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.toLowerCase().includes('itc')) {
      if (tx.document_status !== 'found') {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'violation',
          message: `Transaction ${tx.id} claims Input Tax Credit but has no supporting invoice or receipt.`,
          transactionId: tx.id,
          suggestion: 'ITC claims require documentation showing the supplier\'s GST/HST registration number, amount of tax paid, and date. Attach the invoice.',
        });
      }
      if (!tx.merchant_name) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} claims Input Tax Credit but has no supplier/merchant name recorded.`,
          transactionId: tx.id,
          suggestion: 'ITC documentation must identify the supplier. Add the merchant name to this transaction.',
        });
      }
    }
  }
}

function checkT2CorporateReturn(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[3];
  const now = new Date();

  // Determine fiscal year end from config, default to December 31
  const fyStartStr = config.fiscalYearStart || '01-01'; // MM-DD
  const [fyStartMonth] = fyStartStr.split('-').map(Number);
  // Fiscal year end is one month before the start month of the next cycle
  const fyEndMonth = fyStartMonth === 1 ? 12 : fyStartMonth - 1;

  // T2 is due 6 months after fiscal year end
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const deadlineMonth = ((fyEndMonth + 6 - 1) % 12) + 1;
  const deadlineYear = fyEndMonth + 6 > 12 ? now.getFullYear() : now.getFullYear();

  // Warn in the 2 months before deadline
  const monthsUntil = ((deadlineMonth - currentMonth + 12) % 12);
  if (monthsUntil <= 2 && monthsUntil > 0) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `T2 Corporate Income Tax Return is due within ${monthsUntil} month(s) (month ${deadlineMonth}/${deadlineYear}).`,
      suggestion: 'Prepare and file the T2 Corporate Income Tax Return with CRA before the deadline.',
    });
  } else if (monthsUntil === 0 && now.getDate() <= 28) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `T2 Corporate Income Tax Return is due this month (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'File the T2 return with CRA immediately to avoid late-filing penalties (5% of balance owing + 1% per month).',
    });
  }
}

function checkGstHstFiling(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  if (!config.taxId) return; // Only relevant for registered businesses

  const rule = RULES[4];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  if (GST_HST_FILING_MONTHS.includes(currentMonth) && now.getDate() <= 28) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `GST/HST return filing period is open this month (${now.toISOString().slice(0, 7)}). Due by the end of the month.`,
      suggestion: 'File your GST/HST return via CRA My Business Account or through your accountant.',
    });
  }
}

export const canadaPlugin: CompliancePlugin = {
  region: 'canada',
  name: 'Canada Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkGstHstRegistration(transactions, violations, entityConfig);
    checkReceiptRequired(transactions, violations);
    checkInputTaxCredits(transactions, violations);
    checkT2CorporateReturn(violations, entityConfig);
    checkGstHstFiling(violations, entityConfig);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'canada',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Canada compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
