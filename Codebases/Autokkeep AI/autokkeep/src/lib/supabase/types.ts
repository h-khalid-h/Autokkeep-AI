/* ============================================
   AUTOKKEEP DATABASE TYPES
   Auto-generated TypeScript types matching schema.sql
   ============================================ */

// --- Enum Types ---

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type TransactionStatus =
  | 'pending'
  | 'auto_categorized'
  | 'human_review'
  | 'categorization_failed' // TypeScript-only — not in DB schema (transaction_status enum)
  | 'approved'
  | 'syncing' // TypeScript-only — not in DB schema (transaction_status enum)
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

export type SubscriptionPlan =
  | 'free'
  | 'starter'
  | 'smb_growth'
  | 'cpa_professional'
  | 'cpa_enterprise';

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export type TeamRole = 'owner' | 'admin' | 'accountant' | 'viewer';

// --- Row Types ---

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  owner_id: string;
}

export interface Entity {
  id: string;
  org_id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  fiscal_year_end: string | null;
  base_currency: string;
  created_at: string;
}

export interface BankConnection {
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
}

export interface BankAccount {
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

export interface ChartOfAccount {
  id: string;
  entity_id: string;
  code: string;
  name: string;
  type: AccountType;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Transaction {
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

export interface CategorizationRule {
  id: string;
  entity_id: string;
  rule_type: RuleType;
  match_value: string;
  gl_code: string;
  priority: number;
  hit_count: number;
  created_at: string;
}

export interface JournalEntry {
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

export interface JournalLine {
  id: string;
  journal_entry_id: string;
  gl_code: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface AuditLogEntry {
  id: string;
  entity_id: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  actor_id: string | null;
  actor_type: ActorType;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface ChannelConnection {
  id: string;
  entity_id: string;
  channel_type: ChannelType;
  channel_id: string | null;
  access_token: string | null;
  workspace_name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ReceiptRequest {
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

export interface LedgerConnection {
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

export interface Subscription {
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

export interface TeamMember {
  id: string;
  org_id: string;
  user_id: string | null;
  role: TeamRole;
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
}

export interface CategorizationHistory {
  id: string;
  entity_id: string;
  merchant: string;
  gl_code: string;
  gl_name: string | null;
  frequency: number;
  last_used: string;
  created_at: string;
}

// --- Supabase Database Type ---

type TableDefinition<Row, Insert = Partial<Row> & Pick<Row, never>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
};

export interface Database {
  public: {
    Tables: {
      organizations: TableDefinition<
        Organization,
        Omit<Organization, 'id' | 'created_at'> & { id?: string; created_at?: string },
        Partial<Omit<Organization, 'id'>>
      >;
      entities: TableDefinition<
        Entity,
        Omit<Entity, 'id' | 'created_at' | 'base_currency'> & {
          id?: string;
          created_at?: string;
          base_currency?: string;
        },
        Partial<Omit<Entity, 'id'>>
      >;
      bank_connections: TableDefinition<
        BankConnection,
        Omit<BankConnection, 'id' | 'created_at' | 'status'> & {
          id?: string;
          created_at?: string;
          status?: string;
        },
        Partial<Omit<BankConnection, 'id'>>
      >;
      bank_accounts: TableDefinition<
        BankAccount,
        Omit<BankAccount, 'id' | 'created_at'> & { id?: string; created_at?: string },
        Partial<Omit<BankAccount, 'id'>>
      >;
      chart_of_accounts: TableDefinition<
        ChartOfAccount,
        Omit<ChartOfAccount, 'id' | 'created_at' | 'is_active'> & {
          id?: string;
          created_at?: string;
          is_active?: boolean;
        },
        Partial<Omit<ChartOfAccount, 'id'>>
      >;
      transactions: TableDefinition<
        Transaction,
        Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'status' | 'document_status' | 'currency' | 'aging_days'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          status?: TransactionStatus;
          document_status?: DocumentStatusType;
          currency?: string;
          aging_days?: number;
        },
        Partial<Omit<Transaction, 'id'>>
      >;
      categorization_rules: TableDefinition<
        CategorizationRule,
        Omit<CategorizationRule, 'id' | 'created_at' | 'priority' | 'hit_count'> & {
          id?: string;
          created_at?: string;
          priority?: number;
          hit_count?: number;
        },
        Partial<Omit<CategorizationRule, 'id'>>
      >;
      journal_entries: TableDefinition<
        JournalEntry,
        Omit<JournalEntry, 'id' | 'created_at' | 'status' | 'ledger_type'> & {
          id?: string;
          created_at?: string;
          status?: JournalStatus;
          ledger_type?: LedgerTypeEnum;
        },
        Partial<Omit<JournalEntry, 'id'>>
      >;
      journal_lines: TableDefinition<
        JournalLine,
        Omit<JournalLine, 'id' | 'debit' | 'credit'> & {
          id?: string;
          debit?: number;
          credit?: number;
        },
        Partial<Omit<JournalLine, 'id'>>
      >;
      audit_log: TableDefinition<
        AuditLogEntry,
        Omit<AuditLogEntry, 'id' | 'created_at'> & { id?: string; created_at?: string },
        Partial<Omit<AuditLogEntry, 'id'>>
      >;
      channel_connections: TableDefinition<
        ChannelConnection,
        Omit<ChannelConnection, 'id' | 'created_at' | 'is_active'> & {
          id?: string;
          created_at?: string;
          is_active?: boolean;
        },
        Partial<Omit<ChannelConnection, 'id'>>
      >;
      receipt_requests: TableDefinition<
        ReceiptRequest,
        Omit<ReceiptRequest, 'id' | 'sent_at' | 'status'> & {
          id?: string;
          sent_at?: string;
          status?: ReceiptStatus;
        },
        Partial<Omit<ReceiptRequest, 'id'>>
      >;
      ledger_connections: TableDefinition<
        LedgerConnection,
        Omit<LedgerConnection, 'id' | 'created_at' | 'is_active'> & {
          id?: string;
          created_at?: string;
          is_active?: boolean;
        },
        Partial<Omit<LedgerConnection, 'id'>>
      >;
      subscriptions: TableDefinition<
        Subscription,
        Omit<Subscription, 'id' | 'created_at' | 'status' | 'entity_count' | 'transaction_count'> & {
          id?: string;
          created_at?: string;
          status?: SubscriptionStatus;
          entity_count?: number;
          transaction_count?: number;
        },
        Partial<Omit<Subscription, 'id'>>
      >;
      team_members: TableDefinition<
        TeamMember,
        Omit<TeamMember, 'id' | 'created_at' | 'role'> & {
          id?: string;
          created_at?: string;
          role?: TeamRole;
        },
        Partial<Omit<TeamMember, 'id'>>
      >;
      categorization_history: TableDefinition<
        CategorizationHistory,
        Omit<CategorizationHistory, 'id' | 'created_at' | 'frequency' | 'last_used'> & {
          id?: string;
          created_at?: string;
          frequency?: number;
          last_used?: string;
        },
        Partial<Omit<CategorizationHistory, 'id'>>
      >;
    };
    Enums: {
      account_type: AccountType;
      transaction_status: TransactionStatus;
      document_status_type: DocumentStatusType;
      rule_type: RuleType;
      journal_status: JournalStatus;
      audit_action: AuditAction;
      actor_type: ActorType;
      channel_type: ChannelType;
      receipt_status: ReceiptStatus;
      ledger_provider: LedgerProvider;
      ledger_type_enum: LedgerTypeEnum;
      subscription_plan: SubscriptionPlan;
      subscription_status: SubscriptionStatus;
      team_role: TeamRole;
    };
  };
}
