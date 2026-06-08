// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Singapore 🇸🇬
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - GST rate validation (9% standard, 2024+)
// - GST registration threshold ($1M SGD taxable turnover)
// - Tax invoice required (> $1,000 SGD full invoice, simplified below)
// - Estimated Chargeable Income (ECI) filing within 3 months of FYE
// - 5-year record retention per IRAS requirements

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
    id: 'SG-001',
    region: 'singapore',
    name: 'GST Rate Validation',
    description: 'Validate GST rate: 9% standard (effective 1 Jan 2024).',
    category: 'tax',
  },
  {
    id: 'SG-002',
    region: 'singapore',
    name: 'GST Registration Threshold',
    description: 'GST registration is mandatory if taxable turnover exceeds $1,000,000 SGD.',
    category: 'threshold',
  },
  {
    id: 'SG-003',
    region: 'singapore',
    name: 'Tax Invoice Required (> $1,000 SGD)',
    description: 'Full tax invoice required for transactions over $1,000 SGD; simplified invoice allowed below.',
    category: 'documentation',
  },
  {
    id: 'SG-004',
    region: 'singapore',
    name: 'Estimated Chargeable Income (ECI)',
    description: 'ECI must be filed with IRAS within 3 months of the end of the fiscal year.',
    category: 'reporting',
  },
  {
    id: 'SG-005',
    region: 'singapore',
    name: '5-Year Record Retention',
    description: 'IRAS requires business records to be retained for at least 5 years.',
    category: 'reporting',
  },
];

function checkGstRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validGstCategories = [
    'gst_standard_9',
    'gst_9',
    'gst_exempt',
    'gst_0',
    'gst_zero_rated',
  ];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.startsWith('gst_')) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      if (!validGstCategories.includes(normalised)) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized GST category "${category}". Singapore standard rate is 9% (since 1 Jan 2024).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Singapore GST rate: 9% (standard), 0% (zero-rated), or exempt.',
        });
      }
    }
  }
}

function checkGstRegistrationThreshold(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const sgdRevenue = transactions
    .filter((tx) => tx.currency === 'SGD' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (sgdRevenue > 1_000_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Taxable turnover ($${sgdRevenue.toFixed(2)} SGD) exceeds $1,000,000 SGD threshold. GST registration is mandatory.`,
      suggestion: 'Apply for GST registration with IRAS within 30 days of exceeding the $1M SGD threshold.',
    });
  } else if (sgdRevenue > 800_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Taxable turnover ($${sgdRevenue.toFixed(2)} SGD) is approaching the $1,000,000 SGD GST registration threshold.`,
      suggestion: 'Monitor revenue closely. Consider voluntary GST registration or prepare for mandatory registration.',
    });
  }
}

function checkTaxInvoiceRequired(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 1000 && tx.currency === 'SGD' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} exceeds $1,000 SGD ($${tx.amount.toFixed(2)}) but has no full tax invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Attach a full tax invoice. Simplified invoices are only permitted for transactions $1,000 SGD or below.',
      });
    } else if (
      tx.amount > 0 &&
      tx.amount <= 1000 &&
      tx.currency === 'SGD' &&
      tx.document_status !== 'found'
    ) {
      const category = tx.category_human || tx.category_ai;
      if (category && category.toLowerCase().includes('gst')) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} ($${tx.amount.toFixed(2)} SGD) is GST-related but missing a simplified or full tax invoice.`,
          transactionId: tx.id,
          suggestion: 'Attach at least a simplified tax invoice for GST input tax claims.',
        });
      }
    }
  }
}

function checkEciFiling(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[3];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // Default fiscal year end is December; parse from config if available
  let fyeMonth = 12;
  if (config.fiscalYearStart) {
    const startMonth = parseInt(config.fiscalYearStart.split('-')[0], 10);
    fyeMonth = startMonth === 1 ? 12 : startMonth - 1;
  }

  // ECI is due within 3 months of fiscal year end
  const eciDueMonth = ((fyeMonth - 1 + 3) % 12) + 1;

  if (currentMonth === eciDueMonth && now.getDate() <= 28) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `Estimated Chargeable Income (ECI) filing is due this month (${now.toISOString().slice(0, 7)}), within 3 months of fiscal year end.`,
      suggestion: 'File ECI with IRAS via the myTax Portal. Nil ECI filing is required even if there is no chargeable income.',
    });
  }
}

function checkRecordRetention(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    if (txDate < fiveYearsAgo && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} (${tx.date}) is older than 5 years and missing documentation. IRAS retention period may still apply.`,
        transactionId: tx.id,
        suggestion: 'Ensure records are retained per IRAS 5-year requirement. Locate and attach documentation if available.',
      });
    }
  }
}

export const singaporePlugin: CompliancePlugin = {
  region: 'singapore',
  name: 'Singapore Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkGstRates(transactions, violations);
    checkGstRegistrationThreshold(transactions, violations);
    checkTaxInvoiceRequired(transactions, violations);
    checkEciFiling(violations, entityConfig);
    checkRecordRetention(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'singapore',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Singapore compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
