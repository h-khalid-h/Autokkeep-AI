// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Germany 🇩🇪
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - GoBD compliance for digital records
// - VAT rate validation (19% standard, 7% reduced)
// - Kleinbetragsrechnung threshold (simplified invoices up to €250)
// - Umsatzsteuervoranmeldung (USt-VA) — monthly/quarterly VAT advance return
// - EU reverse charge for intra-EU B2B
// - 10-year record retention (Aufbewahrungsfrist)

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
    id: 'DE-001',
    region: 'germany',
    name: 'GoBD Compliance',
    description: 'Digital records must comply with GoBD (Grundsätze ordnungsmäßiger Buchführung und Dokumentation). All bookkeeping entries must be traceable, complete, correct, timely, and orderly.',
    category: 'documentation',
  },
  {
    id: 'DE-002',
    region: 'germany',
    name: 'VAT Rate Validation',
    description: 'Validate VAT (Umsatzsteuer) rates: 19% standard, 7% reduced.',
    category: 'tax',
  },
  {
    id: 'DE-003',
    region: 'germany',
    name: 'Kleinbetragsrechnung Threshold',
    description: 'Simplified invoices (Kleinbetragsrechnung) are allowed for transactions up to €250. Transactions exceeding €250 require a full invoice with all mandatory fields.',
    category: 'documentation',
  },
  {
    id: 'DE-004',
    region: 'germany',
    name: 'Umsatzsteuervoranmeldung (USt-VA)',
    description: 'Monthly or quarterly VAT advance returns must be filed with the Finanzamt by the 10th of the following month.',
    category: 'reporting',
  },
  {
    id: 'DE-005',
    region: 'germany',
    name: 'EU Reverse Charge',
    description: 'Intra-EU B2B transactions must apply the reverse-charge mechanism (§13b UStG).',
    category: 'tax',
  },
  {
    id: 'DE-006',
    region: 'germany',
    name: '10-Year Retention',
    description: 'Invoices, accounting records, and financial statements must be retained for 10 years per §147 AO (Abgabenordnung).',
    category: 'reporting',
  },
];

const UST_VA_MONTHLY_FILING_DAY = 10; // Due by the 10th of the following month

function checkGoBDCompliance(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];

  for (const tx of transactions) {
    // GoBD requires every booking to have documentation and be traceable
    const hasCategory = tx.category_human || tx.category_ai;
    const hasDocument = tx.document_status === 'found';

    if (!hasCategory && !hasDocument) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (€${tx.amount.toFixed(2)}) has neither a category nor supporting documentation — violates GoBD traceability requirements.`,
        transactionId: tx.id,
        suggestion: 'Categorize and attach documentation for this transaction to comply with GoBD requirements.',
      });
    } else if (!hasCategory) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} (€${tx.amount.toFixed(2)}) is missing a category — GoBD requires orderly classification of all bookkeeping entries.`,
        transactionId: tx.id,
        suggestion: 'Assign an appropriate category to this transaction.',
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
    'vat_standard_19',
    'vat_reduced_7',
    'vat_19',
    'vat_7',
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
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Valid German rates: 19%, 7%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid German VAT rate: 19% (standard) or 7% (reduced).',
        });
      }
    }
  }
}

function checkKleinbetragsrechnung(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];

  for (const tx of transactions) {
    if (tx.amount > 250 && tx.currency === 'EUR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (€${tx.amount.toFixed(2)}) exceeds the €250 Kleinbetragsrechnung threshold and is missing a full invoice.`,
        transactionId: tx.id,
        suggestion: 'Attach a full invoice with all mandatory fields (seller VAT ID, line-item net amounts, VAT rate/amount, etc.).',
      });
    }
  }
}

function checkUstVAFiling(
  violations: ComplianceViolation[],
  _config: EntityComplianceConfig
): void {
  const rule = RULES[3];
  const now = new Date();
  const day = now.getDate();

  // Monthly filers: remind if we're within the first 10 days of the month
  if (day <= UST_VA_MONTHLY_FILING_DAY) {
    const daysLeft = UST_VA_MONTHLY_FILING_DAY - day;
    const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // 1-indexed previous month
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const prevMonthName = monthNames[previousMonth - 1];

    violations.push({
      ruleId: rule.id,
      rule,
      severity: daysLeft <= 3 ? 'violation' : 'warning',
      message: `USt-VA for ${prevMonthName} is due by the 10th of this month. ${daysLeft} day(s) remaining.`,
      suggestion: 'Submit the Umsatzsteuervoranmeldung via ELSTER to the Finanzamt.',
    });
  }
}

function checkEuReverseCharge(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
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
          message: `Transaction ${tx.id} appears to be an intra-EU purchase (${tx.currency}) without reverse-charge classification per §13b UStG.`,
          transactionId: tx.id,
          suggestion: 'Apply EU VAT reverse-charge mechanism for intra-EU B2B purchases.',
        });
      }
    }
  }
}

function checkRetentionPeriod(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[5];
  const now = new Date();
  const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());

  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    // Warn if a transaction is approaching the 10-year retention boundary (within last year of retention)
    const nineYearsAgo = new Date(now.getFullYear() - 9, now.getMonth(), now.getDate());
    if (txDate <= nineYearsAgo && txDate > tenYearsAgo && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} (${tx.date}) is approaching the 10-year retention limit and has no documentation archived.`,
        transactionId: tx.id,
        suggestion: 'Ensure all supporting documents for this transaction are archived per §147 AO before the retention period expires.',
      });
    }
  }
}

export const germanyPlugin: CompliancePlugin = {
  region: 'germany',
  name: 'Germany Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkGoBDCompliance(transactions, violations);
    checkVatRates(transactions, violations);
    checkKleinbetragsrechnung(transactions, violations);
    checkUstVAFiling(violations, entityConfig);
    checkEuReverseCharge(transactions, violations);
    checkRetentionPeriod(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'germany',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Germany compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
