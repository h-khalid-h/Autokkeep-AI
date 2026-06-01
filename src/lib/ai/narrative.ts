// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Financial Narrative Engine (Monthly Narrative Generator)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import OpenAI from 'openai';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface FinancialNarrative {
  period: { start: string; end: string };
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    revenueChange: number;
    expenseChange: number;
  };
  sections: {
    whatHappened: string[];
    whyItHappened: string[];
    whatChanged: string[];
    requiresAttention: string[];
  };
  topCategories: Array<{ name: string; amount: number; change: number }>;
  generatedAt: string;
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
  created_at: string | null;
}

interface MonthData {
  revenue: number;
  expenses: number;
  transactions: TransactionRow[];
  categoryBreakdown: Map<string, { total: number; count: number }>;
  vendors: Set<string>;
  recurringExpenses: number;
  oneTimeExpenses: number;
}

// ─── OpenAI Client ─────────────────────────────────────────────────────────────

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30_000, // 30 second timeout
      maxRetries: 2,
    });
  }
  return openaiClient;
}

// ─── Data Fetching & Computation ───────────────────────────────────────────────

function getMonthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

function analyzeMonthData(transactions: TransactionRow[]): MonthData {
  let revenue = 0;
  let expenses = 0;
  let recurringExpenses = 0;
  let oneTimeExpenses = 0;
  const categoryBreakdown = new Map<string, { total: number; count: number }>();
  const vendors = new Set<string>();
  const vendorCounts = new Map<string, number>();

  for (const tx of transactions) {
    const vendor = tx.merchant_name || tx.merchant_raw || 'Unknown';
    vendors.add(vendor);

    const vendorCount = (vendorCounts.get(vendor) || 0) + 1;
    vendorCounts.set(vendor, vendorCount);

    const category = tx.category_human || tx.category_ai || 'Uncategorized';
    const amount = tx.amount;

    if (amount >= 0) {
      revenue += amount;
    } else {
      expenses += Math.abs(amount);
    }

    // Track category breakdown for expenses
    if (amount < 0) {
      const existing = categoryBreakdown.get(category) || { total: 0, count: 0 };
      existing.total += Math.abs(amount);
      existing.count++;
      categoryBreakdown.set(category, existing);
    }
  }

  // Classify recurring vs one-time based on vendor frequency
  for (const tx of transactions) {
    if (tx.amount < 0) {
      const vendor = tx.merchant_name || tx.merchant_raw || 'Unknown';
      const count = vendorCounts.get(vendor) || 0;
      if (count >= 2) {
        recurringExpenses += Math.abs(tx.amount);
      } else {
        oneTimeExpenses += Math.abs(tx.amount);
      }
    }
  }

  return {
    revenue: Math.round(revenue * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    transactions,
    categoryBreakdown,
    vendors,
    recurringExpenses: Math.round(recurringExpenses * 100) / 100,
    oneTimeExpenses: Math.round(oneTimeExpenses * 100) / 100,
  };
}

function computeChangePercent(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

// ─── Narrative Prompt ──────────────────────────────────────────────────────────

function buildNarrativePrompt(
  currentMonth: MonthData,
  previousMonth: MonthData,
  periodStart: string,
  periodEnd: string,
  revenueChange: number,
  expenseChange: number,
  newVendors: string[],
): string {
  const topCategories = Array.from(currentMonth.categoryBreakdown.entries())
    .map(([name, data]) => {
      const prevData = previousMonth.categoryBreakdown.get(name);
      const change = prevData
        ? computeChangePercent(data.total, prevData.total)
        : 100;
      return { name, amount: data.total, change };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  let prompt = `Generate a monthly financial narrative for the period ${periodStart} to ${periodEnd}.\n\n`;
  prompt += `## Current Month Financial Data\n`;
  prompt += `- Total Revenue: $${currentMonth.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Total Expenses: $${currentMonth.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Net Income: $${(currentMonth.revenue - currentMonth.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Transaction Count: ${currentMonth.transactions.length}\n`;
  prompt += `- Revenue Change vs Last Month: ${revenueChange >= 0 ? '+' : ''}${revenueChange}%\n`;
  prompt += `- Expense Change vs Last Month: ${expenseChange >= 0 ? '+' : ''}${expenseChange}%\n`;
  prompt += `- Recurring Expenses: $${currentMonth.recurringExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- One-time Expenses: $${currentMonth.oneTimeExpenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n\n`;

  prompt += `## Previous Month Financial Data\n`;
  prompt += `- Total Revenue: $${previousMonth.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Total Expenses: $${previousMonth.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Net Income: $${(previousMonth.revenue - previousMonth.expenses).toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`;
  prompt += `- Transaction Count: ${previousMonth.transactions.length}\n\n`;

  if (topCategories.length > 0) {
    prompt += `## Top Expense Categories (Current Month)\n`;
    for (const cat of topCategories) {
      prompt += `- ${cat.name}: $${cat.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${cat.change >= 0 ? '+' : ''}${cat.change}% change)\n`;
    }
    prompt += `\n`;
  }

  if (newVendors.length > 0) {
    prompt += `## New Vendors This Month\n`;
    for (const vendor of newVendors.slice(0, 10)) {
      prompt += `- ${vendor}\n`;
    }
    prompt += `\n`;
  }

  prompt += `## Cash Flow Summary\n`;
  const cashFlow = currentMonth.revenue - currentMonth.expenses;
  prompt += `- Net Cash Flow: $${cashFlow.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${cashFlow >= 0 ? 'Positive' : 'Negative'})\n`;
  prompt += `- Recurring Expense Ratio: ${currentMonth.expenses > 0 ? Math.round((currentMonth.recurringExpenses / currentMonth.expenses) * 100) : 0}% of total expenses\n\n`;

  prompt += `Generate the narrative with 4 sections. Each section should contain 2-4 bullet points that are insightful, actionable, and written in plain English. Reference specific numbers.`;

  return prompt;
}

const NARRATIVE_SYSTEM_PROMPT = `You are Autokkeep's Financial Narrative Engine. You generate clear, insightful monthly financial reports for small business owners.

Your job is to analyze the provided financial data and generate a narrative with exactly 4 sections:

1. **What Happened** — Key financial events, notable transactions, spending patterns
2. **Why It Happened** — Explanations of changes based on the data (new vendors, category shifts, seasonal patterns)
3. **What Changed** — Notable differences from last month with specific percentages and amounts
4. **What Requires Attention** — Warnings, action items, areas of concern (e.g., increasing expenses, cash flow risks)

Rules:
- Write in plain, non-technical language suitable for a small business owner
- Always cite specific dollar amounts and percentages from the data
- Each section should have 2-4 bullet points
- Be concise but informative — every sentence should add value
- If cash flow is negative, make it a clear warning
- Highlight any concerning trends (e.g., expenses growing faster than revenue)
- Format currency amounts properly`;

// ─── Main Narrative Generator ──────────────────────────────────────────────────

/**
 * Generates a monthly financial narrative for the specified period.
 *
 * 1. Fetches all transactions for the specified month AND the previous month
 * 2. Computes revenue, expenses, category breakdowns, vendor analysis
 * 3. Calls OpenAI to generate a structured 4-section narrative
 * 4. Stores the narrative in the financial_narratives table
 * 5. Returns the structured narrative
 */
export async function generateMonthlyNarrative(
  entityId: string,
  year: number,
  month: number,
  supabase: SupabaseQueryClient
): Promise<FinancialNarrative> {
  const client = getOpenAIClient();
  const aiModel = process.env.OPENAI_MODEL || 'gpt-4o';

  // Step 1: Fetch transactions for current and previous month
  const currentRange = getMonthDateRange(year, month);
  const prev = getPreviousMonth(year, month);
  const previousRange = getMonthDateRange(prev.year, prev.month);

  const { data: currentTransactions } = await supabase
    .from('transactions')
    .select('id, amount, date, merchant_name, merchant_raw, category_ai, category_human, status, currency, created_at')
    .eq('entity_id', entityId)
    .neq('status', 'removed')
    .gte('date', currentRange.start)
    .lte('date', currentRange.end)
    .order('date', { ascending: true })
    .limit(5000);

  const { data: previousTransactions } = await supabase
    .from('transactions')
    .select('id, amount, date, merchant_name, merchant_raw, category_ai, category_human, status, currency, created_at')
    .eq('entity_id', entityId)
    .neq('status', 'removed')
    .gte('date', previousRange.start)
    .lte('date', previousRange.end)
    .order('date', { ascending: true })
    .limit(5000);

  const currentTxns: TransactionRow[] = currentTransactions || [];
  const previousTxns: TransactionRow[] = previousTransactions || [];

  // Step 2: Compute month data
  const currentMonthData = analyzeMonthData(currentTxns);
  const previousMonthData = analyzeMonthData(previousTxns);

  const revenueChange = computeChangePercent(currentMonthData.revenue, previousMonthData.revenue);
  const expenseChange = computeChangePercent(currentMonthData.expenses, previousMonthData.expenses);

  // Identify new vendors
  const newVendors = Array.from(currentMonthData.vendors)
    .filter(v => !previousMonthData.vendors.has(v) && v !== 'Unknown');

  // Build top categories with change data
  const topCategories = Array.from(currentMonthData.categoryBreakdown.entries())
    .map(([name, data]) => {
      const prevData = previousMonthData.categoryBreakdown.get(name);
      const change = prevData
        ? computeChangePercent(data.total, prevData.total)
        : 100;
      return { name, amount: Math.round(data.total * 100) / 100, change };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Step 3: Generate narrative via OpenAI
  const userPrompt = buildNarrativePrompt(
    currentMonthData,
    previousMonthData,
    currentRange.start,
    currentRange.end,
    revenueChange,
    expenseChange,
    newVendors
  );

  let sections: FinancialNarrative['sections'] = {
    whatHappened: [],
    whyItHappened: [],
    whatChanged: [],
    requiresAttention: [],
  };

  try {
    const response = await client.chat.completions.create({
      model: aiModel,
      messages: [
        { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'financial_narrative',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              what_happened: {
                type: 'array',
                items: { type: 'string' },
                description: 'Key financial events and patterns for the month',
              },
              why_it_happened: {
                type: 'array',
                items: { type: 'string' },
                description: 'Explanations for the changes observed',
              },
              what_changed: {
                type: 'array',
                items: { type: 'string' },
                description: 'Notable differences from the previous month',
              },
              requires_attention: {
                type: 'array',
                items: { type: 'string' },
                description: 'Warnings, action items, and areas of concern',
              },
            },
            required: ['what_happened', 'why_it_happened', 'what_changed', 'requires_attention'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.4,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    sections = {
      whatHappened: parsed.what_happened || [],
      whyItHappened: parsed.why_it_happened || [],
      whatChanged: parsed.what_changed || [],
      requiresAttention: parsed.requires_attention || [],
    };
  } catch (error) {
    console.error('[Narrative Engine] OpenAI call failed:', error);

    // Generate basic fallback narrative from raw data
    const netIncome = currentMonthData.revenue - currentMonthData.expenses;
    sections = {
      whatHappened: [
        `Your business processed ${currentTxns.length} transactions this month.`,
        `Total revenue was $${currentMonthData.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} with expenses of $${currentMonthData.expenses.toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
      ],
      whyItHappened: [
        revenueChange !== 0
          ? `Revenue ${revenueChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(revenueChange)}% compared to last month.`
          : 'Revenue remained stable compared to last month.',
      ],
      whatChanged: [
        newVendors.length > 0
          ? `${newVendors.length} new vendor${newVendors.length !== 1 ? 's' : ''} appeared this month.`
          : 'No new vendors this month.',
      ],
      requiresAttention: netIncome < 0
        ? [`Net income is negative ($${netIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}). Review expenses to identify potential savings.`]
        : ['No immediate concerns identified.'],
    };
  }

  // Step 4: Build the narrative object
  const narrative: FinancialNarrative = {
    period: { start: currentRange.start, end: currentRange.end },
    summary: {
      totalRevenue: currentMonthData.revenue,
      totalExpenses: currentMonthData.expenses,
      netIncome: Math.round((currentMonthData.revenue - currentMonthData.expenses) * 100) / 100,
      revenueChange,
      expenseChange,
    },
    sections,
    topCategories,
    generatedAt: new Date().toISOString(),
  };

  // Step 5: Store the narrative
  try {
    await supabase
      .from('financial_narratives')
      .upsert({
        entity_id: entityId,
        period_start: currentRange.start,
        period_end: currentRange.end,
        narrative: JSON.stringify(narrative),
        generated_at: narrative.generatedAt,
      }, {
        onConflict: 'entity_id,period_start,period_end',
      });
  } catch (error) {
    // Storage failure should not break the response
    console.error('[Narrative Engine] Failed to store narrative:', error);
  }

  return narrative;
}
