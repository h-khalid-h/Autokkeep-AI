// Client-side display type — status values aligned with DB schema via TransactionStatus
import type { TransactionStatus } from '@/lib/supabase/types';

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
  status: TransactionStatus;
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
  description?: string;
  documentUrl?: string | null;
}
