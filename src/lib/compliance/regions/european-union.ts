// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — European Union 🇪🇺
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Covers: FR, NL, IE, SE, FI, LV, LT, PL — countries sharing EU VAT Directive rules
// Rules:
// - EU VAT Directive Compliance (Directive 2006/112/EC)
// - Intra-Community Supply (ICS) requires valid VIES registration
// - EU Reverse Charge for intra-EU B2B purchases
// - Full VAT invoices required for B2B transactions over €400
// - One-Stop Shop (OSS) registration for cross-border B2C over €10,000/year
// - EU minimum 5-year document retention

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
    id: 'EU-001',
    region: 'european_union',
    name: 'EU VAT Directive Compliance',
    description: 'Validate VAT treatment follows EU Directive 2006/112/EC.',
    category: 'tax',
  },
  {
    id: 'EU-002',
    region: 'european_union',
    name: 'Intra-Community Supply (ICS)',
    description: 'Zero-rated intra-EU sales must have valid VIES registration.',
    category: 'tax',
  },
  {
    id: 'EU-003',
    region: 'european_union',
    name: 'EU Reverse Charge',
    description: 'Intra-EU B2B purchases must apply reverse-charge mechanism.',
    category: 'tax',
  },
  {
    id: 'EU-004',
    region: 'european_union',
    name: 'Invoice Requirements (B2B > €400)',
    description: 'Full VAT invoices required for B2B transactions over €400.',
    category: 'documentation',
  },
  {
    id: 'EU-005',
    region: 'european_union',
    name: 'One-Stop Shop (OSS) Threshold',
    description: 'Cross-border B2C sales over €10,000/year need OSS registration.',
    category: 'threshold',
  },
  {
    id: 'EU-006',
    region: 'european_union',
    name: 'Document Retention (5 Years)',
    description: 'EU minimum 5-year document retention for VAT-related records.',
    category: 'reporting',
  },
];

const EU_MEMBER_CURRENCIES = ['EUR', 'PLN', 'SEK', 'CZK', 'DKK', 'HUF', 'RON', 'BGN', 'HRK'];
const VALID_VAT_CATEGORIES = [
  'vat_standard',
  'vat_reduced',
  'vat_super_reduced',
  'vat_zero',
  'vat_exempt',
  'vat_reverse_charge',
];

function checkVatDirectiveCompliance(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.startsWith('vat_')) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      const isValid = VALID_VAT_CATEGORIES.some((vc) => normalised.startsWith(vc));
      if (!isValid) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized VAT category "${category}". Must comply with Directive 2006/112/EC.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize using a valid EU VAT classification: standard, reduced, super-reduced, zero, or exempt.',
        });
      }
    }
  }
}

function checkIntraCommunitySupply(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.toLowerCase().includes('zero_rated')) {
      if (
        tx.currency !== config.currency &&
        EU_MEMBER_CURRENCIES.includes(tx.currency)
      ) {
        if (!config.taxId) {
          violations.push({
            ruleId: rule.id,
            rule,
            severity: 'violation',
            message: `Transaction ${tx.id} is a zero-rated intra-EU supply but entity has no VAT/VIES registration on file.`,
            transactionId: tx.id,
            suggestion: 'Register for VIES and add your VAT identification number to claim zero-rated ICS treatment.',
          });
        }
      }
    }
  }
}

function checkReverseCharge(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (
      tx.currency !== 'EUR' &&
      EU_MEMBER_CURRENCIES.includes(tx.currency) &&
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
          suggestion: 'Apply the EU VAT reverse-charge mechanism for intra-EU B2B purchases per Art. 196 of Directive 2006/112/EC.',
        });
      }
    }
  }
}

function checkInvoiceRequirements(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    if (tx.amount > 400 && tx.currency === 'EUR' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} exceeds €400 (€${tx.amount.toFixed(2)}) but has no full VAT invoice attached.`,
        transactionId: tx.id,
        suggestion: 'Attach a compliant VAT invoice with all required fields (supplier VAT ID, sequential number, date, net amount, VAT amount, rate).',
      });
    }
  }
}

function checkOSSThreshold(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  // Sum cross-border EUR sales to approximate B2C threshold
  const crossBorderTotal = transactions
    .filter(
      (tx) =>
        tx.amount > 0 &&
        tx.currency === 'EUR' &&
        (tx.category_human || tx.category_ai || '').toLowerCase().includes('b2c')
    )
    .reduce((sum, tx) => sum + tx.amount, 0);

  if (crossBorderTotal > 10_000) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'violation',
      message: `Cross-border B2C sales total €${crossBorderTotal.toFixed(2)}, exceeding the €10,000 OSS threshold.`,
      suggestion: 'Register for the EU One-Stop Shop (OSS) scheme to remit VAT in each member state of consumption.',
    });
  } else if (crossBorderTotal > 7_500) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `Cross-border B2C sales total €${crossBorderTotal.toFixed(2)}, approaching the €10,000 OSS threshold.`,
      suggestion: 'Monitor cross-border B2C sales. OSS registration is required once €10,000/year is exceeded.',
    });
  }
}

function checkDocumentRetention(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[5];
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  for (const tx of transactions) {
    const txDate = new Date(tx.date);
    if (txDate < fiveYearsAgo) continue; // Outside retention window

    if (tx.document_status !== 'found' && tx.amount > 0) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 250 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (${tx.date}) is within the 5-year retention period but has no supporting document.`,
        transactionId: tx.id,
        suggestion: 'EU law requires retention of VAT-related documents for a minimum of 5 years. Upload the missing document.',
      });
    }
  }
}

export const europeanUnionPlugin: CompliancePlugin = {
  region: 'european_union',
  name: 'European Union Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkVatDirectiveCompliance(transactions, violations);
    checkIntraCommunitySupply(transactions, violations, entityConfig);
    checkReverseCharge(transactions, violations);
    checkInvoiceRequirements(transactions, violations);
    checkOSSThreshold(transactions, violations);
    checkDocumentRetention(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'european_union',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `EU compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
