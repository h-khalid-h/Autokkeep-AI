// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — South Africa 🇿🇦
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (15% standard, 0% zero-rated)
// - VAT registration threshold (R1,000,000 ZAR annually)
// - Tax invoice required for transactions > R50 ZAR
// - Bi-monthly VAT return (SARS Category A vendors)
// - 5-year record retention (SARS)

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
    id: 'ZA-001',
    region: 'south_africa',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 15% standard or 0% zero-rated.',
    category: 'tax',
  },
  {
    id: 'ZA-002',
    region: 'south_africa',
    name: 'VAT Registration Threshold',
    description: 'VAT registration is mandatory if taxable supplies exceed R1,000,000 ZAR annually.',
    category: 'threshold',
  },
  {
    id: 'ZA-003',
    region: 'south_africa',
    name: 'Tax Invoice Required (> R50 ZAR)',
    description: 'SARS requires a tax invoice for all transactions exceeding R50.',
    category: 'documentation',
  },
  {
    id: 'ZA-004',
    region: 'south_africa',
    name: 'Bi-Monthly VAT Return',
    description: 'SARS Category A vendors must file VAT returns bi-monthly (every 2 months).',
    category: 'reporting',
  },
  {
    id: 'ZA-005',
    region: 'south_africa',
    name: '5-Year Record Retention',
    description: 'SARS requires retention of all tax records for a minimum of 5 years.',
    category: 'reporting',
  },
];

const BI_MONTHLY_FILING_MONTHS = [1, 3, 5, 7, 9, 11]; // Jan, Mar, May, Jul, Sep, Nov

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_15',
    'vat_standard_15',
    'vat_0',
    'vat_zero_rated',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid South African rates: 15% (standard) or 0% (zero-rated).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid South African VAT rate: 15% (standard) or 0% (zero-rated).',
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
  const zarTransactions = transactions.filter((tx) => tx.currency === 'ZAR' && tx.amount > 0);
  const totalTaxableSupplies = zarTransactions.reduce((sum, tx) => sum + tx.amount, 0);

  if (totalTaxableSupplies > 1_000_000 && !config.taxId) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Taxable supplies total R${totalTaxableSupplies.toFixed(2)} ZAR, exceeding the R1,000,000 registration threshold, but no VAT number is on file.`,
      suggestion: 'Register for VAT with SARS immediately — registration is mandatory when taxable supplies exceed R1,000,000 annually.',
    });
  }
}

function checkTaxInvoice(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 50 && tx.currency === 'ZAR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 5000 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (R${tx.amount.toFixed(2)}) exceeds R50 threshold but has no tax invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Obtain and attach a valid tax invoice to comply with SARS documentation requirements.',
      });
    }
  }
}

function checkBiMonthlyVatFiling(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  if (BI_MONTHLY_FILING_MONTHS.includes(currentMonth) && now.getDate() <= 25) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Bi-monthly VAT return is due by the 25th of this month (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'Submit bi-monthly VAT201 return via SARS eFiling.',
    });
  }
}

function checkRecordRetention(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const now = new Date();
  const month = now.getMonth() + 1;

  if (month === 3 && now.getDate() <= 31) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'Annual reminder: verify that all tax records from 5+ years ago are properly archived per SARS requirements.',
      suggestion: 'Review record retention policy and ensure all invoices, receipts, and returns from the past 5 years are securely stored.',
    });
  }
}

export const southAfricaPlugin: CompliancePlugin = {
  region: 'south_africa',
  name: 'South Africa Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkVatRegistration(transactions, violations, entityConfig);
    checkTaxInvoice(transactions, violations);
    checkBiMonthlyVatFiling(violations);
    checkRecordRetention(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'south_africa',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `South Africa compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
