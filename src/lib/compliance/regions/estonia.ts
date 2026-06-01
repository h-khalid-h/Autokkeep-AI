// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Estonia 🇪🇪
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - E-invoice mandatory for B2B over €1,000
// - VAT rate validation (20% standard, 9% reduced, 0% exempt)
// - EU VAT reverse charge for intra-EU purchases
// - Receipt/invoice required for expenses over €20
// - e-Residency quarterly VAT filing reminders (months 1, 4, 7, 10)
// - Annual report deadline check (June 30)

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
    id: 'EE-001',
    region: 'estonia',
    name: 'E-Invoice Required (B2B > €1,000)',
    description: 'E-invoicing is mandatory for B2B transactions exceeding €1,000.',
    category: 'documentation',
  },
  {
    id: 'EE-002',
    region: 'estonia',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 20% standard, 9% reduced, 0% exempt.',
    category: 'tax',
  },
  {
    id: 'EE-003',
    region: 'estonia',
    name: 'EU VAT Reverse Charge',
    description: 'Intra-EU B2B purchases must apply the reverse-charge mechanism.',
    category: 'tax',
  },
  {
    id: 'EE-004',
    region: 'estonia',
    name: 'Receipt/Invoice Required (> €20)',
    description: 'Supporting documentation is required for all expenses over €20.',
    category: 'documentation',
  },
  {
    id: 'EE-005',
    region: 'estonia',
    name: 'Quarterly VAT Filing Reminder',
    description: 'e-Residency entities must file VAT quarterly (Jan, Apr, Jul, Oct).',
    category: 'reporting',
  },
  {
    id: 'EE-006',
    region: 'estonia',
    name: 'Annual Report Deadline',
    description: 'Annual report must be filed by June 30 each year.',
    category: 'reporting',
  },
];

const VAT_FILING_MONTHS = [1, 4, 7, 10]; // Jan, Apr, Jul, Oct

function checkEInvoiceRequired(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    if (tx.amount > 1000 && tx.currency === 'EUR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} exceeds €1,000 (€${tx.amount.toFixed(2)}) but has no e-invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Attach a compliant e-invoice for B2B transactions over €1,000.',
      });
    }
  }
}

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const validVatCategories = [
    'vat_standard_20',
    'vat_reduced_9',
    'vat_exempt_0',
    'vat_20',
    'vat_9',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid Estonian rates: 20%, 9%, 0%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Estonian VAT rate: 20% (standard), 9% (reduced), or 0% (exempt).',
        });
      }
    }
  }
}

function checkReverseCharge(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const euCurrencies = ['EUR', 'PLN', 'CZK', 'SEK', 'DKK', 'HUF', 'RON', 'BGN', 'HRK'];

  for (const tx of transactions) {
    if (
      tx.currency !== 'EUR' &&
      euCurrencies.includes(tx.currency) &&
      tx.amount > 0
    ) {
      const category = tx.category_human || tx.category_ai;
      if (!category || !category.toLowerCase().includes('reverse_charge')) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} appears to be an intra-EU purchase (${tx.currency}) without reverse-charge classification.`,
          transactionId: tx.id,
          suggestion: 'Apply EU VAT reverse-charge mechanism for intra-EU B2B purchases.',
        });
      }
    }
  }
}

function checkDocumentation(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    if (tx.amount > 20 && tx.currency === 'EUR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 100 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (€${tx.amount.toFixed(2)}) is missing a receipt or invoice.`,
        transactionId: tx.id,
        suggestion: 'Upload the receipt or invoice for this expense.',
      });
    }
  }
}

function checkQuarterlyVatFiling(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  if (config.registrationType !== 'e-residency') return;

  const rule = RULES[4];
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  if (VAT_FILING_MONTHS.includes(currentMonth) && now.getDate() <= 20) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Quarterly VAT filing is due by the 20th of this month (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'Submit quarterly VAT return via the Estonian Tax and Customs Board e-portal.',
    });
  }
}

function checkAnnualReportDeadline(violations: ComplianceViolation[]): void {
  const rule = RULES[5];
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Warn in May and June
  if ((month === 5 && day >= 15) || (month === 6 && day <= 30)) {
    const daysLeft = month === 5 ? 30 - day + 30 : 30 - day;
    violations.push({
      ruleId: rule.id,
      rule,
      severity: daysLeft <= 7 ? 'violation' : 'warning',
      message: `Annual report deadline is June 30. ${daysLeft} day(s) remaining.`,
      suggestion: 'Prepare and submit the annual report via the Estonian Business Register.',
    });
  }
}

export const estoniaPlugin: CompliancePlugin = {
  region: 'estonia',
  name: 'Estonia Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkEInvoiceRequired(transactions, violations);
    checkVatRates(transactions, violations);
    checkReverseCharge(transactions, violations);
    checkDocumentation(transactions, violations);
    checkQuarterlyVatFiling(violations, entityConfig);
    checkAnnualReportDeadline(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'estonia',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Estonia compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
