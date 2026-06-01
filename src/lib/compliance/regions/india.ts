// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin — India 🇮🇳
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rules:
// - GST rate validation: 5%, 12%, 18%, 28%
// - GSTIN format validation (15-character alphanumeric)
// - HSN/SAC code requirement for goods/services
// - TDS on contractor payments over ₹30,000
// - PAN validation for transactions over ₹50,000
// - E-invoicing mandatory for turnover > ₹5 crore
// - RCM (Reverse Charge Mechanism) for specified services

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
    id: 'IN-001',
    region: 'india',
    name: 'GST Rate Validation',
    description: 'Validate GST rates: 5%, 12%, 18%, 28% based on goods/service category.',
    category: 'tax',
  },
  {
    id: 'IN-002',
    region: 'india',
    name: 'GSTIN Format Validation',
    description: 'GSTIN must be 15-character alphanumeric (e.g., 22AAAAA0000A1Z5).',
    category: 'documentation',
  },
  {
    id: 'IN-003',
    region: 'india',
    name: 'HSN/SAC Code Requirement',
    description: 'HSN code (goods) or SAC code (services) is required on invoices.',
    category: 'classification',
  },
  {
    id: 'IN-004',
    region: 'india',
    name: 'TDS on Contractor Payments',
    description: 'TDS required on contractor/freelancer payments exceeding ₹30,000.',
    category: 'tax',
  },
  {
    id: 'IN-005',
    region: 'india',
    name: 'PAN Validation for High-Value Transactions',
    description: 'PAN is required for transactions exceeding ₹50,000.',
    category: 'documentation',
  },
  {
    id: 'IN-006',
    region: 'india',
    name: 'E-Invoicing Mandate',
    description: 'E-invoicing is mandatory for businesses with turnover exceeding ₹5 crore.',
    category: 'documentation',
  },
  {
    id: 'IN-007',
    region: 'india',
    name: 'Reverse Charge Mechanism (RCM)',
    description: 'RCM applies to specified services; recipient must pay GST directly.',
    category: 'tax',
  },
];

const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;
const VALID_GST_RATES = [0, 5, 12, 18, 28];
const TDS_THRESHOLD = 30_000; // ₹30,000
const PAN_THRESHOLD = 50_000; // ₹50,000

const RCM_SERVICE_KEYWORDS = [
  'legal', 'advocate', 'goods_transport', 'gta',
  'security', 'manpower', 'rent_a_cab', 'cab',
  'sponsorship', 'government_service', 'director_fees',
  'insurance_agent', 'recovery_agent',
];

function checkGstRates(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[0];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (category.includes('gst_')) {
      // Extract the rate number from category like "gst_15" or "gst_10"
      const rateMatch = category.match(/gst_(\d+)/);
      if (rateMatch) {
        const rate = parseInt(rateMatch[1], 10);
        if (!VALID_GST_RATES.includes(rate)) {
          violations.push({
            ruleId: rule.id,
            rule,
            severity: 'violation',
            message: `Transaction ${tx.id} uses GST rate ${rate}% which is not a valid Indian GST slab.`,
            transactionId: tx.id,
            suggestion: `Use a valid GST rate: ${VALID_GST_RATES.join('%, ')}%. Verify the correct rate based on the HSN/SAC code.`,
          });
        }
      }
    }
  }
}

function checkGstinFormat(
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[1];
  if (config.taxId) {
    if (!GSTIN_REGEX.test(config.taxId)) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `Entity GSTIN "${config.taxId}" does not match the required format (15-character: 22AAAAA0000A1Z5).`,
        suggestion: 'Correct the GSTIN to the valid 15-character alphanumeric format: 2 digits (state) + 10 char PAN + 1 entity + 1 Z + 1 check digit.',
      });
    }
  } else {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: 'No GSTIN configured for this entity.',
      suggestion: 'Configure a valid GSTIN for GST compliance. This is required for all registered businesses.',
    });
  }
}

function checkHsnSacCode(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[2];
  for (const tx of transactions) {
    if (tx.currency === 'INR' && tx.amount > 5_000 && !tx.gl_code) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Transaction ${tx.id} (₹${tx.amount.toLocaleString()}) has no GL/HSN/SAC code assigned.`,
        transactionId: tx.id,
        suggestion: 'Assign the appropriate HSN code (for goods) or SAC code (for services) to enable correct GST reporting.',
      });
    }
  }
}

function checkTds(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[3];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    if (
      (category.includes('contractor') ||
        category.includes('freelancer') ||
        category.includes('professional_fee') ||
        category.includes('consultant')) &&
      tx.currency === 'INR' &&
      tx.amount > TDS_THRESHOLD
    ) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'warning',
        message: `Contractor payment ${tx.id} (₹${tx.amount.toLocaleString()}) exceeds ₹${TDS_THRESHOLD.toLocaleString()} — TDS must be deducted.`,
        transactionId: tx.id,
        suggestion: 'Deduct TDS at the applicable rate (typically 10% u/s 194J) and deposit with the government by the 7th of the following month.',
      });
    }
  }
}

function checkPanRequirement(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[4];
  const highValueTxs = transactions.filter(
    (tx) => tx.currency === 'INR' && tx.amount > PAN_THRESHOLD && tx.document_status !== 'found'
  );

  if (highValueTxs.length > 0) {
    violations.push({
      ruleId: rule.id,
      rule,
      severity: 'warning',
      message: `${highValueTxs.length} transaction(s) exceed ₹${PAN_THRESHOLD.toLocaleString()} without supporting documentation (PAN verification).`,
      suggestion: 'Collect PAN details for all transactions exceeding ₹50,000 as per Income Tax Act requirements.',
    });

    for (const tx of highValueTxs.slice(0, 5)) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'info',
        message: `Transaction ${tx.id} (₹${tx.amount.toLocaleString()}) — PAN documentation required.`,
        transactionId: tx.id,
        suggestion: 'Obtain and record the vendor/payee PAN for this transaction.',
      });
    }
  }
}

function checkEInvoicing(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[],
  config: EntityComplianceConfig
): void {
  const rule = RULES[5];
  // E-invoicing is mandatory — check if high-value transactions have documentation
  if (config.registrationType === 'e_invoice_mandatory') {
    const missingInvoices = transactions.filter(
      (tx) => tx.currency === 'INR' && tx.amount > 10_000 && tx.document_status !== 'found'
    );

    if (missingInvoices.length > 0) {
      violations.push({
        ruleId: rule.id,
        rule,
        severity: 'violation',
        message: `${missingInvoices.length} transaction(s) lack e-invoices. E-invoicing is mandatory for entities with turnover > ₹5 crore.`,
        suggestion: 'Generate IRN (Invoice Reference Number) via the GST e-invoice portal for all B2B invoices.',
      });
    }
  }
}

function checkReverseCharge(
  transactions: TransactionForCompliance[],
  violations: ComplianceViolation[]
): void {
  const rule = RULES[6];
  for (const tx of transactions) {
    const category = (tx.category_human || tx.category_ai || '').toLowerCase();
    const merchant = (tx.merchant_name || '').toLowerCase();
    const combined = `${category} ${merchant}`;

    const isRcmService = RCM_SERVICE_KEYWORDS.some((kw) => combined.includes(kw));
    if (isRcmService) {
      const hasRcmTag = category.includes('rcm') || category.includes('reverse_charge');
      if (!hasRcmTag) {
        violations.push({
          ruleId: rule.id,
          rule,
          severity: 'warning',
          message: `Transaction ${tx.id} appears to be a service subject to Reverse Charge Mechanism.`,
          transactionId: tx.id,
          suggestion: 'Apply RCM — the recipient must pay GST directly to the government for this service category.',
        });
      }
    }
  }
}

export const indiaPlugin: CompliancePlugin = {
  region: 'india',
  name: 'India Compliance Module',
  rules: RULES,

  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];

    checkGstRates(transactions, violations);
    checkGstinFormat(violations, entityConfig);
    checkHsnSacCode(transactions, violations);
    checkTds(transactions, violations);
    checkPanRequirement(transactions, violations);
    checkEInvoicing(transactions, violations, entityConfig);
    checkReverseCharge(transactions, violations);

    const violationCount = violations.filter((v) => v.severity === 'violation').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const score = Math.max(0, 100 - violationCount * 15 - warningCount * 5);

    return {
      region: 'india',
      checkedAt: new Date().toISOString(),
      violations,
      score,
      summary: `India compliance: ${violations.length} issue(s) found — ${violationCount} violation(s), ${warningCount} warning(s). Score: ${score}/100.`,
    };
  },
};
