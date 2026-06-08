// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Kenya 🇰🇪
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (16% standard, 8% petroleum, 0% exported services)
// - eTIMS mandatory compliance
// - Monthly VAT return (KRA filing by 20th)
// - 5-year record retention (KRA)

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
    id: 'KE-001',
    region: 'kenya',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 16% standard, 8% petroleum, 0% exported services.',
    category: 'tax',
  },
  {
    id: 'KE-002',
    region: 'kenya',
    name: 'eTIMS Compliance',
    description: 'Electronic Tax Invoice Management System (eTIMS) is mandatory for all taxpayers.',
    category: 'documentation',
  },
  {
    id: 'KE-003',
    region: 'kenya',
    name: 'Monthly VAT Return',
    description: 'KRA requires monthly VAT return filing by the 20th of the following month.',
    category: 'reporting',
  },
  {
    id: 'KE-004',
    region: 'kenya',
    name: '5-Year Record Retention',
    description: 'KRA requires retention of all tax records for a minimum of 5 years.',
    category: 'reporting',
  },
];

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_16',
    'vat_standard_16',
    'vat_8',
    'vat_petroleum_8',
    'vat_0',
    'vat_exempt',
    'vat_zero_rated',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid Kenyan rates: 16% (standard), 8% (petroleum), 0% (exported services).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Kenyan VAT rate: 16% (standard), 8% (petroleum), or 0% (exported services/zero-rated).',
        });
      }
    }
  }
}

function checkEtimsCompliance(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    if (tx.amount > 0 && tx.currency === 'KES' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (KES ${tx.amount.toFixed(2)}) is missing an eTIMS-compliant tax invoice.`,
        transactionId: tx.id,
        suggestion: 'Generate and attach an eTIMS-compliant invoice via the KRA eTIMS system.',
      });
    }
  }
}

function checkMonthlyVatReturn(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const now = new Date();
  const day = now.getDate();

  if (day <= 20) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: day >= 17 ? 'warning' : 'info',
      message: `KRA monthly VAT return is due by the 20th of this month (${now.toISOString().slice(0, 7)}). ${20 - day} day(s) remaining.`,
      suggestion: 'Submit monthly VAT return via the KRA iTax portal.',
    });
  }
}

function checkRecordRetention(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  const now = new Date();
  const month = now.getMonth() + 1;

  if (month === 1 && now.getDate() <= 31) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'Annual reminder: verify that all tax records from 5+ years ago are properly archived per KRA requirements.',
      suggestion: 'Review record retention policy and ensure all invoices, receipts, and returns from the past 5 years are securely stored.',
    });
  }
}

export const kenyaPlugin: CompliancePlugin = {
  region: 'kenya',
  name: 'Kenya Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    _entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkEtimsCompliance(transactions, violations);
    checkMonthlyVatReturn(violations);
    checkRecordRetention(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'kenya',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Kenya compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
