// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Saudi Arabia 🇸🇦
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (15% standard)
// - ZATCA e-invoicing (Fatoorah) mandate for all B2B invoices
// - VAT registration mandatory if annual taxable supplies > SAR 375,000
// - Zakat obligation at 2.5% on adjusted net profit for Saudi-owned entities
// - Monthly/quarterly VAT return filing with ZATCA

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
    id: 'SA-001',
    region: 'saudi_arabia',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rate: 15% standard rate applies to most goods and services.',
    category: 'tax',
  },
  {
    id: 'SA-002',
    region: 'saudi_arabia',
    name: 'ZATCA E-Invoicing (Fatoorah)',
    description: 'All B2B invoices must be issued electronically per the ZATCA Fatoorah mandate.',
    category: 'documentation',
  },
  {
    id: 'SA-003',
    region: 'saudi_arabia',
    name: 'VAT Registration Threshold',
    description: 'VAT registration is mandatory if annual taxable supplies exceed SAR 375,000.',
    category: 'threshold',
  },
  {
    id: 'SA-004',
    region: 'saudi_arabia',
    name: 'Zakat Obligation',
    description: 'Saudi-owned entities must pay 2.5% zakat on the company\'s adjusted net profit.',
    category: 'tax',
  },
  {
    id: 'SA-005',
    region: 'saudi_arabia',
    name: 'Monthly/Quarterly VAT Return',
    description: 'VAT returns must be filed with ZATCA monthly (if supplies > SAR 40M) or quarterly.',
    category: 'reporting',
  },
];

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_standard_15',
    'vat_zero_0',
    'vat_exempt',
    'vat_15',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". The standard Saudi VAT rate is 15%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Saudi VAT rate: 15% (standard), 0% (zero-rated), or exempt.',
        });
      }
    }
  }
}

function checkZatcaEInvoicing(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    if (tx.amount > 0 && tx.currency === 'SAR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 5_000 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (SAR ${tx.amount.toFixed(2)}) is missing an electronic invoice. ZATCA Fatoorah mandate requires all B2B invoices to be electronic.`,
        transactionId: tx.id,
        suggestion: 'Issue a ZATCA-compliant electronic invoice (Fatoorah) with QR code, UUID, and XML integration.',
      });
    }
  }
}

function checkVatRegistrationThreshold(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const totalSupplies = transactions
    .filter((tx) => tx.currency === 'SAR' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalSupplies > 375_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Total taxable supplies (SAR ${totalSupplies.toFixed(2)}) exceed the mandatory VAT registration threshold of SAR 375,000.`,
      suggestion: 'Register for VAT with ZATCA immediately — registration is mandatory above SAR 375,000 in annual taxable supplies.',
    });
  }
}

function checkZakatObligation(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[3];
  const totalRevenue = transactions
    .filter((tx) => tx.currency === 'SAR' && tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (totalRevenue > 0 && config.registrationType !== 'foreign') {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Total revenue is SAR ${totalRevenue.toFixed(2)}. Saudi-owned entities are subject to 2.5% zakat on adjusted net profit.`,
      suggestion: 'Calculate and provision for zakat at 2.5% of the adjusted net profit. File zakat declaration with ZATCA.',
    });
  }
}

function checkVatReturnFiling(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed
  const day = now.getDate();

  // Quarterly filing months: end of Jan, Apr, Jul, Oct (due by last day of following month)
  const quarterlyFilingMonths = [1, 4, 7, 10];

  if (quarterlyFilingMonths.includes(currentMonth) && day <= 30) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `VAT return filing is due by the end of this month (${now.toISOString().slice(0, 7)}). File with ZATCA.`,
      suggestion: 'Submit VAT return via the ZATCA online portal before the deadline to avoid penalties.',
    });
  }
}

export const saudiArabiaPlugin: CompliancePlugin = {
  region: 'saudi_arabia',
  name: 'Saudi Arabia Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkZatcaEInvoicing(transactions, violations);
    checkVatRegistrationThreshold(transactions, violations);
    checkZakatObligation(transactions, violations, entityConfig);
    checkVatReturnFiling(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'saudi_arabia',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Saudi Arabia compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
