// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance Plugin System — Core Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ComplianceRegion = 'estonia' | 'qatar' | 'hong_kong' | 'japan' | 'india';
export type ComplianceSeverity = 'info' | 'warning' | 'violation';

export interface ComplianceRule {
  id: string;
  region: ComplianceRegion;
  name: string;
  description: string;
  category: 'tax' | 'reporting' | 'documentation' | 'threshold' | 'classification';
}

export interface ComplianceViolation {
  ruleId: string;
  rule: ComplianceRule;
  severity: ComplianceSeverity;
  message: string;
  transactionId?: string;
  suggestion: string;
}

export interface ComplianceCheckResult {
  region: ComplianceRegion;
  checkedAt: string;
  violations: ComplianceViolation[];
  score: number; // 0-100
  summary: string;
}

export interface CompliancePlugin {
  region: ComplianceRegion;
  name: string;
  rules: ComplianceRule[];
  check(
    transactions: TransactionForCompliance[],
    entityConfig: EntityComplianceConfig
  ): ComplianceCheckResult;
}

export interface TransactionForCompliance {
  id: string;
  amount: number;
  currency: string;
  date: string;
  merchant_name: string | null;
  category_ai: string | null;
  category_human: string | null;
  document_status: string | null;
  gl_code: string | null;
}

export interface EntityComplianceConfig {
  entityId: string;
  region: ComplianceRegion;
  taxId?: string;
  fiscalYearStart?: string; // MM-DD
  registrationType?: string;
  currency: string;
}
