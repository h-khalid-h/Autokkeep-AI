// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — UAE 🇦🇪
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (5% standard, 0% zero-rated, exempt)
// - VAT registration mandatory if taxable supplies > AED 375,000
// - Full tax invoice required for supplies > AED 10,000
// - Quarterly VAT return filing with FTA
// - Corporate tax at 9% on profits > AED 375,000 (effective June 2023)

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
    id: 'AE-001',
    region: 'uae',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 5% standard, 0% zero-rated, exempt.',
    category: 'tax',
  },
  {
    id: 'AE-002',
    region: 'uae',
    name: 'VAT Registration Threshold',
    description: 'VAT registration is mandatory if taxable supplies exceed AED 375,000. Voluntary registration at AED 187,500.',
    category: 'threshold',
  },
  {
    id: 'AE-003',
    region: 'uae',
    name: 'Tax Invoice Requirements',
    description: 'A full tax invoice is required for supplies exceeding AED 10,000.',
    category: 'documentation',
  },
  {
    id: 'AE-004',
    region: 'uae',
    name: 'Quarterly VAT Return',
    description: 'VAT returns must be filed quarterly with the Federal Tax Authority (FTA).',
    category: 'reporting',
  },
  {
    id: 'AE-005',
    region: 'uae',
    name: 'Corporate Tax',
    description: 'Corporate tax at 9% applies to taxable profits exceeding AED 375,000 (effective June 2023).',
    category: 'tax',
  },
];

const VAT_FILING_MONTHS = [1, 4, 7, 10]; // Jan, Apr, Jul, Oct

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_standard_5',
    'vat_zero_0',
    'vat_exempt',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid UAE rates: 5% (standard), 0% (zero-rated), or exempt.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid UAE VAT rate: 5% (standard), 0% (zero-rated), or exempt.',
        });
      }
    }
  }
}

function checkVatRegistrationThreshold(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const totalSupplies = transactions
    .filter((tx) => tx.currency === 'AED' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalSupplies > 375_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Total taxable supplies (AED ${totalSupplies.toFixed(2)}) exceed the mandatory VAT registration threshold of AED 375,000.`,
      suggestion: 'Register for VAT with the Federal Tax Authority (FTA) immediately — registration is mandatory.',
    });
  } else if (totalSupplies > 187_500) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Total taxable supplies (AED ${totalSupplies.toFixed(2)}) exceed the voluntary VAT registration threshold of AED 187,500.`,
      suggestion: 'Consider voluntary VAT registration with the FTA to reclaim input VAT.',
    });
  }
}

function checkTaxInvoiceRequirements(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 10_000 && tx.currency === 'AED' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} exceeds AED 10,000 (AED ${tx.amount.toFixed(2)}) but has no full tax invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Attach a full tax invoice showing TRN, supply description, VAT amount, and total for supplies over AED 10,000.',
      });
    }
  }
}

function checkQuarterlyVatFiling(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  if (VAT_FILING_MONTHS.includes(currentMonth) && now.getDate() <= 28) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Quarterly VAT return filing is due by the 28th of this month (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'Submit quarterly VAT return via the FTA e-Services portal.',
    });
  }
}

function checkCorporateTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const totalRevenue = transactions
    .filter((tx) => tx.currency === 'AED' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalRevenue > 375_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `Total revenue (AED ${totalRevenue.toFixed(2)}) exceeds AED 375,000. Corporate tax at 9% applies to profits above this threshold.`,
      suggestion: 'Ensure corporate tax obligations are met — 9% applies to taxable profits exceeding AED 375,000. File with the FTA.',
    });
  }
}

export const uaePlugin: CompliancePlugin = {
  region: 'uae',
  name: 'UAE Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    _entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkVatRegistrationThreshold(transactions, violations);
    checkTaxInvoiceRequirements(transactions, violations);
    checkQuarterlyVatFiling(violations);
    checkCorporateTax(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'uae',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `UAE compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
