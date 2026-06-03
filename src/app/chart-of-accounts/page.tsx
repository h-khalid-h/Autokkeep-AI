'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Input, Modal, Skeleton, EmptyState, useToast } from '@/components/ui';
import styles from './page.module.css';

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
const TYPE_BADGE_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'destructive' | 'default'> = {
  asset:     'info',
  liability: 'warning',
  equity:    'success',
  revenue:   'success',
  expense:   'destructive',
  cogs:      'destructive',
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
  const toast = useToast();

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
  const filtered = useMemo(() => accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q);
  }), [accounts, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = sortField === 'code' ? a.code : a.name.toLowerCase();
    const bv = sortField === 'code' ? b.code : b.name.toLowerCase();
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortField, sortDir]);

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

    const duplicate = accounts.find(a => a.code === formCode.trim() && a.id !== editingAccount?.id);
    if (duplicate) { setFormError(`Code "${formCode.trim()}" already exists`); return; }

    setIsSaving(true);
    setFormError(null);

    if (editingAccount) {
      try {
        const res = await fetch('/api/chart-of-accounts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingAccount.id,
            code: formCode.trim(),
            name: formName.trim(),
            type: formType,
            description: formDescription,
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
      try {
        const res = await fetch('/api/chart-of-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId: selectedEntity?.id,
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
          const data = await res.json().catch(() => ({}));
          setFormError(data.error || 'Failed to create account. Please try again.');
          setIsSaving(false);
          return;
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
        setFormError('Network error — could not create account. Please try again.');
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
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, active: newActive } : a));

    try {
      const res = await fetch('/api/chart-of-accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: newActive }),
      });

      if (!res.ok) {
        setAccounts(prev => prev.map(a => a.id === id ? { ...a, active: !newActive } : a));
        const data = await res.json();
        setError(data.error || 'Failed to update account status');
      }
    } catch {
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
      // Parse CSV properly (handles quoted fields with commas)
      const parseCSVLine = (line: string): string[] => {
        const fields: string[] = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (inQuotes) {
            if (char === '"' && line[j + 1] === '"') {
              current += '"';
              j++; // skip escaped quote
            } else if (char === '"') {
              inQuotes = false;
            } else {
              current += char;
            }
          } else {
            if (char === '"') {
              inQuotes = true;
            } else if (char === ',') {
              fields.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
        }
        fields.push(current.trim());
        return fields;
      };

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        toast.error('CSV file is empty or has no data rows.');
        return;
      }

      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
      const codeIdx = header.findIndex(h => h === 'code' || h === 'gl code' || h === 'gl_code');
      const nameIdx = header.findIndex(h => h === 'name' || h === 'account name' || h === 'account_name');
      const typeIdx = header.findIndex(h => h === 'type' || h === 'account type' || h === 'account_type');

      // Validate required columns
      const missingCols: string[] = [];
      if (codeIdx === -1) missingCols.push('"code" (or "gl code" / "gl_code")');
      if (nameIdx === -1) missingCols.push('"name" (or "account name" / "account_name")');

      if (missingCols.length > 0) {
        toast.error(`Invalid CSV format: missing required column(s): ${missingCols.join(', ')}. Expected headers: code, name, type.`);
        return;
      }

      if (typeIdx === -1) {
        toast.warning('No "type" column found — defaulting all accounts to "Expense".');
      }

      const existingCodes = new Set(accounts.map(a => a.code));
      const importedAccounts: Account[] = [];
      let failedImports = 0;
      let skippedRows = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const code = cols[codeIdx];
        const name = cols[nameIdx];
        const type = cols[typeIdx] || 'Expense';
        if (!code || !name) { skippedRows++; continue; }
        if (existingCodes.has(code)) { skippedRows++; continue; }
        existingCodes.add(code);

        try {
          const res = await fetch('/api/chart-of-accounts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entityId: selectedEntity?.id,
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
          }
        } catch {
          failedImports++;
        }
      }

      if (importedAccounts.length > 0) {
        setAccounts(prev => [...prev, ...importedAccounts]);
        toast.success(`Imported ${importedAccounts.length} account(s) successfully.`);
      }
      if (skippedRows > 0) {
        toast.info(`Skipped ${skippedRows} row(s) (empty fields or duplicate codes).`);
      }
      if (failedImports > 0) {
        setError(`${failedImports} account(s) could not be saved to the server. Please try importing them again.`);
      }
      if (importedAccounts.length === 0 && failedImports === 0 && skippedRows === 0) {
        toast.info('No new accounts found to import.');
      }
    };
    reader.readAsText(file);
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
  const activeAccounts = useMemo(() => accounts.filter(a => a.active).length, [accounts]);
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    accounts.forEach(a => {
      const key = normalizeType(a.type);
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [accounts]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <ErrorBoundary componentName="ChartOfAccounts">
        <div className={styles.page}>
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className={styles.header}>
            <h1 className={styles.title}>Chart of Accounts</h1>
            <p className={styles.subtitle}>
              Manage GL accounts for {selectedEntity?.name || 'your entity'}
            </p>
          </div>

          {/* ── Error Banner ──────────────────────────────────────────── */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              ⚠️ {error}
              <button
                className={styles.actionBtn}
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Toolbar ───────────────────────────────────────────────── */}
          <Card padding="md">
            <div className={styles.toolbar}>
              <div className={styles.searchWrapper}>
                <Input
                  placeholder="Search by code, name, or type…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  aria-label="Search accounts"
                />
              </div>
              <div className={styles.toolbarActions}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className={styles.hiddenInput}
                  onChange={handleImportCSV}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📤 Import CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={sorted.length === 0}
                >
                  📥 Export CSV
                </Button>
                <Button variant="primary" size="sm" onClick={openAddModal}>
                  + Add Account
                </Button>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className={styles.toolbarActions}>
                <Button variant="ghost" size="sm" onClick={() => {
                  if (window.confirm(`Deactivate ${selectedIds.size} account(s)? They will be hidden from dropdowns.`)) bulkDeactivate();
                }}>
                  ⏸ Deactivate ({selectedIds.size})
                </Button>
                <Button variant="destructive" size="sm" onClick={() => {
                  if (window.confirm(`Permanently delete ${selectedIds.size} account(s)? This cannot be undone.`)) bulkDelete();
                }}>
                  🗑 Delete ({selectedIds.size})
                </Button>
              </div>
            )}
          </Card>

          {/* ── Summary Bar ───────────────────────────────────────────── */}
          {!isLoading && accounts.length > 0 && (
            <div className={styles.summaryBar}>
              <Card variant="elevated" padding="sm" className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Total</div>
                <div className={styles.summaryValue}>{totalAccounts}</div>
              </Card>
              <Card variant="elevated" padding="sm" className={styles.summaryCard}>
                <div className={styles.summaryLabel}>Active</div>
                <div className={`${styles.summaryValue} ${styles.summaryValueSuccess}`}>{activeAccounts}</div>
              </Card>
              {Object.entries(typeCounts).map(([type, count]) => (
                <Card key={type} variant="elevated" padding="sm" className={styles.summaryCard}>
                  <div className={styles.summaryLabel}>{TYPE_LABELS[type] || type}</div>
                  <div className={styles.summaryValue}>{count}</div>
                </Card>
              ))}
            </div>
          )}

          {/* ── Loading State ─────────────────────────────────────────── */}
          {isLoading && (
            <Card>
              <div className={styles.toolbar}>
                <Skeleton width="100%" height={40} />
              </div>
              <Skeleton variant="rect" width="100%" height={300} />
            </Card>
          )}

          {/* ── Empty State ───────────────────────────────────────────── */}
          {!isLoading && sorted.length === 0 && (
            <EmptyState
              icon="📒"
              title={search ? 'No matching accounts' : 'No Accounts Found'}
              description={search ? 'Try adjusting your search.' : 'Add your first GL account to get started.'}
              action={!search ? (
                <Button variant="primary" size="sm" onClick={openAddModal}>
                  + Add Account
                </Button>
              ) : undefined}
            />
          )}

          {/* ── Accounts Table ────────────────────────────────────────── */}
          {!isLoading && sorted.length > 0 && (
            <Card className={styles.tableContainer}>
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.thCheckbox}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className={styles.cellCheckbox}
                          aria-label="Select all"
                        />
                      </th>
                      <th
                        className={styles.thSortable}
                        onClick={() => toggleSort('code')}
                      >
                        Code {sortField === 'code' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th
                        className={styles.thSortable}
                        onClick={() => toggleSort('name')}
                      >
                        Name {sortField === 'name' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </th>
                      <th>Type</th>
                      <th>Status</th>
                      <th className={styles.thRight}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((account) => {
                      const isSelected = selectedIds.has(account.id);
                      const badgeVariant = TYPE_BADGE_VARIANT[normalizeType(account.type)] || 'default';

                      return (
                        <tr
                          key={account.id}
                          className={isSelected ? styles.rowSelected : undefined}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(account.id)}
                              className={styles.cellCheckbox}
                            />
                          </td>
                          <td className={styles.cellCode}>{account.code}</td>
                          <td className={styles.cellName}>{account.name}</td>
                          <td>
                            <Badge variant={badgeVariant} size="sm">
                              {displayType(account.type)}
                            </Badge>
                          </td>
                          <td>
                            <button
                              className={`${styles.statusToggle} ${account.active ? styles.statusActive : styles.statusInactive}`}
                              onClick={() => toggleActive(account.id)}
                              title={account.active ? 'Click to deactivate' : 'Click to activate'}
                            >
                              {account.active ? '● Active' : '○ Inactive'}
                            </button>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                className={styles.actionBtn}
                                onClick={() => openEditModal(account)}
                                title="Edit"
                                aria-label={`Edit ${account.name}`}
                              >
                                ✏️
                              </button>
                              {deleteConfirmId === account.id ? (
                                <div className={styles.deleteConfirmInline}>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleDelete(account.id)}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeleteConfirmId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                                  onClick={() => setDeleteConfirmId(account.id)}
                                  title="Delete"
                                  aria-label={`Delete ${account.name}`}
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

              {/* Table Footer */}
              <div className={styles.toolbar}>
                <span className={styles.summaryLabel}>
                  Showing {sorted.length} of {accounts.length} accounts
                </span>
                {search && (
                  <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                    ✕ Clear Search
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* ── Add/Edit Modal ────────────────────────────────────────── */}
          <Modal
            isOpen={modalOpen}
            onClose={closeModal}
            title={editingAccount ? 'Edit Account' : 'Add Account'}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
            {formError && (
              <div role="alert" className={styles.formError}>
                {formError}
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <Input
                  label="GL Code *"
                  type="text"
                  placeholder="e.g., 6110"
                  value={formCode}
                  onChange={e => setFormCode(e.target.value)}
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <Input
                  label="Account Name *"
                  type="text"
                  placeholder="e.g., Software & SaaS"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type</label>
                <select
                  className={styles.formSelect}
                  value={formType}
                  onChange={e => setFormType(e.target.value as AccountType)}
                >
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                  <option value="COGS">COGS</option>
                </select>
              </div>
              <div className={`${styles.formGroup} ${styles.formFullWidth}`}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  className={styles.formTextarea}
                  placeholder="Optional description…"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className={styles.activeToggle}>
                <input
                  type="checkbox"
                  id="form-active"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  className={styles.cellCheckbox}
                />
                <label htmlFor="form-active">Active</label>
              </div>
            </div>

            <div className={styles.formActions}>
              <Button variant="ghost" onClick={closeModal} type="button">
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isSaving}
                isLoading={isSaving}
              >
                {editingAccount ? 'Update' : 'Save'}
              </Button>
            </div>
            </form>
          </Modal>
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
