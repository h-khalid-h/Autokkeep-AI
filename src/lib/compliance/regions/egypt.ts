// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Egypt 🇪🇬
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (14% standard)
// - ETA e-invoicing mandatory for B2B
// - Monthly VAT return filing
// - 5-year record retention (Egyptian Tax Authority)

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
    id: 'EG-001',
    region: 'egypt',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rate: 14% standard rate.',
    category: 'tax',
  },
  {
    id: 'EG-002',
    region: 'egypt',
    name: 'E-Invoice Mandate',
    description: 'Egyptian Tax Authority (ETA) mandates e-invoicing for all B2B transactions.',
    category: 'documentation',
  },
  {
    id: 'EG-003',
    region: 'egypt',
    name: 'Monthly VAT Return',
    description: 'Monthly VAT return must be filed with ETA by the end of the following month.',
    category: 'reporting',
  },
  {
    id: 'EG-004',
    region: 'egypt',
    name: '5-Year Record Retention',
    description: 'Egyptian Tax Authority requires retention of all tax records for a minimum of 5 years.',
    category: 'reporting',
  },
];

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_14',
    'vat_standard_14',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Standard Egyptian VAT rate is 14%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with the correct Egyptian VAT rate: 14% (standard) or 0% (exempt).',
        });
      }
    }
  }
}

function checkEInvoiceMandate(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    if (tx.amount > 0 && tx.currency === 'EGP' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (EGP ${tx.amount.toFixed(2)}) is missing an e-invoice as mandated by the Egyptian Tax Authority.`,
        transactionId: tx.id,
        suggestion: 'Generate and attach an e-invoice via the ETA e-invoicing portal.',
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

  // Last day of month filing — warn in last 10 days
  if (day >= 20) {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDay - day;
    violations.push({
      ruleId: rule.id,
      rule,
      severity: daysLeft <= 3 ? 'warning' : 'info',
      message: `Monthly VAT return due by end of month (${now.toISOString().slice(0, 7)}). ${daysLeft} day(s) remaining.`,
      suggestion: 'Submit monthly VAT return via the ETA portal before the deadline.',
    });
  }
}

function checkRecordRetention(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  const now = new Date();
  const month = now.getMonth() + 1;

  if (month === 7 && now.getDate() <= 31) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'Annual reminder: verify that all tax records from 5+ years ago are properly archived per Egyptian Tax Authority requirements.',
      suggestion: 'Review record retention policy and ensure all invoices and returns from the past 5 years are securely stored.',
    });
  }
}

export const egyptPlugin: CompliancePlugin = {
  region: 'egypt',
  name: 'Egypt Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    _entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkEInvoiceMandate(transactions, violations);
    checkMonthlyVatReturn(violations);
    checkRecordRetention(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'egypt',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Egypt compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
