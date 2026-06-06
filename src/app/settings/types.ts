// ─── Settings Shared Types ──────────────────────────────────────────────────────

export interface OrgData {
  id: string;
  name: string;
}

export interface EntityData {
  id: string;
  name: string;
}

export interface TeamMemberData {
  id: string;
  user_id: string | null;
  role: string;
  invited_email: string | null;
  accepted_at: string | null;
  user_email: string | null;
}

export interface SubscriptionData {
  plan: string;
  status: string;
  current_period_end: string | null;
  entity_count: number;
  transaction_count: number;
}

export interface ConnectionStatus {
  plaid: boolean;
  quickbooks: boolean;
  xero: boolean;
  slack: boolean;
  plaidLastSync?: string | null;
  quickbooksLastSync?: string | null;
  xeroLastSync?: string | null;
}

// ─── Entity Tab Types ───────────────────────────────────────────────────────────

export interface VendorManagerData {
  id: string;
  vendor_pattern: string;
  manager_user_id: string;
  notes: string | null;
  created_at: string;
}

export interface CardholderMappingData {
  id: string;
  card_holder: string;
  card_last4: string | null;
  mapped_user_id: string;
  notes: string | null;
  created_at: string;
}

export interface ChaseOptOutData {
  id: string;
  phone_number: string;
  entity_id: string;
  is_active: boolean;
  opted_out_at: string | null;
}

export interface GLCodeConfig {
  cash_gl: string;
  suspense_gl: string;
  default_expense_gl: string;
  bank_fees_gl: string;
}

export interface EntityProfileData {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_year_end: string | null;
  base_currency: string;
  country: string;
  timezone: string;
}
