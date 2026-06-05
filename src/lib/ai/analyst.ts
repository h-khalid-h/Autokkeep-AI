// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — AI Financial Analyst Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { callWithFallback } from './openai-client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { TRANSACTION_STATUS } from '@/lib/supabase/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AnalystResponse {
  answer: string;
  dataCitations: DataCitation[];
  suggestedFollowUps: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DataCitation {
  metric: string;
  value: string;
  period: string;
}

interface TransactionRow {
  id: string;
  amount: number;
  date: string;
  merchant_name: string | null;
  merchant_raw: string | null;
  category_ai: string | null;
  category_human: string | null;
  status: string;
  currency: string | null;
}

interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

interface FinancialContext {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  topExpenseCategories: CategorySummary[];
  topIncomeCategories: CategorySummary[];
  monthlyTrend: MonthlyTrend[];
  dateRange: { start: string; end: string };
  currency: string;
}

// ─── OpenAI Client (shared) ────────────────────────────────────────────────────

// ─── System Prompt ─────────────────────────────────────────────────────────────

const ANALYST_SYSTEM_PROMPT = `You are Autokkeep's AI Financial Analyst. You help small business owners understand their finances in plain English.

You have access to the following financial data for this business:
[FINANCIAL CONTEXT]

Rules:
- Answer in plain, non-technical language
- Always cite specific numbers from the data
- If you don't have enough data to answer, say so clearly
- Provide actionable insights, not just numbers
- Format currency amounts properly
- Use bullet points for clarity`;

// ─── Financial Context Builder ─────────────────────────────────────────────────

async function fetchFinancialContext(
  entityId: string,
  supabase: SupabaseQueryClient
): Promise<FinancialContext> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const startDate = ninetyDaysAgo.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  // Fetch recent transactions (last 90 days)
  const { data: transactions } = await supabase
    .from('transactions')
    .select('id, amount, date, merchant_name, merchant_raw, category_ai, category_human, status, currency')
    .eq('entity_id', entityId)
    .neq('status', TRANSACTION_STATUS.REMOVED)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
    .limit(2000);

  const txns: TransactionRow[] = transactions || [];

  // Determine currency from first transaction
  const currency = txns[0]?.currency || 'USD';

  // Compute income and expenses using integer-cents to avoid floating-point drift (F6)
  let totalIncomeCents = 0;
  let totalExpensesCents = 0;
  const expenseCategoryMap = new Map<string, { totalCents: number; count: number }>();
  const incomeCategoryMap = new Map<string, { totalCents: number; count: number }>();
  const monthlyMap = new Map<string, { incomeCents: number; expensesCents: number }>();

  for (const tx of txns) {
    const category = tx.category_human || tx.category_ai || 'Uncategorized';
    const amount = tx.amount;
    const amountCents = Math.round(amount * 100);
    const absAmountCents = Math.round(Math.abs(amount) * 100);
    const monthKey = tx.date.substring(0, 7); // YYYY-MM

    // Initialize monthly bucket
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, { incomeCents: 0, expensesCents: 0 });
    }
    const monthBucket = monthlyMap.get(monthKey)!;

    // Plaid convention: positive = expense (money leaving account),
    //                   negative = income (money entering account)
    // This matches narrative.ts, close-engine.ts, and buildJournalEntryFromTransaction
    if (amount < 0) {
      // Negative = income/credit (money entering account)
      totalIncomeCents += absAmountCents;
      monthBucket.incomeCents += absAmountCents;
      const existing = incomeCategoryMap.get(category) || { totalCents: 0, count: 0 };
      existing.totalCents += absAmountCents;
      existing.count++;
      incomeCategoryMap.set(category, existing);
    } else {
      // Positive = expense/debit (money leaving account)
      totalExpensesCents += amountCents;
      monthBucket.expensesCents += amountCents;
      const existing = expenseCategoryMap.get(category) || { totalCents: 0, count: 0 };
      existing.totalCents += amountCents;
      existing.count++;
      expenseCategoryMap.set(category, existing);
    }
  }

  // Convert cents back to dollars
  const totalIncome = totalIncomeCents / 100;
  const totalExpenses = totalExpensesCents / 100;

  // Build top expense categories (sorted by total descending)
  const topExpenseCategories: CategorySummary[] = Array.from(expenseCategoryMap.entries())
    .map(([category, data]) => ({ category, total: data.totalCents / 100, count: data.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // Build top income categories
  const topIncomeCategories: CategorySummary[] = Array.from(incomeCategoryMap.entries())
    .map(([category, data]) => ({ category, total: data.totalCents / 100, count: data.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Build monthly trend (sorted by month ascending)
  const monthlyTrend: MonthlyTrend[] = Array.from(monthlyMap.entries())
    .map(([month, data]) => ({
      month,
      income: data.incomeCents / 100,
      expenses: data.expensesCents / 100,
      net: (data.incomeCents - data.expensesCents) / 100,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return {
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round((totalIncome - totalExpenses) * 100) / 100,
    transactionCount: txns.length,
    topExpenseCategories,
    topIncomeCategories,
    monthlyTrend,
    dateRange: { start: startDate, end: endDate },
    currency,
  };
}

function buildFinancialContextString(ctx: FinancialContext): string {
  let contextStr = `## Financial Summary (${ctx.dateRange.start} to ${ctx.dateRange.end})\n\n`;
  contextStr += `- **Total Income**: $${ctx.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  contextStr += `- **Total Expenses**: $${ctx.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  contextStr += `- **Net Income**: $${ctx.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  contextStr += `- **Transaction Count**: ${ctx.transactionCount}\n`;
  contextStr += `- **Currency**: ${ctx.currency}\n\n`;

  if (ctx.topExpenseCategories.length > 0) {
    contextStr += `## Top Expense Categories\n\n`;
    contextStr += `| Category | Total | # Transactions |\n|----------|-------|----------------|\n`;
    for (const cat of ctx.topExpenseCategories) {
      contextStr += `| ${cat.category} | $${cat.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} | ${cat.count} |\n`;
    }
    contextStr += `\n`;
  }

  if (ctx.topIncomeCategories.length > 0) {
    contextStr += `## Top Income Sources\n\n`;
    for (const cat of ctx.topIncomeCategories) {
      contextStr += `- ${cat.category}: $${cat.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${cat.count} transactions)\n`;
    }
    contextStr += `\n`;
  }

  if (ctx.monthlyTrend.length > 0) {
    contextStr += `## Monthly Trend\n\n`;
    contextStr += `| Month | Income | Expenses | Net |\n|-------|--------|----------|-----|\n`;
    for (const m of ctx.monthlyTrend) {
      contextStr += `| ${m.month} | $${m.income.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${m.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })} | $${m.net.toLocaleString('en-US', { minimumFractionDigits: 2 })} |\n`;
    }
  }

  return contextStr;
}

// ─── Main Analyst Function ─────────────────────────────────────────────────────

/**
 * Analyzes a natural language financial question using the user's transaction data.
 *
 * 1. Fetches recent transactions (last 90 days) for the entity
 * 2. Computes summary stats: total income, total expenses, top categories, monthly trend
 * 3. Builds a system prompt that includes this financial context
 * 4. Calls OpenAI with the user's question
 * 5. Returns structured response with data citations
 */
export async function analyzeFinancialQuestion(
  question: string,
  entityId: string,
  supabase: SupabaseQueryClient
): Promise<AnalystResponse> {

  // Step 1-2: Fetch and compute financial context
  const financialContext = await fetchFinancialContext(entityId, supabase);
  const contextString = buildFinancialContextString(financialContext);

  // Step 3: Build the system prompt with financial context
  const systemPrompt = ANALYST_SYSTEM_PROMPT.replace(
    '[FINANCIAL CONTEXT]',
    contextString
  );

  try {
    // Step 4: Call OpenAI with structured output
    const response = await callWithFallback((model) => ({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'analyst_response',
          strict: true,
          schema: {
            type: 'object' as const,
            properties: {
              answer: {
                type: 'string' as const,
                description: 'The detailed answer to the financial question in plain English with bullet points',
              },
              data_citations: {
                type: 'array' as const,
                items: {
                  type: 'object' as const,
                  properties: {
                    metric: { type: 'string' as const },
                    value: { type: 'string' as const },
                    period: { type: 'string' as const },
                  },
                  required: ['metric', 'value', 'period'] as const,
                  additionalProperties: false,
                },
                description: 'Specific data points cited in the answer',
              },
              suggested_follow_ups: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: '2-3 natural follow-up questions the user might want to ask',
              },
              confidence: {
                type: 'string' as const,
                enum: ['high', 'medium', 'low'],
                description: 'Confidence level based on data availability',
              },
            },
            required: ['answer', 'data_citations', 'suggested_follow_ups', 'confidence'] as const,
            additionalProperties: false,
          },
        },
      },
      temperature: 0.3,
    }));

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

    // Step 5: Return structured response
    return {
      answer: parsed.answer,
      dataCitations: (parsed.data_citations || []).map(
        (c: { metric: string; value: string; period: string }) => ({
          metric: c.metric,
          value: c.value,
          period: c.period,
        })
      ),
      suggestedFollowUps: parsed.suggested_follow_ups || [],
      confidence: parsed.confidence as AnalystResponse['confidence'],
    };
  } catch (error) {
    console.error('[AI Analyst] OpenAI call failed:', error);

    // Provide a graceful fallback response
    const fallbackAnswer = financialContext.transactionCount > 0
      ? `I wasn't able to fully analyze your question, but here's what I can see from your data:\n\n• You have ${financialContext.transactionCount} transactions in the last 90 days\n• Total income: $${financialContext.totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• Total expenses: $${financialContext.totalExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n• Net income: $${financialContext.netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\nPlease try rephrasing your question or try again in a moment.`
      : 'I don\'t have enough transaction data to answer your question. Please make sure your bank accounts are connected and transactions have been synced.';

    return {
      answer: fallbackAnswer,
      dataCitations: [],
      suggestedFollowUps: [
        'What are my biggest expenses this month?',
        'How does this month compare to last month?',
        'What is my current cash flow status?',
      ],
      confidence: 'low',
    };
  }
}
