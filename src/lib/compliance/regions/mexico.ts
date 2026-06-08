// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Mexico 🇲🇽
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - CFDI e-invoice mandatory for all transactions
// - IVA rate validation (16% standard, 0% food/medicine)
// - ISR withholding for services
// - SAT monthly tax declarations
// - 5-year record retention (SAT)

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
    id: 'MX-001',
    region: 'mexico',
    name: 'CFDI E-Invoice',
    description: 'Comprobante Fiscal Digital por Internet (CFDI) is mandatory for all transactions.',
    category: 'documentation',
  },
  {
    id: 'MX-002',
    region: 'mexico',
    name: 'IVA Rate Validation',
    description: 'Validate IVA rates: 16% standard, 0% on basic food and medicine.',
    category: 'tax',
  },
  {
    id: 'MX-003',
    region: 'mexico',
    name: 'ISR Withholding',
    description: 'Income tax (ISR) withholding is required for professional service payments.',
    category: 'tax',
  },
  {
    id: 'MX-004',
    region: 'mexico',
    name: 'Monthly Declarations',
    description: 'SAT requires monthly tax declarations by the 17th of the following month.',
    category: 'reporting',
  },
  {
    id: 'MX-005',
    region: 'mexico',
    name: '5-Year Record Retention',
    description: 'SAT requires retention of all fiscal records for a minimum of 5 years.',
    category: 'reporting',
  },
];

function checkCfdiInvoice(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    if (tx.amount > 0 && tx.currency === 'MXN' && tx.document_status !== 'found') {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} (MX$${tx.amount.toFixed(2)}) is missing a CFDI e-invoice.`,
        transactionId: tx.id,
        suggestion: 'Generate and attach a CFDI via an authorized PAC (Proveedor Autorizado de Certificación).',
      });
    }
  }
}

function checkIvaRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  const validIvaCategories = [
    'iva_16',
    'iva_standard_16',
    'iva_0',
    'iva_exempt',
  ];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && category.startsWith('iva_')) {
      const normalised = category.toLowerCase().replace(/\s+/g, '_');
      if (!validIvaCategories.includes(normalised)) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} has unrecognized IVA category "${category}". Valid Mexican rates: 16% (standard) or 0% (food/medicine).`,
          transactionId: tx.id,
          suggestion: 'Re-categorize with a valid IVA rate: 16% (standard) or 0% (basic food/medicine).',
        });
      }
    }
  }
}

function checkIsrWithholding(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  const serviceCategories = ['professional_services', 'consulting', 'freelance', 'honorarios'];

  for (const tx of transactions) {
    const category = tx.category_human || tx.category_ai;
    if (category && serviceCategories.includes(category.toLowerCase().replace(/\s+/g, '_'))) {
      const glCode = tx.gl_code || '';
      if (!glCode.toLowerCase().includes('isr') && !glCode.toLowerCase().includes('withholding')) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} is categorized as "${category}" but has no ISR withholding applied.`,
          transactionId: tx.id,
          suggestion: 'Apply ISR withholding (typically 10% for domestic services) per SAT regulations.',
        });
      }
    }
  }
}

function checkMonthlyDeclarations(
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  const now = new Date();
  const day = now.getDate();

  // Remind in the first 17 days of each month
  if (day <= 17) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: day >= 14 ? 'warning' : 'info',
      message: `SAT monthly tax declaration is due by the 17th of this month (${now.toISOString().slice(0, 7)}). ${17 - day} day(s) remaining.`,
      suggestion: 'Submit monthly provisional payments and IVA declarations via the SAT portal.',
    });
  }
}

function checkRecordRetention(
  violations: ComplianceViolation[]
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
      message: 'Annual reminder: verify that all fiscal records from 5+ years ago are properly archived per SAT requirements.',
      suggestion: 'Review record retention policy and ensure all CFDIs and supporting documents from the past 5 years are securely stored.',
    });
  }
}

export const mexicoPlugin: CompliancePlugin = {
  region: 'mexico',
  name: 'Mexico Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    _entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkCfdiInvoice(transactions, violations);
    checkIvaRates(transactions, violations);
    checkIsrWithholding(transactions, violations);
    checkMonthlyDeclarations(violations);
    checkRecordRetention(violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(
      0,
      100 - violationCount * 15 - warningCount * 5
    );

    return {
      region: 'mexico',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Mexico compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
