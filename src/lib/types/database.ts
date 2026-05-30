// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Shared Database Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mirror of PostgreSQL schema enums and table row types.
// Source of truth: src/lib/supabase/schema.sql
// IMPORTANT: Keep these in sync with the database schema.

// ─── Enum Types ─────────────────────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type TransactionStatus =
  | 'pending'
  | 'auto_categorized'
  | 'human_review'
  | 'approved'
  | 'synced'
  | 'removed'
  | 'escrow_suspense';

export type DocumentStatusType = 'found' | 'missing' | 'partial';

export type RuleType = 'exact_match' | 'pattern' | 'mcc';

export type JournalStatus = 'draft' | 'posted' | 'voided';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'categorize'
  | 'approve'
  | 'sync'
  | 'login'
  | 'pipeline_processed'
  | 'webhook_received';

export type ActorType = 'ai' | 'human' | 'system';

export type ChannelType = 'slack' | 'teams' | 'whatsapp' | 'sms';

export type ReceiptStatus = 'sent' | 'responded' | 'expired' | 'failed';

export type LedgerProvider = 'quickbooks' | 'xero';

export type LedgerTypeEnum = 'quickbooks' | 'xero' | 'none';

export type SubscriptionPlan = 'free' | 'starter' | 'smb_growth' | 'cpa_professional' | 'cpa_enterprise';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export type TeamRole = 'owner' | 'admin' | 'accountant' | 'viewer';

// ─── Row Types ──────────────────────────────────────────────────────────────────

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  owner_id: string | null;
}

export interface EntityRow {
  id: string;
  org_id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_year_end: string | null;
  base_currency: string;
  created_at: string;
}

export interface BankConnectionRow {
  id: string;
  entity_id: string;
  plaid_item_id: string | null;
  plaid_access_token: string | null;
  institution_name: string | null;
  status: string;
  cursor: string | null;
  error_code: string | null;
  error_message: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccountRow {
  id: string;
  connection_id: string;
  plaid_account_id: string | null;
  name: string | null;
  type: string | null;
  subtype: string | null;
  mask: string | null;
  current_balance: number | null;
  available_balance: number | null;
  created_at: string;
}

export interface TransactionRow {
  id: string;
  entity_id: string;
  bank_account_id: string | null;
  plaid_transaction_id: string | null;
  amount: number;
  date: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  description: string | null;
  category_ai: string | null;
  category_human: string | null;
  confidence: number | null;
  status: TransactionStatus;
  ai_reasoning: string | null;
  document_status: DocumentStatusType;
  document_url: string | null;
  card_holder: string | null;
  card_last4: string | null;
  mcc_code: string | null;
  raw_bank_description: string | null;
  currency: string;
  tags: string[] | null;
  aging_days: number;
  created_at: string;
  updated_at: string;
}

export interface ChartOfAccountsRow {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CategorizationRuleRow {
  id: string;
  entity_id: string;
  rule_type: RuleType;
  match_value: string;
  gl_code: string;
  priority: number;
  hit_count: number;
  created_at: string;
}

export interface JournalEntryRow {
  id: string;
  entity_id: string;
  transaction_id: string | null;
  entry_date: string;
  memo: string | null;
  status: JournalStatus;
  posted_at: string | null;
  created_by: string | null;
  ledger_sync_id: string | null;
  ledger_type: LedgerTypeEnum;
  created_at: string;
}

export interface JournalLineRow {
  id: string;
  journal_entry_id: string;
  gl_code: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface AuditLogRow {
  id: string;
  entity_id: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  actor_id: string | null;
  actor_type: ActorType;
  details: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface ChannelConnectionRow {
  id: string;
  entity_id: string;
  channel_type: ChannelType;
  channel_id: string | null;
  access_token: string | null;
  workspace_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ReceiptRequestRow {
  id: string;
  transaction_id: string;
  channel_type: ChannelType | null;
  channel_user_id: string | null;
  message_id: string | null;
  status: ReceiptStatus;
  receipt_url: string | null;
  sent_at: string;
  responded_at: string | null;
}

export interface LedgerConnectionRow {
  id: string;
  entity_id: string;
  provider: LedgerProvider;
  access_token: string | null;
  refresh_token: string | null;
  realm_id: string | null;
  tenant_id: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  token_expires_at: string | null;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  org_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  entity_count: number;
  transaction_count: number;
  created_at: string;
}

export interface TeamMemberRow {
  id: string;
  org_id: string;
  user_id: string | null;
  role: TeamRole;
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface CategorizationHistoryRow {
  id: string;
  entity_id: string;
  merchant: string;
  gl_code: string;
  gl_name: string | null;
  frequency: number;
  last_used: string;
  created_at: string;
}
