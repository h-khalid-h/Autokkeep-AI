import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  deleteNotification,
} from './engine';

// ─── Mock Supabase Builder ──────────────────────────────────────────────────────

function createMockDb(overrides?: {
  selectData?: unknown[];
  selectError?: { message: string } | null;
  insertData?: unknown;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  updateCount?: number;
  countValue?: number;
  countError?: { message: string } | null;
}) {
  const {
    selectData = [],
    selectError = null,
    insertData = null,
    insertError = null,
    updateError = null,
    updateCount = 1,
    countValue = 0,
    countError = null,
  } = overrides ?? {};

  // Track the chain to know which terminal method was called
  const chainMethods = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    single: vi.fn(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chainProxy: any = new Proxy(chainMethods, {
    get(_target, prop: string) {
      if (prop === 'then') return undefined; // Not a thenable

      // Terminal methods
      if (prop === 'single') {
        return vi.fn().mockResolvedValue({ data: insertData, error: insertError });
      }

      // For select with count: 'exact' and head: true
      if (prop === 'select') {
        return vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact' && opts?.head === true) {
            // Return count chain
            const countChain = new Proxy({}, {
              get(_t, p: string) {
                if (p === 'then') {
                  return (resolve: (v: unknown) => void) =>
                    resolve({ count: countValue, error: countError });
                }
                return vi.fn().mockReturnValue(countChain);
              },
            });
            return countChain;
          }
          return chainProxy;
        });
      }

      // For data-returning calls, resolve with data
      return vi.fn().mockImplementation(() => {
        // After update chain
        if (prop === 'update') {
          const updateChain = new Proxy({}, {
            get(_t, p: string) {
              if (p === 'then') {
                return (resolve: (v: unknown) => void) =>
                  resolve({ error: updateError, count: updateCount });
              }
              return vi.fn().mockReturnValue(updateChain);
            },
          });
          return updateChain;
        }

        // Default chain proxy — at the end of chain, resolve with selectData
        const terminalProxy = new Proxy({}, {
          get(_t, p: string) {
            if (p === 'then') {
              return (resolve: (v: unknown) => void) =>
                resolve({ data: selectData, error: selectError });
            }
            return vi.fn().mockReturnValue(terminalProxy);
          },
        });
        return terminalProxy;
      });
    },
  });

  const from = vi.fn().mockReturnValue(chainProxy);
  return { from, auth: {} } as unknown as { from: typeof from; auth: Record<string, unknown> };
}

// ─── Simple builder-style mock ──────────────────────────────────────────────────

function createSimpleMock() {
  let _insertData: unknown = null;
  let _insertError: { message: string } | null = null;
  let _selectData: unknown[] = [];
  let _selectError: { message: string } | null = null;
  let _updateError: { message: string } | null = null;
  let _updateCount = 1;
  let _countVal = 0;

  const insertFn = vi.fn();
  const updateFn = vi.fn();
  const selectFn = vi.fn();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(terminal: () => any): any {
    const handler = {
      get(_t: unknown, p: string) {
        if (p === 'then') {
          const result = terminal();
          return (resolve: (v: unknown) => void) => resolve(result);
        }
        return vi.fn().mockReturnValue(new Proxy({}, handler));
      },
    };
    return new Proxy({}, handler);
  }

  const db = {
    from: vi.fn().mockImplementation(() => ({
      insert: vi.fn().mockImplementation((data: unknown) => {
        insertFn(data);
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: _insertData ?? { ...data as Record<string, unknown>, id: 'notif-001', created_at: '2024-01-01T00:00:00Z' },
              error: _insertError,
            }),
          }),
        };
      }),
      select: vi.fn().mockImplementation((_cols: string, opts?: { count?: string; head?: boolean }) => {
        selectFn();
        if (opts?.count === 'exact' && opts?.head) {
          return makeChain(() => ({ count: _countVal, error: null }));
        }
        return makeChain(() => ({ data: _selectData, error: _selectError }));
      }),
      update: vi.fn().mockImplementation((data: unknown) => {
        updateFn(data);
        return makeChain(() => ({ error: _updateError, count: _updateCount }));
      }),
    })),
  };

  return {
    db: db as unknown as Parameters<typeof createNotification>[0],
    insertFn,
    updateFn,
    selectFn,
    setInsertResult: (data: unknown, error: { message: string } | null = null) => {
      _insertData = data;
      _insertError = error;
    },
    setSelectResult: (data: unknown[], error: { message: string } | null = null) => {
      _selectData = data;
      _selectError = error;
    },
    setUpdateResult: (error: { message: string } | null = null, count = 1) => {
      _updateError = error;
      _updateCount = count;
    },
    setCountResult: (count: number) => {
      _countVal = count;
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('Notification Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress log output in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ── createNotification ────────────────────────────────────────────────────

  describe('createNotification', () => {
    it('should insert a notification and return it', async () => {
      const mock = createSimpleMock();
      const notifRow = {
        id: 'notif-001',
        user_id: 'user-123',
        type: 'system_alert',
        title: 'Test Alert',
        message: 'Something happened',
        metadata: null,
        read: false,
        created_at: '2024-01-01T00:00:00Z',
        read_at: null,
        deleted_at: null,
      };
      mock.setInsertResult(notifRow);

      const result = await createNotification(
        mock.db,
        'user-123',
        'system_alert',
        'Test Alert',
        'Something happened'
      );

      expect(result).not.toBeNull();
      expect(result!.id).toBe('notif-001');
      expect(result!.userId).toBe('user-123');
      expect(result!.type).toBe('system_alert');
      expect(result!.read).toBe(false);
      expect(result!.readAt).toBeNull();
    });

    it('should return null on insert failure', async () => {
      const mock = createSimpleMock();
      mock.setInsertResult(null, { message: 'DB error' });

      const result = await createNotification(
        mock.db,
        'user-123',
        'system_alert',
        'Test',
        'Msg'
      );

      expect(result).toBeNull();
    });

    it('should accept optional metadata', async () => {
      const mock = createSimpleMock();
      const notifRow = {
        id: 'notif-002',
        user_id: 'user-123',
        type: 'export_complete',
        title: 'Export Done',
        message: 'CSV ready',
        metadata: { fileSize: 1024 },
        read: false,
        created_at: '2024-01-01T00:00:00Z',
        read_at: null,
        deleted_at: null,
      };
      mock.setInsertResult(notifRow);

      const result = await createNotification(
        mock.db,
        'user-123',
        'export_complete',
        'Export Done',
        'CSV ready',
        { fileSize: 1024 }
      );

      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual({ fileSize: 1024 });
    });
  });

  // ── getNotifications ──────────────────────────────────────────────────────

  describe('getNotifications', () => {
    it('should return paginated notifications', async () => {
      const mock = createSimpleMock();
      mock.setSelectResult([
        {
          id: 'n1',
          user_id: 'u1',
          type: 'system_alert',
          title: 'Alert 1',
          message: 'Msg 1',
          metadata: null,
          read: false,
          created_at: '2024-01-02T00:00:00Z',
          read_at: null,
          deleted_at: null,
        },
        {
          id: 'n2',
          user_id: 'u1',
          type: 'team_invite',
          title: 'Invite',
          message: 'You were invited',
          metadata: null,
          read: true,
          created_at: '2024-01-01T00:00:00Z',
          read_at: '2024-01-01T12:00:00Z',
          deleted_at: null,
        },
      ]);

      const results = await getNotifications(mock.db, 'u1', { limit: 10, offset: 0 });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('n1');
      expect(results[1].read).toBe(true);
    });

    it('should return empty array on error', async () => {
      const mock = createSimpleMock();
      mock.setSelectResult([], { message: 'DB failure' });

      const results = await getNotifications(mock.db, 'u1');
      expect(results).toEqual([]);
    });
  });

  // ── markAsRead ────────────────────────────────────────────────────────────

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult(null, 1);

      const success = await markAsRead(mock.db, 'notif-001', 'user-123');
      expect(success).toBe(true);
    });

    it('should return false on update error', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult({ message: 'Not found' }, 0);

      const success = await markAsRead(mock.db, 'notif-999', 'user-123');
      expect(success).toBe(false);
    });
  });

  // ── markAllAsRead ─────────────────────────────────────────────────────────

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult(null, 5);

      const count = await markAllAsRead(mock.db, 'user-123');
      expect(count).toBe(5);
    });

    it('should return 0 on error', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult({ message: 'DB failure' }, 0);

      const count = await markAllAsRead(mock.db, 'user-123');
      expect(count).toBe(0);
    });
  });

  // ── getUnreadCount ────────────────────────────────────────────────────────

  describe('getUnreadCount', () => {
    it('should return the unread count', async () => {
      const db = createMockDb({ countValue: 7 });
      const count = await getUnreadCount(db as never, 'user-123');
      expect(count).toBe(7);
    });

    it('should return 0 on error', async () => {
      const db = createMockDb({ countValue: 0, countError: { message: 'fail' } });
      const count = await getUnreadCount(db as never, 'user-123');
      expect(count).toBe(0);
    });
  });

  // ── deleteNotification ────────────────────────────────────────────────────

  describe('deleteNotification', () => {
    it('should soft-delete a notification', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult(null, 1);

      const success = await deleteNotification(mock.db, 'notif-001', 'user-123');
      expect(success).toBe(true);
    });

    it('should return false on delete error', async () => {
      const mock = createSimpleMock();
      mock.setUpdateResult({ message: 'Not found' }, 0);

      const success = await deleteNotification(mock.db, 'notif-999', 'user-123');
      expect(success).toBe(false);
    });
  });
});
