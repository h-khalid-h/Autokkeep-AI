// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Australia 🇦🇺
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - GST rate validation (10% standard, 0% GST-free)
// - BAS reporting — quarterly/monthly Business Activity Statement
// - Tax invoice required for GST claims > $82.50 AUD (incl. GST)
// - PAYG withholding obligations for contractors
// - 5-year record retention per ATO requirements

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
    id: 'AU-001',
    region: 'australia',
    name: 'GST Rate Validation',
    description: 'Validate GST rates: 10% standard, 0% GST-free.',
    category: 'tax',
  },
  {
    id: 'AU-002',
    region: 'australia',
    name: 'BAS Reporting',
    description: 'Business Activity Statement must be lodged quarterly or monthly with the ATO.',
    category: 'reporting',
  },
  {
    id: 'AU-003',
    region: 'australia',
    name: 'Tax Invoice Required (> $82.50 AUD)',
    description: 'ATO requires a tax invoice for GST credit claims on purchases exceeding $82.50 (incl. GST).',
    category: 'documentation',
  },
  {
    id: 'AU-004',
    region: 'australia',
    name: 'PAYG Withholding',
    description: 'Pay-as-you-go withholding obligations apply for payments to contractors without an ABN.',
    category: 'tax',
  },
  {
    id: 'AU-005',
    region: 'australia',
    name: '5-Year Record Retention',
    description: 'ATO requires business records to be retained for at least 5 years.',
    category: 'reporting',
  },
];

const BAS_QUARTERLY_MONTHS = [7, 10, 1, 4]; // Jul, Oct, Jan, Apr (due 28th of following month)

function checkGstRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validGstCategories = [
    'gst_standard_10',
    'gst_free_0',
    'gst_10',
    'gst_0',
    'gst_free',
    'gst_exempt',
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
          message: `Transaction ${tx.id} has unrecognized GST category "${category}". Valid Australian rates: 10% (standard), 0% (GST-free).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Australian GST rate: 10% (standard) or 0% (GST-free/exempt).',
        });
      }
    }
  }
}

function checkBasReporting(
  violations: ComplianceViolation[],
  _config: EntityComplianceConfig
): void {
  const rule = RULES[1];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  // BAS is due on the 28th of the month following the end of each quarter
  if (BAS_QUARTERLY_MONTHS.includes(currentMonth) && now.getDate() <= 28) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Quarterly BAS lodgement is due by the 28th of this month (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'Lodge your Business Activity Statement via the ATO Business Portal or through your registered tax agent.',
    });
  }
}

function checkTaxInvoiceRequired(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 82.50 && tx.currency === 'AUD' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 1000 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} exceeds $82.50 AUD ($${tx.amount.toFixed(2)}) but has no tax invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Obtain and attach a valid tax invoice to claim GST credits for purchases over $82.50 (incl. GST).',
      });
    }
  }
}

function checkPaygWithholding(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (
      category &&
      (category.toLowerCase().includes('contractor') || category.toLowerCase().includes('subcontractor')) &&
      tx.currency === 'AUD' &&
      tx.amount > 0
    ) {
      const notes = tx.notes?.toLowerCase() || '';
      if (!notes.includes('abn') && !notes.includes('withholding')) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} appears to be a contractor payment ($${tx.amount.toFixed(2)} AUD) without ABN or PAYG withholding notation.`,
          transactionId: tx.id,
          suggestion: 'Verify the contractor has provided a valid ABN. If no ABN is quoted, withhold 47% under PAYG withholding rules.',
        });
      }
    }
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
        message: `Transaction ${tx.id} (${tx.date}) is older than 5 years and missing documentation. ATO retention period may still apply.`,
        transactionId: tx.id,
        suggestion: 'Ensure records for this transaction are retained per ATO 5-year requirement. Locate and attach documentation if available.',
      });
    }
  }
}

export const australiaPlugin: CompliancePlugin = {
  region: 'australia',
  name: 'Australia Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkGstRates(transactions, violations);
    checkBasReporting(violations, entityConfig);
    checkTaxInvoiceRequired(transactions, violations);
    checkPaygWithholding(transactions, violations);
    checkRecordRetention(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'australia',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Australia compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
