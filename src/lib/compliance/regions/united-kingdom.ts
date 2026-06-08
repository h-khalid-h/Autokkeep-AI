// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — United Kingdom 🇬🇧
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - Making Tax Digital (MTD) — VAT returns must be filed digitally
// - VAT rate validation (20% standard, 5% reduced, 0% zero-rated)
// - Receipt required for expenses over £25 (CIS threshold)
// - CIS deduction verification for construction industry
// - Annual accounts filing deadline (Companies House)
// - Self Assessment deadline (January 31)

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
    id: 'GB-001',
    region: 'united_kingdom',
    name: 'Making Tax Digital (MTD)',
    description: 'VAT returns must be filed digitally via MTD-compatible software per HMRC requirements.',
    category: 'reporting',
  },
  {
    id: 'GB-002',
    region: 'united_kingdom',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 20% standard, 5% reduced, 0% zero-rated.',
    category: 'tax',
  },
  {
    id: 'GB-003',
    region: 'united_kingdom',
    name: 'Receipt Required (> £25)',
    description: 'Supporting documentation is required for all expenses over £25 GBP (CIS threshold).',
    category: 'documentation',
  },
  {
    id: 'GB-004',
    region: 'united_kingdom',
    name: 'CIS Deduction Verification',
    description: 'Construction Industry Scheme: verify contractor deductions are correctly applied at 20% or 30%.',
    category: 'tax',
  },
  {
    id: 'GB-005',
    region: 'united_kingdom',
    name: 'Annual Accounts Filing',
    description: 'Annual accounts must be filed with Companies House within 9 months of the accounting reference date.',
    category: 'reporting',
  },
  {
    id: 'GB-006',
    region: 'united_kingdom',
    name: 'Self Assessment Deadline',
    description: 'Self Assessment tax return must be filed online by January 31 following the end of the tax year.',
    category: 'reporting',
  },
];

function checkMakingTaxDigital(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[0];

  // Flag if there are VAT-categorised transactions but the entity is not registered for MTD
  const vatTransactions = transactions.filter((tx) => {
    const category = tx.category_human || tx.category_ai;
    return category && category.toLowerCase().startsWith('vat_');
  });

  if (vatTransactions.length > 0 && config.registrationType !== 'mtd') {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `${vatTransactions.length} VAT-categorised transaction(s) found but entity is not registered for Making Tax Digital.`,
      suggestion: 'Register for MTD with HMRC and file VAT returns using MTD-compatible software.',
    });
  }
}

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const validVatCategories = [
    'vat_standard_20',
    'vat_reduced_5',
    'vat_zero_0',
    'vat_20',
    'vat_5',
    'vat_0',
  ];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.startsWith('vat_')) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      if (!validVatCategories.includes(normalised)) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid UK rates: 20%, 5%, 0%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid UK VAT rate: 20% (standard), 5% (reduced), or 0% (zero-rated).',
        });
      }
    }
  }
}

function checkDocumentation(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 25 && tx.currency === 'GBP' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 100 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (£${tx.amount.toFixed(2)}) is missing a receipt or invoice.`,
        transactionId: tx.id,
        suggestion: 'Upload the receipt or invoice for this expense to satisfy CIS documentation requirements.',
      });
    }
  }
}

function checkCisDeductions(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.toLowerCase().includes('cis')) {
      // CIS transactions should have documentation attached
      if (tx.document_status !== 'found') {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'violation',
          message: `CIS transaction ${tx.id} (£${tx.amount.toFixed(2)}) is missing deduction verification documentation.`,
          transactionId: tx.id,
          suggestion: 'Attach CIS deduction statement from the contractor. HMRC requires verification of 20% or 30% deduction rates.',
        });
      }
    }
  }
}

function checkAnnualAccountsFiling(violations: ComplianceViolation[]): void {
  const rule = RULES[4];
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Warn in September (typical deadline month for March year-end companies)
  // Companies House requires filing within 9 months of year-end
  if ((month === 8 && day >= 15) || (month === 9 && day <= 30)) {
    const daysLeft = month === 8 ? 30 - day + 30 : 30 - day;
    violations.push({
      ruleId: rule.id,
      rule,
      severity: daysLeft <= 7 ? 'violation' : 'warning',
      message: `Companies House annual accounts filing deadline approaching. ${daysLeft} day(s) remaining (typical September 30 deadline).`,
      suggestion: 'Prepare and submit annual accounts via Companies House WebFiling portal.',
    });
  }
}

function checkSelfAssessmentDeadline(violations: ComplianceViolation[]): void {
  const rule = RULES[5];
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Warn in January (deadline is January 31)
  if (month === 1 && day <= 31) {
    const daysLeft = 31 - day;
    violations.push({
      ruleId: rule.id,
      rule,
      severity: daysLeft <= 7 ? 'violation' : 'warning',
      message: `Self Assessment tax return deadline is January 31. ${daysLeft} day(s) remaining.`,
      suggestion: 'Submit your Self Assessment tax return online via HMRC before the January 31 deadline.',
    });
  }
  // Also warn in late December
  if (month === 12 && day >= 15) {
    const daysLeft = 31 - day + 31; // rest of Dec + 31 Jan days
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Self Assessment tax return deadline is January 31. ${daysLeft} day(s) remaining.`,
      suggestion: 'Begin preparing your Self Assessment tax return for submission to HMRC.',
    });
  }
}

export const unitedKingdomPlugin: CompliancePlugin = {
  region: 'united_kingdom',
  name: 'United Kingdom Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkMakingTaxDigital(transactions, violations, entityConfig);
    checkVatRates(transactions, violations);
    checkDocumentation(transactions, violations);
    checkCisDeductions(transactions, violations);
    checkAnnualAccountsFiling(violations);
    checkSelfAssessmentDeadline(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'united_kingdom',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `United Kingdom compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
