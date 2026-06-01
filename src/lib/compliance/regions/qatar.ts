// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Qatar 🇶🇦
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - No income tax — flag erroneous tax deductions
// - 5% VAT on most goods/services (introduced 2024)
// - Excise tax on specific goods (tobacco 100%, energy drinks 100%, carbonated 50%)
// - Business license renewal tracking
// - QAR primary currency — flag non-QAR transactions
// - Zakat obligations check for eligible entities

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
    id: 'QA-001',
    region: 'qatar',
    name: 'No Income Tax',
    description: 'Qatar has no personal or corporate income tax; flag if tax deductions are applied.',
    category: 'tax',
  },
  {
    id: 'QA-002',
    region: 'qatar',
    name: 'VAT 5% Validation',
    description: 'Most goods and services are subject to 5% VAT since 2024.',
    category: 'tax',
  },
  {
    id: 'QA-003',
    region: 'qatar',
    name: 'Excise Tax on Specific Goods',
    description: 'Tobacco & energy drinks at 100%, carbonated drinks at 50% excise duty.',
    category: 'tax',
  },
  {
    id: 'QA-004',
    region: 'qatar',
    name: 'Business License Renewal',
    description: 'Commercial registration and trade license must be renewed annually.',
    category: 'reporting',
  },
  {
    id: 'QA-005',
    region: 'qatar',
    name: 'QAR Currency Requirement',
    description: 'Primary transactions should be denominated in QAR.',
    category: 'classification',
  },
  {
    id: 'QA-006',
    region: 'qatar',
    name: 'Zakat Obligations',
    description: 'Eligible entities may have Zakat obligations under Qatari law.',
    category: 'tax',
  },
];

const EXCISE_KEYWORDS: Record<string, { rate: number; label: string }> = {
  tobacco: { rate: 100, label: 'tobacco products' },
  cigarette: { rate: 100, label: 'tobacco products' },
  cigar: { rate: 100, label: 'tobacco products' },
  'energy drink': { rate: 100, label: 'energy drinks' },
  'red bull': { rate: 100, label: 'energy drinks' },
  monster: { rate: 100, label: 'energy drinks' },
  'carbonated drink': { rate: 50, label: 'carbonated drinks' },
  soda: { rate: 50, label: 'carbonated drinks' },
  cola: { rate: 50, label: 'carbonated drinks' },
  pepsi: { rate: 50, label: 'carbonated drinks' },
  sprite: { rate: 50, label: 'carbonated drinks' },
};

function checkNoIncomeTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (
      category.includes('income_tax') ||
      category.includes('tax_deduction') ||
      category.includes('corporate_tax')
    ) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} is categorized as "${category}" — Qatar has no income tax.`,
        transactionId: tx.id,
        suggestion: 'Remove income/corporate tax deduction categorization. Qatar does not levy income tax.',
      });
    }
  }
}

function checkVat5Percent(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (category.includes('vat_') && !category.includes('vat_5') && !category.includes('vat_exempt')) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} has VAT category "${category}" — Qatar's standard VAT rate is 5%.`,
        transactionId: tx.id,
        suggestion: 'Verify and correct the VAT rate. Qatar applies 5% VAT on most goods/services.',
      });
    }
  }
}

function checkExciseTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    const merchant = (tx.merchant_name || '').toLowerCase();
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    const combined = `${merchant} ${category}`;

    for (const [keyword, info] of Object.entries(EXCISE_KEYWORDS)) {
      if (combined.includes(keyword)) {
        const hasExciseTag = category.includes('excise');
        if (!hasExciseTag) {
          violations.push({
            ruleId: rule.id,
            rule,
            severity: 'warning',
            message: `Transaction ${tx.id} involves ${info.label} which is subject to ${info.rate}% excise tax.`,
            transactionId: tx.id,
            suggestion: `Ensure ${info.rate}% excise tax is accounted for on ${info.label}.`,
          });
        }
        break; // one match per transaction
      }
    }
  }
}

function checkBusinessLicenseRenewal(violations: ComplianceViolation[]): void {
  const rule = RULES[3];
  const now = new Date();
  const month = now.getMonth() + 1;

  // Remind in Q4 (Oct–Dec) about upcoming renewal
  if (month >= 10) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'Annual business license renewal period is approaching. Ensure commercial registration is up to date.',
      suggestion: 'Renew your commercial registration and trade license before year-end via the Ministry of Commerce.',
    });
  }
}

function checkCurrencyRequirement(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const nonQarTxs = transactions.filter((tx) => tx.currency !== 'QAR');

  if (nonQarTxs.length > 0) {
    const ratio = nonQarTxs.length / transactions.length;
    if (ratio > 0.2) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `${nonQarTxs.length} of ${transactions.length} transactions (${(ratio * 100).toFixed(0)}%) are not in QAR.`,
        suggestion: 'Ensure primary business transactions are conducted in QAR for compliance with local regulations.',
      });
    }

    for (const tx of nonQarTxs) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} is in ${tx.currency} instead of QAR.`,
        transactionId: tx.id,
        suggestion: 'Consider converting to QAR or documenting the business reason for foreign currency usage.',
      });
    }
  }
}

function checkZakatObligations(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[5];
  if (config.registrationType === 'qatari_entity' || config.registrationType === 'gcc_entity') {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'This entity may be subject to Zakat obligations under Qatari law.',
      suggestion: 'Review Zakat applicability with your compliance advisor and ensure timely payment.',
    });
  }
}

export const qatarPlugin: CompliancePlugin = {
  region: 'qatar',
  name: 'Qatar Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkNoIncomeTax(transactions, violations);
    checkVat5Percent(transactions, violations);
    checkExciseTax(transactions, violations);
    checkBusinessLicenseRenewal(violations);
    if (transactions.length > 0) {
      checkCurrencyRequirement(transactions, violations);
    }
    checkZakatObligations(violations, entityConfig);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(0, 100 - violationCount * 15 - warningCount * 5);

    return {
      region: 'qatar',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Qatar compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
