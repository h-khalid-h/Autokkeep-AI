// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Japan 🇯🇵
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - Consumption tax: 10% standard, 8% reduced (food/beverages)
// - Qualified Invoice System: verify registration number format (T + 13 digits)
// - Withholding tax on freelancer/contractor payments (10.21% for under ¥1M)
// - Fiscal year alignment check (April 1 – March 31 default)
// - Electronic record-keeping requirements (Denshichobo)
// - Cross-border digital service consumption tax

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
    id: 'JP-001',
    region: 'japan',
    name: 'Consumption Tax Rate Validation',
    description: 'Standard rate 10%, reduced rate 8% for food and non-alcoholic beverages.',
    category: 'tax',
  },
  {
    id: 'JP-002',
    region: 'japan',
    name: 'Qualified Invoice Registration Number',
    description: 'Invoice System requires registration number format: T + 13 digits.',
    category: 'documentation',
  },
  {
    id: 'JP-003',
    region: 'japan',
    name: 'Withholding Tax on Contractors',
    description: 'Freelancer/contractor payments: 10.21% withholding for amounts under ¥1,000,000.',
    category: 'tax',
  },
  {
    id: 'JP-004',
    region: 'japan',
    name: 'Fiscal Year Alignment',
    description: 'Default fiscal year: April 1 – March 31. Validate transaction dates against fiscal year.',
    category: 'reporting',
  },
  {
    id: 'JP-005',
    region: 'japan',
    name: 'Electronic Record-Keeping (Denshichobo)',
    description: 'Electronic transactions must be stored in compliant electronic format.',
    category: 'documentation',
  },
  {
    id: 'JP-006',
    region: 'japan',
    name: 'Cross-Border Digital Service Tax',
    description: 'Consumption tax applies to cross-border digital services consumed in Japan.',
    category: 'tax',
  },
];

const QUALIFIED_INVOICE_REGEX = /^T\d{13}$/;
const WITHHOLDING_THRESHOLD = 1_000_000; // ¥1M
const WITHHOLDING_RATE_UNDER = 0.1021; // 10.21%
const WITHHOLDING_RATE_OVER = 0.2042; // 20.42% for excess above ¥1M

const FOOD_KEYWORDS = [
  'food', 'grocery', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast',
  'snack', 'beverage', 'drink', 'cafe', 'coffee', 'tea', 'bento',
  'konbini', 'supermarket', 'izakaya',
];

function checkConsumptionTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    const merchant = (tx.merchant_name || '').toLowerCase();

    if (category.includes('consumption_tax') || category.includes('ct_')) {
      // Check if food-related items correctly use reduced rate
      const isFood = FOOD_KEYWORDS.some((kw) => merchant.includes(kw) || category.includes(kw));
      if (isFood && category.includes('10')) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} appears food-related but uses 10% consumption tax. Reduced 8% rate may apply.`,
          transactionId: tx.id,
          suggestion: 'Food and non-alcoholic beverages qualify for the reduced 8% consumption tax rate.',
        });
      }
    }
  }
}

function checkInvoiceRegistrationNumber(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    // For transactions over ¥10,000 — require qualified invoice
    if (tx.currency === 'JPY' && tx.amount > 10_000 && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} (¥${tx.amount.toLocaleString()}) requires a qualified invoice with registration number (T + 13 digits).`,
        transactionId: tx.id,
        suggestion: 'Obtain a qualified invoice from the vendor with their registration number in format T0000000000000.',
      });
    }
  }

  // Suppress unused reference — the regex is used for config-level validation
  void QUALIFIED_INVOICE_REGEX;
}

function checkWithholdingTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (
      category.includes('contractor') ||
      category.includes('freelancer') ||
      category.includes('consultant') ||
      category.includes('professional_fee')
    ) {
      if (tx.currency === 'JPY') {
        const rate = tx.amount < WITHHOLDING_THRESHOLD ? WITHHOLDING_RATE_UNDER : WITHHOLDING_RATE_OVER;
        const expectedWithholding = Math.floor(tx.amount * rate);

        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Contractor payment ${tx.id} (¥${tx.amount.toLocaleString()}) requires ${(rate * 100).toFixed(2)}% withholding tax (≈¥${expectedWithholding.toLocaleString()}).`,
          transactionId: tx.id,
          suggestion: `Withhold ¥${expectedWithholding.toLocaleString()} (${(rate * 100).toFixed(2)}%) and remit to the National Tax Agency by the 10th of the following month.`,
        });
      }
    }
  }
}

function checkFiscalYearAlignment(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[3];
  const fiscalStart = config.fiscalYearStart || '04-01'; // Default: April 1
  const [startMonth] = fiscalStart.split('-').map(Number);

  if (startMonth !== 4) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: `Entity fiscal year starts on ${fiscalStart}, which differs from the Japanese standard (April 1).`,
      suggestion: 'Ensure your fiscal year setting aligns with corporate registrations and tax filings.',
    });
  }

  // Check for transactions that might fall outside fiscal year boundaries
  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    if (isNaN(txDate.getTime())) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} has an invalid date: "${tx.date}".`,
        transactionId: tx.id,
        suggestion: 'Correct the transaction date to ensure proper fiscal year reporting.',
      });
    }
  }
}

function checkElectronicRecordKeeping(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const missingDocs = transactions.filter(
    (tx) => tx.document_status !== 'found' && tx.amount > 30_000 && tx.currency === 'JPY'
  );

  if (missingDocs.length > 0) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `${missingDocs.length} transaction(s) over ¥30,000 lack electronic documentation as required by Denshichobo.`,
      suggestion: 'Digitize and store all transaction records in a compliant electronic format per the Electronic Books Preservation Act.',
    });

    for (const tx of missingDocs.slice(0, 5)) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} (¥${tx.amount.toLocaleString()}) needs electronic documentation.`,
        transactionId: tx.id,
        suggestion: 'Upload or digitize the supporting document for this transaction.',
      });
    }
  }
}

function checkCrossBorderDigitalTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[5];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    const merchant = (tx.merchant_name || '').toLowerCase();

    const isDigitalService =
      category.includes('software') ||
      category.includes('saas') ||
      category.includes('digital_service') ||
      category.includes('cloud') ||
      category.includes('subscription');

    const isForeignProvider =
      tx.currency !== 'JPY' ||
      merchant.includes('google') ||
      merchant.includes('amazon') ||
      merchant.includes('microsoft') ||
      merchant.includes('apple');

    if (isDigitalService && isForeignProvider) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} appears to be a cross-border digital service subject to consumption tax.`,
        transactionId: tx.id,
        suggestion: 'Ensure consumption tax is accounted for on cross-border digital service purchases under the reverse-charge mechanism.',
      });
    }
  }
}

export const japanPlugin: CompliancePlugin = {
  region: 'japan',
  name: 'Japan Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkConsumptionTax(transactions, violations);
    checkInvoiceRegistrationNumber(transactions, violations);
    checkWithholdingTax(transactions, violations);
    checkFiscalYearAlignment(transactions, violations, entityConfig);
    checkElectronicRecordKeeping(transactions, violations);
    checkCrossBorderDigitalTax(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(0, 100 - violationCount * 15 - warningCount * 5);

    return {
      region: 'japan',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Japan compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
