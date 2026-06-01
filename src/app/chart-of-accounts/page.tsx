'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import { useEntity } from '@/lib/context/EntityContext';
import Logo from '@/components/ui/Logo';

// ─── Lazy Supabase singleton (never at module level) ────────────────────────
let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function _getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface Account {
  id: string;
  entity_id?: string;
  code: string;
  name: string;
  type: string;
  active: boolean;
  description?: string;
}

type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' | 'COGS';
type SortField = 'code' | 'name';
type SortDir = 'asc' | 'desc';

// ─── Type badge config ──────────────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  asset:     { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.25)' },
  liability: { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.25)' },
  equity:    { color: '#14b8a6', bg: 'rgba(20,184,166,0.12)',  border: 'rgba(20,184,166,0.25)' },
  revenue:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.25)' },
  expense:   { color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.25)' },
  cogs:      { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.25)' },
};

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
  cogs: 'COGS',
};


// ─── Helpers ────────────────────────────────────────────────────────────────
function normalizeType(t: string): string {
  return (t || '').toLowerCase();
}

function displayType(t: string): string {
  const key = normalizeType(t);
  return TYPE_LABELS[key] || t;
}

interface ApiAccountRow {
  id: string;
  entity_id?: string;
  code: string;
  name: string;
  type: string;
  is_active?: boolean;
  description?: string;
}

function mapApiAccount(row: ApiAccountRow): Account {
  return {
    id: row.id,
    entity_id: row.entity_id,
    code: row.code,
    name: row.name,
    type: displayType(row.type),
    active: row.is_active !== false,
    description: row.description || '',
  };
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const { selectedEntity } = useEntity();

  // Data state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & sort
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('code');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<AccountType>('Expense');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // CSV import ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch accounts ─────────────────────────────────────────────────────
  const fetchAccounts = useCallback(async () => {
    if (!selectedEntity?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chart-of-accounts?entityId=${selectedEntity.id}`);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const data = await res.json();
      const mapped = (data.accounts || []).map(mapApiAccount);
      setAccounts(mapped);
    } catch (err) {
      console.error('[ChartOfAccounts] Fetch error:', err);
      setAccounts([]);
      setError('Could not load accounts from server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEntity]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchAccounts();
  }, [fetchAccounts]);

  // ─── Filtering & sorting ────────────────────────────────────────────────
  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = sortField === 'code' ? a.code : a.name.toLowerCase();
    const bv = sortField === 'code' ? b.code : b.name.toLowerCase();
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // ─── Selection helpers ──────────────────────────────────────────────────
  const allSelected = sorted.length > 0 && sorted.every(a => selectedIds.has(a.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sorted.map(a => a.id)));
    }
  };

  // ─── Modal helpers ──────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingAccount(null);
    setFormCode('');
    setFormName('');
    setFormType('Expense');
    setFormDescription('');
    setFormActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormCode(account.code);
    setFormName(account.name);
    setFormType(account.type as AccountType);
    setFormDescription(account.description || '');
    setFormActive(account.active);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingAccount(null);
    setFormError(null);
  };

  // ─── Save (add / edit) ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formCode.trim()) { setFormError('GL Code is required'); return; }
    if (!formName.trim()) { setFormError('Account Name is required'); return; }

    // Check for duplicate code (client-side)
    const duplicate = accounts.find(a => a.code === formCode.trim() && a.id !== editingAccount?.id);
    if (duplicate) { setFormError(`Code "${formCode.trim()}" already exists`); return; }

    setIsSaving(true);
    setFormError(null);

    if (editingAccount) {
      // Persist edit via API
      try {
        const res = await fetch('/api/chart-of-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingAccount.id,
            code: formCode.trim(),
            name: formName.trim(),
            type: formType,
            is_active: formActive,
          }),
        });

        if (res.status === 409) {
          const data = await res.json();
          setFormError(data.error || 'Duplicate code');
          setIsSaving(false);
          return;
        }

        if (!res.ok) {
          const data = await res.json();
          setFormError(data.error || 'Failed to update account');
          setIsSaving(false);
          return;
        }

        const data = await res.json();
        if (data.account) {
          setAccounts(prev => prev.map(a =>
            a.id === editingAccount.id ? mapApiAccount(data.account) : a
          ));
        } else {
          // Fallback: update locally
          setAccounts(prev => prev.map(a =>
            a.id === editingAccount.id
              ? { ...a, code: formCode.trim(), name: formName.trim(), type: formType, description: formDescription, active: formActive }
              : a
          ));
        }
        closeModal();
      } catch {
        setFormError('Network error — could not save changes');
      } finally {
        setIsSaving(false);
      }
    } else {
      // Create via API
      try {
        const res = await fetch('/api/chart-of-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: formCode.trim(),
            name: formName.trim(),
            type: formType,
            description: formDescription,
            active: formActive,
          }),
        });

        if (res.status === 409) {
          const data = await res.json();
          setFormError(data.error || 'Duplicate code');
          setIsSaving(false);
          return;
        }

        if (!res.ok) {
          // Fallback: add locally
          const newAccount: Account = {
            id: `local-${Date.now()}`,
            code: formCode.trim(),
            name: formName.trim(),
            type: formType,
            active: formActive,
            description: formDescription,
          };
          setAccounts(prev => [...prev, newAccount]);
        } else {
          const data = await res.json();
          if (data.account) {
            setAccounts(prev => [...prev, mapApiAccount(data.account)]);
          } else {
            await fetchAccounts();
          }
        }
        closeModal();
      } catch {
        // Fallback: add locally
        const newAccount: Account = {
          id: `local-${Date.now()}`,
          code: formCode.trim(),
          name: formName.trim(),
          type: formType,
          active: formActive,
          description: formDescription,
        };
        setAccounts(prev => [...prev, newAccount]);
        closeModal();
      } finally {
        setIsSaving(false);
      }
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/chart-of-accounts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete account');
        setDeleteConfirmId(null);
        return;
      }

      setAccounts(prev => prev.filter(a => a.id !== id));
      setDeleteConfirmId(null);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch {
      setError('Network error — could not delete account');
      setDeleteConfirmId(null);
    }
  };

  // ─── Toggle active ─────────────────────────────────────────────────────
  const toggleActive = async (id: string) => {
    const account = accounts.find(a => a.id === id);
    if (!account) return;

    const newActive = !account.active;

    // Optimistically update UI
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, active: newActive } : a));

    try {
      const res = await fetch('/api/chart-of-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: newActive }),
      });

      if (!res.ok) {
        // Revert on failure
        setAccounts(prev => prev.map(a => a.id === id ? { ...a, active: !newActive } : a));
        const data = await res.json();
        setError(data.error || 'Failed to update account status');
      }
    } catch {
      // Revert on network error
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, active: !newActive } : a));
      setError('Network error — could not update account status');
    }
  };

  // ─── Bulk actions ───────────────────────────────────────────────────────
  const bulkDelete = async () => {
    const idsToDelete = Array.from(selectedIds);
    const failed: string[] = [];

    await Promise.all(
      idsToDelete.map(async (id) => {
        try {
          const res = await fetch(`/api/chart-of-accounts?id=${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          if (!res.ok) failed.push(id);
        } catch {
          failed.push(id);
        }
      })
    );

    // Remove only successfully deleted accounts from state
    const deletedIds = new Set(idsToDelete.filter(id => !failed.includes(id)));
    setAccounts(prev => prev.filter(a => !deletedIds.has(a.id)));
    setSelectedIds(prev => {
      const next = new Set(prev);
      deletedIds.forEach(id => next.delete(id));
      return next;
    });

    if (failed.length > 0) {
      setError(`Failed to delete ${failed.length} account(s). Please try again.`);
    }
  };

  const bulkDeactivate = async () => {
    const idsToDeactivate = Array.from(selectedIds);
    const failed: string[] = [];

    await Promise.all(
      idsToDeactivate.map(async (id) => {
        try {
          const res = await fetch('/api/chart-of-accounts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_active: false }),
          });
          if (!res.ok) failed.push(id);
        } catch {
          failed.push(id);
        }
      })
    );

    // Only deactivate successfully updated accounts in state
    const deactivatedIds = new Set(idsToDeactivate.filter(id => !failed.includes(id)));
    setAccounts(prev => prev.map(a => deactivatedIds.has(a.id) ? { ...a, active: false } : a));
    setSelectedIds(new Set());

    if (failed.length > 0) {
      setError(`Failed to deactivate ${failed.length} account(s). Please try again.`);
    }
  };

  // ─── CSV Import ─────────────────────────────────────────────────────────
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return; // need header + at least 1 row

      // Parse header
      const header = lines[0].split(',').map(h => h.trim().toLowerCase());
      const codeIdx = header.findIndex(h => h === 'code' || h === 'gl code' || h === 'gl_code');
      const nameIdx = header.findIndex(h => h === 'name' || h === 'account name' || h === 'account_name');
      const typeIdx = header.findIndex(h => h === 'type' || h === 'account type' || h === 'account_type');

      if (codeIdx === -1 || nameIdx === -1) return;

      const existingCodes = new Set(accounts.map(a => a.code));
      const importedAccounts: Account[] = [];
      let failedImports = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const code = cols[codeIdx];
        const name = cols[nameIdx];
        const type = cols[typeIdx] || 'Expense';
        if (!code || !name) continue;
        if (existingCodes.has(code)) continue; // skip duplicates
        existingCodes.add(code);

        try {
          const res = await fetch('/api/chart-of-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              name,
              type: displayType(type),
              active: true,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.account) {
              importedAccounts.push(mapApiAccount(data.account));
            } else {
              importedAccounts.push({
                id: `import-${Date.now()}-${i}`,
                code,
                name,
                type: displayType(type),
                active: true,
              });
            }
          } else {
            failedImports++;
            // Fallback: add locally even if API fails
            importedAccounts.push({
              id: `import-${Date.now()}-${i}`,
              code,
              name,
              type: displayType(type),
              active: true,
            });
          }
        } catch {
          failedImports++;
          // Fallback: add locally on network error
          importedAccounts.push({
            id: `import-${Date.now()}-${i}`,
            code,
            name,
            type: displayType(type),
            active: true,
          });
        }
      }

      if (importedAccounts.length > 0) {
        setAccounts(prev => [...prev, ...importedAccounts]);
      }
      if (failedImports > 0) {
        setError(`${failedImports} account(s) could not be saved to the server and were added locally.`);
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── CSV Export ─────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const header = 'Code,Name,Type,Status\n';
    const rows = sorted.map(a => `"${a.code}","${a.name}","${a.type}","${a.active ? 'Active' : 'Inactive'}"`).join('\n');
    const csv = header + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-of-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Summary stats ─────────────────────────────────────────────────────
  const totalAccounts = accounts.length;
  const activeAccounts = accounts.filter(a => a.active).length;
  const typeCounts: Record<string, number> = {};
  accounts.forEach(a => {
    const key = normalizeType(a.type);
    typeCounts[key] = (typeCounts[key] || 0) + 1;
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <Logo size={32} />
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <h1 className="text-h3" style={{ margin: 0 }}>Chart of Accounts</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-primary btn-sm" onClick={openAddModal}>
            + Add Account
          </button>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">← Dashboard</Link>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 24px)', maxWidth: '1200px', paddingBottom: '48px' }}>

        {/* ── Error Banner ─────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--destructive-subtle)',
              color: 'var(--destructive)',
              padding: '12px 20px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px',
              border: '1px solid var(--destructive-border)',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ── Search & Filter Bar ──────────────────────────────────────────── */}
        <div className="card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', fontSize: '14px' }}>🔍</span>
              <input
                className="input"
                type="text"
                placeholder="Search by code, name, or type…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            {/* Import / Export */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleImportCSV}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              📤 Import CSV
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportCSV}
              disabled={sorted.length === 0}
            >
              📥 Export CSV
            </button>
            {/* Bulk actions */}
            {selectedIds.size > 0 && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={bulkDeactivate} style={{ color: 'var(--warning)' }}>
                  ⏸ Deactivate ({selectedIds.size})
                </button>
                <button className="btn btn-ghost btn-sm" onClick={bulkDelete} style={{ color: 'var(--destructive)' }}>
                  🗑 Delete ({selectedIds.size})
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Summary Bar ──────────────────────────────────────────────────── */}
        {!isLoading && accounts.length > 0 && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div className="card-elevated" style={{ padding: '14px 20px', flex: '0 0 auto' }}>
              <div className="text-caption">Total</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '2px' }}>{totalAccounts}</div>
            </div>
            <div className="card-elevated" style={{ padding: '14px 20px', flex: '0 0 auto' }}>
              <div className="text-caption">Active</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '2px', color: 'var(--success)' }}>{activeAccounts}</div>
            </div>
            {Object.entries(typeCounts).map(([type, count]) => {
              const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.expense;
              return (
                <div key={type} className="card-elevated" style={{ padding: '14px 20px', flex: '0 0 auto' }}>
                  <div className="text-caption">{TYPE_LABELS[type] || type}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '2px', color: cfg.color }}>{count}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Loading State ────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="card" style={{ padding: '60px', textAlign: 'center' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid var(--bg-elevated)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <p className="text-caption">Loading chart of accounts…</p>
          </div>
        )}

        {/* ── Empty State ──────────────────────────────────────────────────── */}
        {!isLoading && sorted.length === 0 && (
          <div className="card" style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📒</div>
            <h3 className="text-h4" style={{ marginBottom: '8px' }}>No Accounts Found</h3>
            <p className="text-caption" style={{ marginBottom: '16px' }}>
              {search ? 'Try adjusting your search.' : 'Add your first GL account to get started.'}
            </p>
            {!search && (
              <button className="btn btn-primary btn-sm" onClick={openAddModal}>
                + Add Account
              </button>
            )}
          </div>
        )}

        {/* ── Accounts Table ───────────────────────────────────────────────── */}
        {!isLoading && sorted.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    {/* Select All */}
                    <th style={{ padding: '14px 16px', width: '40px', background: 'var(--bg-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                      />
                    </th>
                    {/* Code */}
                    <th
                      onClick={() => toggleSort('code')}
                      style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                        background: 'var(--bg-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Code {sortField === 'code' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    {/* Name */}
                    <th
                      onClick={() => toggleSort('name')}
                      style={{
                        padding: '14px 16px',
                        textAlign: 'left',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                        background: 'var(--bg-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Name {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    {/* Type */}
                    <th style={{
                      padding: '14px 16px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap', background: 'var(--bg-secondary)',
                    }}>
                      Type
                    </th>
                    {/* Status */}
                    <th style={{
                      padding: '14px 16px', textAlign: 'left', fontWeight: 600,
                      color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap', background: 'var(--bg-secondary)',
                    }}>
                      Status
                    </th>
                    {/* Actions */}
                    <th style={{
                      padding: '14px 16px', textAlign: 'right', fontWeight: 600,
                      color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap', background: 'var(--bg-secondary)',
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((account) => {
                    const typeCfg = TYPE_CONFIG[normalizeType(account.type)] || TYPE_CONFIG.expense;
                    const isSelected = selectedIds.has(account.id);

                    return (
                      <tr
                        key={account.id}
                        style={{
                          borderBottom: '1px solid var(--border-primary)',
                          background: isSelected ? 'var(--bg-glass-hover)' : 'transparent',
                          transition: 'background 150ms ease',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-glass)'; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {/* Checkbox */}
                        <td style={{ padding: '14px 16px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(account.id)}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
                          />
                        </td>
                        {/* Code */}
                        <td style={{ padding: '14px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                          {account.code}
                        </td>
                        {/* Name */}
                        <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                          {account.name}
                        </td>
                        {/* Type badge */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            color: typeCfg.color,
                            background: typeCfg.bg,
                            border: `1px solid ${typeCfg.border}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {displayType(account.type)}
                          </span>
                        </td>
                        {/* Status badge */}
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            ...(account.active
                              ? { color: 'var(--success)', background: 'var(--success-subtle)', border: '1px solid var(--success-border)' }
                              : { color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }
                            ),
                          }}>
                            {account.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {/* Actions */}
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {/* Edit */}
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEditModal(account)}
                              title="Edit"
                              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                            >
                              ✏️
                            </button>
                            {/* Toggle active */}
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleActive(account.id)}
                              title={account.active ? 'Deactivate' : 'Activate'}
                              style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                            >
                              {account.active ? '⏸' : '▶️'}
                            </button>
                            {/* Delete */}
                            {deleteConfirmId === account.id ? (
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => handleDelete(account.id)}
                                  style={{ fontSize: '0.7rem', padding: '4px 8px', color: 'var(--destructive)' }}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => setDeleteConfirmId(null)}
                                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setDeleteConfirmId(account.id)}
                                title="Delete"
                                style={{ fontSize: '0.8rem', padding: '4px 8px', color: 'var(--destructive)' }}
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Table Footer ──────────────────────────────────────────────── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderTop: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
            }}>
              <span className="text-caption">
                Showing {sorted.length} of {accounts.length} accounts
              </span>
              {search && (
                <button className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                  ✕ Clear Search
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Add/Edit Modal ───────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '32px',
              animation: 'slide-up-fade 0.2s ease-out',
            }}
          >
            <h2 className="text-h3" style={{ marginBottom: '24px' }}>
              {editingAccount ? 'Edit Account' : 'Add Account'}
            </h2>

            {formError && (
              <div
                role="alert"
                style={{
                  background: 'var(--destructive-subtle)',
                  color: 'var(--destructive)',
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  marginBottom: '16px',
                  border: '1px solid var(--destructive-border)',
                }}
              >
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* GL Code */}
              <div>
                <label className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  GL Code <span style={{ color: 'var(--destructive)' }}>*</span>
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g., 6110"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Account Name */}
              <div>
                <label className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  Account Name <span style={{ color: 'var(--destructive)' }}>*</span>
                </label>
                <input
                  className="input"
                  type="text"
                  placeholder="e.g., Software & SaaS"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  Type
                </label>
                <select
                  className="input"
                  value={formType}
                  onChange={e => setFormType(e.target.value as AccountType)}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                  <option value="COGS">COGS</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="text-caption" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
                  Description
                </label>
                <textarea
                  className="input"
                  placeholder="Optional description…"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Active */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="form-active"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                />
                <label htmlFor="form-active" className="text-caption" style={{ cursor: 'pointer', fontWeight: 500 }}>
                  Active
                </label>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '28px' }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={isSaving}
                style={{ opacity: isSaving ? 0.6 : 1 }}
              >
                {isSaving ? '⏳ Saving…' : editingAccount ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spin + slide keyframes */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes slide-up-fade {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
