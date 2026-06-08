// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Nigeria 🇳🇬
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (7.5% standard)
// - VAT registration mandatory for all taxable persons
// - Monthly VAT return (FIRS filing by 21st)
// - 6-year record retention (FIRS)

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
    id: 'NG-001',
    region: 'nigeria',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rate: 7.5% standard rate.',
    category: 'tax',
  },
  {
    id: 'NG-002',
    region: 'nigeria',
    name: 'VAT Registration',
    description: 'VAT registration is mandatory for all taxable persons (no threshold).',
    category: 'threshold',
  },
  {
    id: 'NG-003',
    region: 'nigeria',
    name: 'Monthly VAT Return',
    description: 'FIRS requires monthly VAT return filing by the 21st of the following month.',
    category: 'reporting',
  },
  {
    id: 'NG-004',
    region: 'nigeria',
    name: '6-Year Record Retention',
    description: 'FIRS requires retention of all tax records for a minimum of 6 years.',
    category: 'reporting',
  },
];

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_7_5',
    'vat_standard_7_5',
    'vat_0',
    'vat_exempt',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Standard Nigerian VAT rate is 7.5%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with the correct Nigerian VAT rate: 7.5% (standard) or 0% (exempt).',
        });
      }
    }
  }
}

function checkVatRegistration(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[1];
  const ngnTransactions = transactions.filter((tx) => tx.currency === 'NGN' && tx.amount > 0);

  // No threshold — all taxable persons must register
  if (ngnTransactions.length > 0 && !config.taxId) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: 'Entity has taxable transactions in NGN but no VAT registration number (TIN) is on file.',
      suggestion: 'Register for VAT with FIRS immediately — registration is mandatory for all taxable persons regardless of turnover.',
    });
  }
}

function checkMonthlyVatReturn(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const now = new Date();
  const day = now.getDate();

  if (day <= 21) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: day >= 18 ? 'warning' : 'info',
      message: `FIRS monthly VAT return is due by the 21st of this month (${now.toISOString().slice(0, 7)}). ${21 - day} day(s) remaining.`,
      suggestion: 'Submit monthly VAT return via the FIRS TaxPro Max portal.',
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
      message: 'Annual reminder: verify that all tax records from 6+ years ago are properly archived per FIRS requirements.',
      suggestion: 'Review record retention policy and ensure all invoices, receipts, and returns from the past 6 years are securely stored.',
    });
  }
}

export const nigeriaPlugin: CompliancePlugin = {
  region: 'nigeria',
  name: 'Nigeria Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkVatRegistration(transactions, violations, entityConfig);
    checkMonthlyVatReturn(violations);
    checkRecordRetention(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'nigeria',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Nigeria compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
