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
}
