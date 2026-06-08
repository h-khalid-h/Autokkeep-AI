// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Brazil 🇧🇷
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - NF-e Electronic Invoice mandatory for all sales
// - COFINS/PIS social contribution tax validation
// - ICMS state sales tax (7-18%)
// - Receipt required for transactions > R$100 BRL
// - 5-year record retention (Receita Federal)

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
    id: 'BR-001',
    region: 'brazil',
    name: 'NF-e Electronic Invoice',
    description: 'Nota Fiscal Eletrônica (NF-e) is mandatory for all sales transactions.',
    category: 'documentation',
  },
  {
    id: 'BR-002',
    region: 'brazil',
    name: 'COFINS/PIS Validation',
    description: 'Social contribution taxes COFINS (7.6%) and PIS (1.65%) must be applied correctly.',
    category: 'tax',
  },
  {
    id: 'BR-003',
    region: 'brazil',
    name: 'ICMS State Tax',
    description: 'ICMS state sales tax must be applied correctly; rates vary 7-18% depending on origin/destination.',
    category: 'tax',
  },
  {
    id: 'BR-004',
    region: 'brazil',
    name: 'Receipt Required (> R$100 BRL)',
    description: 'Receita Federal requires documentation for all transactions exceeding R$100.',
    category: 'documentation',
  },
  {
    id: 'BR-005',
    region: 'brazil',
    name: '5-Year Record Retention',
    description: 'Federal requirement to retain all fiscal records for a minimum of 5 years.',
    category: 'reporting',
  },
];

function checkNFeInvoice(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    if (tx.amount > 0 && tx.currency === 'BRL' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (R$${tx.amount.toFixed(2)}) is missing a Nota Fiscal Eletrônica (NF-e).`,
        transactionId: tx.id,
        suggestion: 'Issue an NF-e for this sales transaction via the SEFAZ portal.',
      });
    }
  }
}

function checkCofinsPis(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const validCategories = [
    'cofins_7_6',
    'pis_1_65',
    'cofins_pis_cumulative',
    'cofins_pis_non_cumulative',
  ];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && (category.startsWith('cofins') || category.startsWith('pis'))) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      if (!validCategories.includes(normalised)) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized COFINS/PIS category "${category}". Valid: COFINS 7.6%, PIS 1.65%.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid COFINS/PIS rate under the cumulative or non-cumulative regime.',
        });
      }
    }
  }
}

function checkIcms(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const validCategories = [
    'icms_7',
    'icms_12',
    'icms_17',
    'icms_18',
    'icms_exempt',
  ];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.startsWith('icms_')) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      if (!validCategories.includes(normalised)) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized ICMS category "${category}". Valid rates: 7%, 12%, 17%, 18%, or exempt.`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with the correct ICMS rate based on origin/destination state.',
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
    if (tx.amount > 100 && tx.currency === 'BRL' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: tx.amount > 500 ? 'violation' : 'warning',
        message: `Transaction ${tx.id} (R$${tx.amount.toFixed(2)}) exceeds R$100 threshold but has no receipt attached.`,
        transactionId: tx.id,
        suggestion: 'Upload the receipt or invoice to meet Receita Federal documentation requirements.',
      });
    }
  }
}

function checkRecordRetention(
  violations: ComplianceViolation[],
  _config: EntityComplianceConfig
): void {
  const rule = RULES[4];
  const now = new Date();
  const month = now.getMonth() + 1;

  // Remind during January — annual review period
  if (month === 1 && now.getDate() <= 31) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'info',
      message: 'Annual reminder: verify that all fiscal records from 5+ years ago are properly archived or disposed of per Receita Federal requirements.',
      suggestion: 'Review record retention policy and ensure all documents from the past 5 years are securely stored.',
    });
  }
}

export const brazilPlugin: CompliancePlugin = {
  region: 'brazil',
  name: 'Brazil Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkNFeInvoice(transactions, violations);
    checkCofinsPis(transactions, violations);
    checkIcms(transactions, violations);
    checkDocumentation(transactions, violations);
    checkRecordRetention(violations, entityConfig);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'brazil',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Brazil compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
