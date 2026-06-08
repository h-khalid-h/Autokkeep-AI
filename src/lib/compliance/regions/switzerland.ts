// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Switzerland 🇨🇭
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - VAT rate validation (8.1% standard, 2.6% reduced, 3.8% accommodation)
// - VAT registration threshold (CHF 100,000 worldwide revenue)
// - Invoice requirements (full invoice for transactions > CHF 400)
// - Quarterly VAT return filing with ESTV/AFC
// - 10-year record retention per Swiss law

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
    id: 'CH-001',
    region: 'switzerland',
    name: 'VAT Rate Validation',
    description: 'Validate VAT rates: 8.1% standard, 2.6% reduced, 3.8% accommodation.',
    category: 'tax',
  },
  {
    id: 'CH-002',
    region: 'switzerland',
    name: 'VAT Registration Threshold',
    description: 'VAT registration is mandatory if worldwide revenue exceeds CHF 100,000.',
    category: 'threshold',
  },
  {
    id: 'CH-003',
    region: 'switzerland',
    name: 'Invoice Requirements (> CHF 400)',
    description: 'A full invoice with all required details is mandatory for transactions exceeding CHF 400.',
    category: 'documentation',
  },
  {
    id: 'CH-004',
    region: 'switzerland',
    name: 'Quarterly VAT Return',
    description: 'VAT returns must be filed quarterly with the ESTV/AFC (Federal Tax Administration).',
    category: 'reporting',
  },
  {
    id: 'CH-005',
    region: 'switzerland',
    name: '10-Year Record Retention',
    description: 'Swiss law requires business records to be retained for at least 10 years.',
    category: 'reporting',
  },
];

function checkVatRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  const validVatCategories = [
    'vat_standard_8.1',
    'vat_standard_81',
    'vat_reduced_2.6',
    'vat_reduced_26',
    'vat_accommodation_3.8',
    'vat_accommodation_38',
    'vat_8.1',
    'vat_2.6',
    'vat_3.8',
    'vat_exempt',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid Swiss rates: 8.1% (standard), 2.6% (reduced), 3.8% (accommodation).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid Swiss VAT rate: 8.1% (standard), 2.6% (reduced), 3.8% (accommodation), or 0% (exempt).',
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
  // Consider all revenue (worldwide) — sum all positive-amount transactions
  const totalRevenue = transactions
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => {
      // Convert to CHF approximation for non-CHF currencies (simplified)
      if (tx.currency === 'CHF') return sum + tx.amount;
      if (tx.currency === 'EUR') return sum + tx.amount * 0.96;
      if (tx.currency === 'USD') return sum + tx.amount * 0.88;
      return sum + tx.amount; // fallback: treat as CHF
    }, 0);

  if (totalRevenue > 100_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Estimated worldwide revenue (≈ CHF ${totalRevenue.toFixed(2)}) exceeds CHF 100,000 threshold. VAT registration is mandatory.`,
      suggestion: 'Register for VAT with the ESTV/AFC (Federal Tax Administration) if not already registered.',
    });
  } else if (totalRevenue > 80_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Estimated worldwide revenue (≈ CHF ${totalRevenue.toFixed(2)}) is approaching the CHF 100,000 VAT registration threshold.`,
      suggestion: 'Monitor revenue closely. Consider voluntary VAT registration or prepare for mandatory registration.',
    });
  }
}

function checkInvoiceRequirements(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.amount > 400 && tx.currency === 'CHF' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 5000 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} exceeds CHF 400 (CHF ${tx.amount.toFixed(2)}) but has no full invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Attach a full invoice including supplier VAT number, date, description of goods/services, VAT amount, and applicable rate.',
      });
    }
  }
}

function checkQuarterlyVatReturn(violations: ComplianceViolation[]): void {
  const rule = RULES[3];
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  // VAT returns are due within 60 days after the end of each quarter
  // Remind during filing months (month after quarter end)
  const filingReminderMonths = [2, 5, 8, 11]; // Feb, May, Aug, Nov
  if (filingReminderMonths.includes(currentMonth)) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: now.getDate() > 28 ? 'warning' : 'info',
      message: `Quarterly VAT return is due within 60 days of the previous quarter end (${now.toISOString().slice(0, 7)}).`,
      suggestion: 'File your quarterly VAT return via the ESTV/AFC online portal (UID-registered entities).',
    });
  }
}

function checkRecordRetention(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);

  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    if (txDate < tenYearsAgo && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} (${tx.date}) is older than 10 years and missing documentation. Swiss retention period may still apply.`,
        transactionId: tx.id,
        suggestion: 'Ensure records are retained per Swiss 10-year requirement. Locate and attach documentation if available.',
      });
    }
  }
}

export const switzerlandPlugin: CompliancePlugin = {
  region: 'switzerland',
  name: 'Switzerland Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    _entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatRates(transactions, violations);
    checkVatRegistrationThreshold(transactions, violations);
    checkInvoiceRequirements(transactions, violations);
    checkQuarterlyVatReturn(violations);
    checkRecordRetention(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'switzerland',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Switzerland compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
