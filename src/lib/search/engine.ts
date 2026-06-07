// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Autokkeep — Global Search Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Provides combined search across transactions, vendors, and categories.
// Results are scored by relevance and grouped by type.

import { createLogger } from '@/lib/logger';

const log = createLogger('search-engine');

// ─── Types ──────────────────────────────────────────────────────────────────────

export type SearchResultType = 'transaction' | 'vendor' | 'category';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  url: string;
  score: number;
}

export interface SearchOptions {
  query: string;
  types?: SearchResultType[];
  entityId?: string;
  limit?: number;
}

// ─── Minimal DB Interface (for testability) ─────────────────────────────────────

interface QueryResult<T> {
  data: T[] | null;
  error: unknown;
}

interface FilterBuilder<T> {
  ilike: (column: string, pattern: string) => FilterBuilder<T>;
  in: (column: string, values: string[]) => FilterBuilder<T>;
  eq: (column: string, value: string) => FilterBuilder<T>;
  is: (column: string, value: null) => FilterBuilder<T>;
  limit: (count: number) => Promise<QueryResult<T>>;
}

export interface SearchDB {
  from: (table: string) => {
    select: (columns: string) => FilterBuilder<Record<string, unknown>>;
  };
}

// ─── Transaction Row ────────────────────────────────────────────────────────────

interface TransactionRow {
  id: string;
  merchant_name: string | null;
  notes: string | null;
  amount: number;
  date: string;
}

// ─── Vendor Row ─────────────────────────────────────────────────────────────────

interface VendorRow {
  id: string;
  name: string;
  category: string | null;
}

// ─── Category Row ───────────────────────────────────────────────────────────────

interface CategoryRow {
  id: string;
  name: string;
  code: string;
}

// ─── Combined Search ────────────────────────────────────────────────────────────

export async function search(
  db: SearchDB,
  orgId: string,
  options: SearchOptions
): Promise<SearchResult[]> {
  const { query, types, entityId, limit = 20 } = options;
  const trimmed = query.trim();

  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  const searchTypes = types && types.length > 0
    ? types
    : (['transaction', 'vendor', 'category'] as SearchResultType[]);

  const perTypeLimit = Math.ceil(limit / searchTypes.length);
  const entityIds = entityId ? [entityId] : [];

  const promises: Promise<SearchResult[]>[] = [];

  if (searchTypes.includes('transaction')) {
    promises.push(searchTransactions(db, entityIds, trimmed, perTypeLimit));
  }
  if (searchTypes.includes('vendor')) {
    promises.push(searchVendors(db, orgId, trimmed, perTypeLimit));
  }
  if (searchTypes.includes('category')) {
    promises.push(searchCategories(db, entityIds, trimmed, perTypeLimit));
  }

  try {
    const results = await Promise.all(promises);
    const merged = results.flat();

    // Sort by score descending, take top `limit`
    merged.sort((a, b) => b.score - a.score);
    return merged.slice(0, limit);
  } catch (err) {
    log.error('Search failed', {
      orgId,
      query: trimmed,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── Search Transactions ────────────────────────────────────────────────────────

export async function searchTransactions(
  db: SearchDB,
  entityIds: string[],
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const pattern = `%${query}%`;

  try {
    let builder = db
      .from('transactions')
      .select('id, merchant_name, notes, amount, date')
      .ilike('merchant_name', pattern)
      .is('deleted_at', null);

    if (entityIds.length > 0) {
      builder = builder.in('entity_id', entityIds);
    }

    const { data, error } = await builder.limit(limit);

    if (error || !data) {
      log.warn('Transaction search failed', { error, query });
      return [];
    }

    return (data as unknown as TransactionRow[]).map((row) => ({
      type: 'transaction' as const,
      id: row.id,
      title: row.merchant_name || 'Unknown Merchant',
      subtitle: `$${Math.abs(Number(row.amount) || 0).toFixed(2)} — ${row.date || 'No date'}`,
      url: buildSearchUrl('transaction', row.id),
      score: computeScore(row.merchant_name || '', query),
    }));
  } catch (err) {
    log.warn('Transaction search error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ─── Search Vendors ─────────────────────────────────────────────────────────────

export async function searchVendors(
  db: SearchDB,
  orgId: string,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const pattern = `%${query}%`;

  try {
    const { data, error } = await db
      .from('vendors')
      .select('id, name, category')
      .ilike('name', pattern)
      .eq('org_id', orgId)
      .limit(limit);

    if (error || !data) {
      log.warn('Vendor search failed', { error, query });
      return [];
    }

    return (data as unknown as VendorRow[]).map((row) => ({
      type: 'vendor' as const,
      id: row.id,
      title: row.name,
      subtitle: row.category || 'Uncategorized',
      url: buildSearchUrl('vendor', row.id),
      score: computeScore(row.name, query),
    }));
  } catch (err) {
    log.warn('Vendor search error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ─── Search Categories ──────────────────────────────────────────────────────────

export async function searchCategories(
  db: SearchDB,
  entityIds: string[],
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const pattern = `%${query}%`;

  try {
    let builder = db
      .from('categories')
      .select('id, name, code')
      .ilike('name', pattern);

    if (entityIds.length > 0) {
      builder = builder.in('entity_id', entityIds);
    }

    const { data, error } = await builder.limit(limit);

    if (error || !data) {
      log.warn('Category search failed', { error, query });
      return [];
    }

    return (data as unknown as CategoryRow[]).map((row) => ({
      type: 'category' as const,
      id: row.id,
      title: row.name,
      subtitle: `Code: ${row.code}`,
      url: buildSearchUrl('category', row.id),
      score: computeScore(row.name, query),
    }));
  } catch (err) {
    log.warn('Category search error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ─── URL Builder ────────────────────────────────────────────────────────────────

export function buildSearchUrl(type: SearchResultType, id: string): string {
  switch (type) {
    case 'transaction':
      return `/transactions?highlight=${id}`;
    case 'vendor':
      return `/vendors/${id}`;
    case 'category':
      return `/settings/categories?highlight=${id}`;
    default:
      return '/';
  }
}

// ─── Scoring ────────────────────────────────────────────────────────────────────

function computeScore(text: string, query: string): number {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match = highest score
  if (lower === queryLower) return 100;

  // Starts with query
  if (lower.startsWith(queryLower)) return 80;

  // Contains query as a word
  if (lower.includes(` ${queryLower}`) || lower.includes(`${queryLower} `)) return 60;

  // Contains query anywhere
  if (lower.includes(queryLower)) return 40;

  // Partial match (fallback)
  return 20;
}
