export interface Transaction {
  id: string;
  merchant: string;
  merchantRaw: string;
  amount: number;
  date: string;
  category: string;
  glCode: string;
  glName: string;
  confidence: number;
  status: 'pending_human' | 'verified_ai' | 'verified_human' | 'waiting_on_user' | 'approved' | 'removed' | 'escrow_suspense' | 'categorization_failed' | 'syncing' | 'synced';
  icon: string;
  tags: string[];
  aiReasoning: string;
  suggestedGLCode: string;
  suggestedGLName: string;
  cardHolder: string;
  cardLast4: string;
  agingDays: number;
  rawData: {
    bankDescription: string;
    mcc: string;
    currency: string;
  };
  documentStatus: 'found' | 'missing' | 'partial';
  documentNote?: string;
}
