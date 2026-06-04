import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToCSV } from './csv-export';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createChainMock(resolvedValue: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.gte = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolvedValue);
  chain.then = vi.fn((resolve: (v: unknown) => void) => resolve(resolvedValue));
  return chain;
}

function createMockSupabase(data: unknown[], error: unknown = null) {
  const chain = createChainMock({ data, error });
  return { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseQueryClient;
}

const ENTITY_ID = 'entity-1';

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('exportToCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate valid CSV from journal entries', async () => {
    const mockEntries = [
      {
        id: 'aaaabbbb-cccc-4000-8000-000000000001',
        entry_date: '2025-06-15',
        memo: 'Office supplies purchase',
        status: 'posted',
        posted_at: '2025-06-15T12:00:00Z',
        journal_lines: [
          {
            id: 'line-1',
            gl_code: '5100',
            debit: 250.00,
            credit: 0,
            description: 'Office Depot purchase',
            journal_entry_id: 'aaaabbbb-cccc-4000-8000-000000000001',
          },
          {
            id: 'line-2',
            gl_code: '1000',
            debit: 0,
            credit: 250.00,
            description: 'Cash payment',
            journal_entry_id: 'aaaabbbb-cccc-4000-8000-000000000001',
          },
        ],
      },
    ];

    const supabase = createMockSupabase(mockEntries);
    const csv = await exportToCSV(supabase, ENTITY_ID);

    // Verify header
    expect(csv).toContain('Date,EntryNumber,AccountName,Description,Debit,Credit,Status');

    // Verify data rows
    const lines = csv.split('\n');
    expect(lines.length).toBe(3); // header + 2 journal lines

    // First line should have debit of 250.00
    expect(lines[1]).toContain('2025-06-15');
    expect(lines[1]).toContain('5100');
    expect(lines[1]).toContain('250.00');
    expect(lines[1]).toContain('posted');

    // Second line should have credit of 250.00
    expect(lines[2]).toContain('1000');
    expect(lines[2]).toContain('250.00');
  });

  it('should handle empty journal entries', async () => {
    const supabase = createMockSupabase([]);
    const csv = await exportToCSV(supabase, ENTITY_ID);

    // Should only have the header
    const lines = csv.split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe('Date,EntryNumber,AccountName,Description,Debit,Credit,Status');
  });

  it('should pass date filters to query', async () => {
    const chain = createChainMock({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseQueryClient;

    await exportToCSV(supabase, ENTITY_ID, {
      startDate: '2025-01-01',
      endDate: '2025-12-31',
    });

    // Verify the chain had gte and lte called
    expect(chain.gte).toHaveBeenCalledWith('entry_date', '2025-01-01');
    expect(chain.lte).toHaveBeenCalledWith('entry_date', '2025-12-31');
  });

  it('should apply .limit(25000) to the query', async () => {
    const chain = createChainMock({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseQueryClient;

    await exportToCSV(supabase, ENTITY_ID);

    expect(chain.limit).toHaveBeenCalledWith(25000);
  });

  it('should filter by status when provided', async () => {
    const chain = createChainMock({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseQueryClient;

    await exportToCSV(supabase, ENTITY_ID, { status: 'posted' });

    expect(chain.eq).toHaveBeenCalledWith('status', 'posted');
  });

  it('should filter by multiple statuses when comma-separated', async () => {
    const chain = createChainMock({ data: [], error: null });
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseQueryClient;

    await exportToCSV(supabase, ENTITY_ID, { status: 'posted,voided' });

    expect(chain.in).toHaveBeenCalledWith('status', ['posted', 'voided']);
  });

  it('should throw when query fails', async () => {
    const supabase = createMockSupabase([], { message: 'DB error' });

    await expect(exportToCSV(supabase, ENTITY_ID)).rejects.toThrow(
      'Failed to query journal entries'
    );
  });

  it('should handle entries with null memo and description', async () => {
    const mockEntries = [
      {
        id: 'aaaabbbb-cccc-4000-8000-000000000002',
        entry_date: '2025-07-01',
        memo: null,
        status: 'draft',
        posted_at: null,
        journal_lines: [
          {
            id: 'line-3',
            gl_code: '4000',
            debit: 100.00,
            credit: 0,
            description: null,
            journal_entry_id: 'aaaabbbb-cccc-4000-8000-000000000002',
          },
        ],
      },
    ];

    const supabase = createMockSupabase(mockEntries);
    const csv = await exportToCSV(supabase, ENTITY_ID);

    const lines = csv.split('\n');
    expect(lines.length).toBe(2);
    // Description should be empty, not "null"
    expect(lines[1]).not.toContain('null');
  });
});
