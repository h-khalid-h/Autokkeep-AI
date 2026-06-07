import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  escapeCSV,
  generateTransactionsCsv,
  generateChartOfAccountsCsv,
  generateAuditLogCsv,
} from './csv-generator';

// ─── Mock Supabase Builder ──────────────────────────────────────────────────────

function createMockDb(data: unknown[] = [], error: { message: string } | null = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(): any {
    const handler = {
      get(_t: unknown, p: string) {
        if (p === 'then') {
          return (resolve: (v: unknown) => void) => resolve({ data, error });
        }
        return vi.fn().mockReturnValue(new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  }

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue(makeChain()),
    }),
  } as unknown as Parameters<typeof generateTransactionsCsv>[0];
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('CSV Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ── escapeCSV ─────────────────────────────────────────────────────────────

  describe('escapeCSV', () => {
    it('should return empty string for null', () => {
      expect(escapeCSV(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(escapeCSV(undefined)).toBe('');
    });

    it('should return plain string for simple values', () => {
      expect(escapeCSV('hello')).toBe('hello');
      expect(escapeCSV(42)).toBe('42');
    });

    it('should wrap strings containing commas in double quotes', () => {
      expect(escapeCSV('hello, world')).toBe('"hello, world"');
    });

    it('should escape double quotes by doubling them', () => {
      expect(escapeCSV('she said "hello"')).toBe('"she said ""hello"""');
    });

    it('should handle strings with newlines', () => {
      expect(escapeCSV('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle strings with carriage returns', () => {
      expect(escapeCSV('line1\rline2')).toBe('"line1\rline2"');
    });

    it('should handle combined special characters', () => {
      const val = 'a "quote", a comma\nand a newline';
      const escaped = escapeCSV(val);
      expect(escaped).toBe('"a ""quote"", a comma\nand a newline"');
    });
  });

  // ── generateTransactionsCsv ───────────────────────────────────────────────

  describe('generateTransactionsCsv', () => {
    it('should produce valid CSV with correct headers', async () => {
      const db = createMockDb([
        {
          date: '2024-01-15',
          merchant_name: 'Coffee Shop',
          amount: 4.5,
          category_ai: '6100',
          category_human: null,
          status: 'approved',
          description: 'Morning coffee',
        },
        {
          date: '2024-01-16',
          merchant_name: 'Amazon',
          amount: 99.99,
          category_ai: null,
          category_human: '5000',
          status: 'pending',
          description: 'Office supplies',
        },
      ]);

      const csv = await generateTransactionsCsv(db, 'entity-001');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Date,Merchant,Amount,Category,Status,Notes');
      expect(lines).toHaveLength(3); // header + 2 rows
      expect(lines[1]).toContain('Coffee Shop');
      expect(lines[1]).toContain('4.5');
      expect(lines[1]).toContain('6100'); // category_ai used
      expect(lines[2]).toContain('Amazon');
      expect(lines[2]).toContain('5000'); // category_human used (preferred)
    });

    it('should handle empty data gracefully', async () => {
      const db = createMockDb([]);
      const csv = await generateTransactionsCsv(db, 'entity-001');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Date,Merchant,Amount,Category,Status,Notes');
      expect(lines).toHaveLength(1); // header only
    });

    it('should throw on database error', async () => {
      const db = createMockDb([], { message: 'Connection failed' });

      await expect(
        generateTransactionsCsv(db, 'entity-001')
      ).rejects.toThrow('Failed to export transactions');
    });

    it('should escape merchants containing commas', async () => {
      const db = createMockDb([
        {
          date: '2024-01-15',
          merchant_name: 'Walmart, Inc.',
          amount: 150,
          category_ai: null,
          category_human: null,
          status: 'approved',
          description: null,
        },
      ]);

      const csv = await generateTransactionsCsv(db, 'entity-001');
      expect(csv).toContain('"Walmart, Inc."');
    });
  });

  // ── generateChartOfAccountsCsv ────────────────────────────────────────────

  describe('generateChartOfAccountsCsv', () => {
    it('should produce valid CSV with correct headers', async () => {
      const db = createMockDb([
        { code: '1000', name: 'Cash', type: 'asset', is_active: true },
        { code: '2000', name: 'Accounts Payable', type: 'liability', is_active: true },
        { code: '9999', name: 'Deprecated', type: 'expense', is_active: false },
      ]);

      const csv = await generateChartOfAccountsCsv(db, 'entity-001');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Code,Name,Type,Active');
      expect(lines).toHaveLength(4);
      expect(lines[1]).toBe('1000,Cash,asset,true');
      expect(lines[3]).toContain('false');
    });

    it('should handle empty chart of accounts', async () => {
      const db = createMockDb([]);
      const csv = await generateChartOfAccountsCsv(db, 'entity-001');
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe('Code,Name,Type,Active');
    });
  });

  // ── generateAuditLogCsv ───────────────────────────────────────────────────

  describe('generateAuditLogCsv', () => {
    it('should produce valid CSV with correct headers', async () => {
      const db = createMockDb([
        {
          created_at: '2024-01-15T10:00:00Z',
          actor_id: 'user-123',
          action: 'create',
          target_type: 'transaction',
          details: { amount: 100 },
        },
      ]);

      const csv = await generateAuditLogCsv(db, 'entity-001');
      const lines = csv.split('\n');

      expect(lines[0]).toBe('Timestamp,User,Action,Resource,Details');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('user-123');
      expect(lines[1]).toContain('create');
    });

    it('should handle null details', async () => {
      const db = createMockDb([
        {
          created_at: '2024-01-15T10:00:00Z',
          actor_id: 'user-123',
          action: 'login',
          target_type: 'session',
          details: null,
        },
      ]);

      const csv = await generateAuditLogCsv(db, 'entity-001');
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      // Details should be empty string
      const lastField = lines[1].split(',').pop();
      expect(lastField).toBe('');
    });

    it('should handle empty audit log', async () => {
      const db = createMockDb([]);
      const csv = await generateAuditLogCsv(db, 'entity-001');
      const lines = csv.split('\n');
      expect(lines).toHaveLength(1);
    });
  });
});
