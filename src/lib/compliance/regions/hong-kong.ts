// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — Hong Kong 🇭🇰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - Profits tax: 8.25% on first HK$2M, 16.5% above
// - No VAT/GST — flag if VAT codes are used
// - MPF 5% employer contribution tracking
// - Salaries tax withholding validation
// - Annual filing deadline: within 1 month of assessment receipt
// - Offshore income exemption validation

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
    id: 'HK-001',
    region: 'hong_kong',
    name: 'Profits Tax Rate Validation',
    description: 'Two-tier profits tax: 8.25% on first HK$2M, 16.5% on remainder.',
    category: 'tax',
  },
  {
    id: 'HK-002',
    region: 'hong_kong',
    name: 'No VAT/GST System',
    description: 'Hong Kong does not have VAT or GST; flag if VAT codes are applied.',
    category: 'tax',
  },
  {
    id: 'HK-003',
    region: 'hong_kong',
    name: 'MPF Employer Contribution',
    description: 'Mandatory Provident Fund: 5% employer contribution required.',
    category: 'tax',
  },
  {
    id: 'HK-004',
    region: 'hong_kong',
    name: 'Salaries Tax Withholding',
    description: 'Validate salaries tax withholding on employee compensation.',
    category: 'tax',
  },
  {
    id: 'HK-005',
    region: 'hong_kong',
    name: 'Annual Filing Deadline',
    description: 'Tax return must be filed within 1 month of assessment receipt.',
    category: 'reporting',
  },
  {
    id: 'HK-006',
    region: 'hong_kong',
    name: 'Offshore Income Exemption',
    description: 'Only Hong Kong-sourced profits are taxable; validate offshore exemptions.',
    category: 'classification',
  },
];

const PROFITS_TAX_TIER1_LIMIT = 2_000_000; // HK$2M
const PROFITS_TAX_TIER1_RATE = 0.0825;
const PROFITS_TAX_TIER2_RATE = 0.165;
const MPF_RATE = 0.05;

function checkProfitsTaxRate(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (category.includes('profits_tax') || category.includes('corporate_tax')) {
      // Informational — remind about two-tier structure
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} categorized as profits tax. Ensure two-tier rate is applied: ${(PROFITS_TAX_TIER1_RATE * 100).toFixed(2)}% on first HK$${(PROFITS_TAX_TIER1_LIMIT / 1_000_000).toFixed(0)}M, ${(PROFITS_TAX_TIER2_RATE * 100).toFixed(1)}% above.`,
        transactionId: tx.id,
        suggestion: 'Verify the correct two-tier profits tax rate is applied.',
      });
    }
  }
}

function checkNoVatGst(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[1];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (
      category.includes('vat') ||
      category.includes('gst') ||
      category.includes('sales_tax')
    ) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Transaction ${tx.id} uses VAT/GST category "${category}" — Hong Kong has no VAT/GST system.`,
        transactionId: tx.id,
        suggestion: 'Remove VAT/GST categorization. Hong Kong does not levy VAT or GST.',
      });
    }
  }
}

function checkMpfContributions(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (
      category.includes('salary') ||
      category.includes('payroll') ||
      category.includes('wages')
    ) {
      // Check if there's a corresponding MPF contribution
      const hasMpf = transactions.some((other) => {
        const otherCat = (other.category_human || other.category_ai || '').toLowerCase();
        return (
          otherCat.includes('mpf') ||
          otherCat.includes('provident_fund')
        );
      });

      if (!hasMpf) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Payroll transaction ${tx.id} found but no corresponding MPF contribution detected. Employer must contribute ${(MPF_RATE * 100).toFixed(0)}%.`,
          transactionId: tx.id,
          suggestion: `Ensure ${(MPF_RATE * 100).toFixed(0)}% MPF employer contribution is recorded for each employee.`,
        });
        break; // only flag once
      }
    }
  }
}

function checkSalariesTax(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (category.includes('salary') || category.includes('payroll')) {
      const hasWithholding = transactions.some((other) => {
        const otherCat = (other.category_human || other.category_ai || '').toLowerCase();
        return otherCat.includes('salaries_tax') || otherCat.includes('tax_withholding');
      });

      if (!hasWithholding) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'info',
          message: `Payroll detected (${tx.id}) without corresponding salaries tax withholding entries.`,
          transactionId: tx.id,
          suggestion: 'Ensure employer salaries tax withholding obligations are met for all employees.',
        });
        break;
      }
    }
  }
}

function checkFilingDeadline(violations: ComplianceViolation[]): void {
  const rule = RULES[4];
  const now = new Date();
  const month = now.getMonth() + 1;

  // Filing season is typically April—May for standard entities
  if (month === 4 || month === 5) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: 'Hong Kong annual tax filing season. Return must be filed within 1 month of assessment receipt.',
      suggestion: 'Prepare and submit Profits Tax Return (BIR51/BIR52) to the Inland Revenue Department.',
    });
  }
}

function checkOffshoreExemption(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[5];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (category.includes('offshore') || category.includes('overseas_income')) {
      if (tx.currency === 'HKD') {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} is categorized as offshore income but is in HKD. Verify source jurisdiction.`,
          transactionId: tx.id,
          suggestion: 'Ensure offshore income exemption is properly documented with supporting evidence of non-HK source.',
        });
      }
    }
  }
}

export const hongKongPlugin: CompliancePlugin = {
  region: 'hong_kong',
  name: 'Hong Kong Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    // Suppress unused variable — entityConfig is part of the plugin interface
    void entityConfig;

    const violations: ComplianceViolation[] = [];

    checkProfitsTaxRate(transactions, violations);
    checkNoVatGst(transactions, violations);
    checkMpfContributions(transactions, violations);
    checkSalariesTax(transactions, violations);
    checkFilingDeadline(violations);
    checkOffshoreExemption(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(0, 100 - violationCount * 15 - warningCount * 5);

    return {
      region: 'hong_kong',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `Hong Kong compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
