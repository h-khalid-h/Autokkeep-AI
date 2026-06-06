'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useEntity } from '@/lib/context/EntityContext';
import { formatCurrency } from '@/lib/currency/converter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Button, Card, Badge, Input, Skeleton, EmptyState, Modal, Toggle, useToast } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';
import styles from './page.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Vendor {
  id: string;
  name: string;
  vendor_type: VendorType;
  w9_status: W9Status;
  w9_received_at: string | null;
  is_1099_eligible: boolean;
  ytd_payments: number;
  ytd_payment_count: number;
  last_payment_date: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

type VendorType = 'individual' | 'corporation' | 'partnership' | 'llc' | 'nonprofit' | 'government' | 'unknown';
type W9Status = 'not_collected' | 'requested' | 'received' | 'verified' | 'expired';
type W9Filter = '' | W9Status;

interface VendorFormData {
  name: string;
  vendorType: VendorType;
  email: string;
  phone: string;
  address: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;
const THRESHOLD_1099 = 600;

const W9_STATUS_MAP: Record<W9Status, { label: string; variant: BadgeVariant }> = {
  not_collected: { label: 'Not Collected', variant: 'warning' },
  requested:     { label: 'Requested',     variant: 'info' },
  received:      { label: 'Received',      variant: 'success' },
  verified:      { label: 'Verified',      variant: 'success' },
  expired:       { label: 'Expired',       variant: 'destructive' },
};

const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  individual:  'Individual',
  corporation: 'Corporation',
  partnership: 'Partnership',
  llc:         'LLC',
  nonprofit:   'Nonprofit',
  government:  'Government',
  unknown:     'Unknown',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years} year${years > 1 ? 's' : ''} ago`;
}

const INITIAL_FORM: VendorFormData = {
  name: '',
  vendorType: 'unknown',
  email: '',
  phone: '',
  address: '',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function VendorsPage() {
  const { selectedEntity } = useEntity();
  const toast = useToast();
  const entityCurrency = selectedEntity?.currency || 'USD';
  const fmtCurrency = useCallback(
    (amount: number) => formatCurrency(amount, entityCurrency),
    [entityCurrency]
  );

  // Data state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyVendors, setHasAnyVendors] = useState<boolean | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [w9Filter, setW9Filter] = useState<W9Filter>('');
  const [eligible1099Filter, setEligible1099Filter] = useState(false);
  const [page, setPage] = useState(0);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [formData, setFormData] = useState<VendorFormData>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Debounced search ────────────────────────────────────────────────────
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Fetch vendors ───────────────────────────────────────────────────────
  const fetchVendors = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEntity?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('entityId', selectedEntity.id);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(page * PAGE_SIZE));

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (w9Filter) params.set('w9Status', w9Filter);
      if (eligible1099Filter) params.set('is1099Eligible', 'true');

      const res = await fetch(`/api/vendors?${params}`, { signal });
      if (!res.ok) throw new Error(`Failed to fetch vendors (${res.status})`);

      const data = await res.json();
      const list: Vendor[] = data.vendors || [];

      setVendors(list);
      setPagination(data.pagination || {
        total: 0, limit: PAGE_SIZE, offset: page * PAGE_SIZE, hasMore: false,
      });

      if (hasAnyVendors === null) {
        setHasAnyVendors(data.pagination?.total > 0 || list.length > 0);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('[Vendors] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, w9Filter, eligible1099Filter, selectedEntity?.id]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVendors(controller.signal);
    return () => controller.abort();
  }, [fetchVendors]);

  // Reset page when filters change
  useEffect(() => {
    setPage((prev) => (prev === 0 ? prev : 0));
  }, [debouncedSearch, w9Filter, eligible1099Filter]);

  // ── Modal open/close ────────────────────────────────────────────────────
  const openAddModal = () => {
    setEditingVendor(null);
    setFormData(INITIAL_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      vendorType: vendor.vendor_type,
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingVendor(null);
    setFormData(INITIAL_FORM);
  };

  // ── Save vendor (add/edit) ──────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.warning('Vendor name is required.');
      return;
    }
    if (!selectedEntity?.id) return;

    setIsSaving(true);
    try {
      if (editingVendor) {
        // PATCH
        const res = await fetch(`/api/vendors/${editingVendor.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendorType: formData.vendorType,
            email: formData.email || null,
            phone: formData.phone || null,
            address: formData.address || null,
          }),
        });
        if (!res.ok) throw new Error('Failed to update vendor');
        toast.success(`${formData.name} updated successfully.`);
      } else {
        // POST
        const res = await fetch('/api/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId: selectedEntity.id,
            name: formData.name.trim(),
            vendorType: formData.vendorType,
            email: formData.email || undefined,
            phone: formData.phone || undefined,
            address: formData.address || undefined,
          }),
        });
        if (!res.ok) throw new Error('Failed to add vendor');
        toast.success(`${formData.name} added successfully.`);
        setHasAnyVendors(true);
      }
      closeModal();
      await fetchVendors();
    } catch (err) {
      console.error('[Vendors] Save error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save vendor');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Delete vendor ───────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/vendors/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete vendor');
      toast.success(`${deleteTarget.name} deleted.`);
      setDeleteTarget(null);
      await fetchVendors();
    } catch (err) {
      console.error('[Vendors] Delete error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to delete vendor');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Derived data ────────────────────────────────────────────────────────
  const totalPages = useMemo(() => Math.ceil(pagination.total / PAGE_SIZE), [pagination.total]);
  const showFrom = pagination.total > 0 ? page * PAGE_SIZE + 1 : 0;
  const showTo = Math.min((page + 1) * PAGE_SIZE, pagination.total);
  const hasFilters = Boolean(search || w9Filter || eligible1099Filter);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ErrorBoundary componentName="Vendors">
      <AppShell>
        <div className={styles.page}>
          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className={styles.pageHeader}>
            <div className={styles.headerText}>
              <h1 className={styles.pageTitle}>Vendors</h1>
              <p className={styles.pageSubtitle}>
                Manage vendors, track W-9 compliance, and monitor 1099 eligibility
              </p>
            </div>
            <div className={styles.headerActions}>
              <Button variant="primary" size="sm" onClick={openAddModal}>
                + Add Vendor
              </Button>
            </div>
          </div>

          {/* ── Filter Bar ──────────────────────────────────────────────── */}
          <Card padding="md">
            <div className={styles.filtersCard}>
              <div className={styles.searchWrapper}>
                <span className={styles.searchIcon} aria-hidden="true">🔍</span>
                <Input
                  placeholder="Search vendors…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={styles.searchInput}
                  aria-label="Search vendors"
                />
              </div>
              <select
                className={styles.filterSelect}
                value={w9Filter}
                onChange={(e) => setW9Filter(e.target.value as W9Filter)}
                aria-label="Filter by W-9 status"
              >
                <option value="">All W-9 Statuses</option>
                <option value="not_collected">Not Collected</option>
                <option value="requested">Requested</option>
                <option value="received">Received</option>
                <option value="verified">Verified</option>
                <option value="expired">Expired</option>
              </select>
              <div className={styles.toggleFilter}>
                <Toggle
                  checked={eligible1099Filter}
                  onChange={setEligible1099Filter}
                  label="1099 Eligible Only"
                  size="sm"
                />
              </div>
            </div>
          </Card>

          {/* ── Error Banner ───────────────────────────────────────────── */}
          {error && (
            <div className={styles.errorBanner} role="alert">
              <span className={styles.errorBannerText}>⚠️ {error}</span>
              <Button variant="ghost" size="sm" onClick={() => fetchVendors()}>
                Retry
              </Button>
            </div>
          )}

          {/* ── Loading State ──────────────────────────────────────────── */}
          {isLoading && (
            <Card padding="lg">
              <Skeleton height={20} width="40%" />
              <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} height={48} width="100%" variant="rect" />
                ))}
              </div>
            </Card>
          )}

          {/* ── Empty State (no vendors at all) ────────────────────────── */}
          {!isLoading && hasAnyVendors === false && (
            <Card padding="lg">
              <EmptyState
                icon="🏢"
                title="No Vendors Yet"
                description="Add your first vendor to start tracking W-9 compliance and 1099 eligibility."
                action={
                  <Button variant="primary" onClick={openAddModal}>
                    + Add Vendor
                  </Button>
                }
              />
            </Card>
          )}

          {/* ── Empty State (no matches) ───────────────────────────────── */}
          {!isLoading && hasAnyVendors !== false && vendors.length === 0 && (
            <Card padding="lg">
              <EmptyState
                icon="🔍"
                title="No Vendors Match Your Filters"
                description="No vendors match your filters."
                action={
                  hasFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSearch('');
                        setW9Filter('');
                        setEligible1099Filter(false);
                        setPage(0);
                      }}
                    >
                      Clear All Filters
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          )}

          {/* ── Vendor Table ───────────────────────────────────────────── */}
          {!isLoading && vendors.length > 0 && (
            <Card padding="sm" className={styles.tableCard}>
              {/* Desktop Table */}
              <div className={styles.tableScroll}>
                <table className={styles.table} role="table" aria-label="Vendors list">
                  <thead>
                    <tr>
                      <th className={styles.th}>Name</th>
                      <th className={styles.th}>W-9 Status</th>
                      <th className={styles.thCenter}>1099</th>
                      <th className={styles.thRight}>YTD Payments</th>
                      <th className={styles.thRight}>Payments</th>
                      <th className={styles.th}>Last Payment</th>
                      <th className={styles.thRight}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map((vendor) => {
                      const w9Cfg = W9_STATUS_MAP[vendor.w9_status] || {
                        label: vendor.w9_status,
                        variant: 'default' as const,
                      };
                      const isAboveThreshold = vendor.ytd_payments >= THRESHOLD_1099;

                      return (
                        <tr key={vendor.id} className={styles.tr}>
                          <td className={styles.td}>
                            <div className={styles.vendorNameCell}>
                              <span className={styles.vendorName}>{vendor.name}</span>
                              <span className={styles.vendorType}>
                                <Badge variant="default" size="sm">
                                  {VENDOR_TYPE_LABELS[vendor.vendor_type] || vendor.vendor_type}
                                </Badge>
                              </span>
                            </div>
                          </td>
                          <td className={styles.td}>
                            <Badge variant={w9Cfg.variant} size="sm" dot>
                              {w9Cfg.label}
                            </Badge>
                          </td>
                          <td className={styles.tdCenter}>
                            <span
                              className={styles.eligibleIcon}
                              role="img"
                              aria-label={vendor.is_1099_eligible ? '1099 Eligible' : 'Not 1099 Eligible'}
                            >
                              {vendor.is_1099_eligible ? '✅' : '❌'}
                            </span>
                          </td>
                          <td className={styles.tdRight}>
                            <span
                              className={`${styles.amountValue} ${isAboveThreshold ? styles.amountThreshold : ''}`}
                              title={isAboveThreshold ? `Above $${THRESHOLD_1099} threshold` : undefined}
                            >
                              {fmtCurrency(vendor.ytd_payments)}
                            </span>
                          </td>
                          <td className={styles.tdRight}>
                            {vendor.ytd_payment_count}
                          </td>
                          <td className={styles.td}>
                            <span className={styles.relativeTime}>
                              {formatRelativeTime(vendor.last_payment_date)}
                            </span>
                          </td>
                          <td className={styles.actionCell}>
                            <div className={styles.actionGroup}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(vendor)}
                                aria-label={`Edit ${vendor.name}`}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setDeleteTarget(vendor)}
                                aria-label={`Delete ${vendor.name}`}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className={styles.mobileCards}>
                {vendors.map((vendor) => {
                  const w9Cfg = W9_STATUS_MAP[vendor.w9_status] || {
                    label: vendor.w9_status,
                    variant: 'default' as const,
                  };
                  const isAboveThreshold = vendor.ytd_payments >= THRESHOLD_1099;

                  return (
                    <div key={vendor.id} className={styles.mobileCard}>
                      <div className={styles.mobileCardHeader}>
                        <span className={styles.mobileCardName}>{vendor.name}</span>
                        <span
                          className={`${styles.mobileCardAmount} ${isAboveThreshold ? styles.amountThreshold : ''}`}
                        >
                          {fmtCurrency(vendor.ytd_payments)}
                        </span>
                      </div>
                      <div className={styles.mobileCardMeta}>
                        <Badge variant="default" size="sm">
                          {VENDOR_TYPE_LABELS[vendor.vendor_type] || vendor.vendor_type}
                        </Badge>
                        <Badge variant={w9Cfg.variant} size="sm" dot>
                          {w9Cfg.label}
                        </Badge>
                        <span className={styles.mobileCardField}>
                          {vendor.is_1099_eligible ? '✅ 1099' : '❌ 1099'}
                        </span>
                        <span className={styles.mobileCardField}>
                          {formatRelativeTime(vendor.last_payment_date)}
                        </span>
                      </div>
                      <div className={styles.mobileCardActions}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(vendor)}
                          aria-label={`Edit ${vendor.name}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteTarget(vendor)}
                          aria-label={`Delete ${vendor.name}`}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className={styles.pagination}>
                <span className={styles.paginationInfo}>
                  Showing {showFrom}–{showTo} of {pagination.total.toLocaleString()}
                </span>
                <div className={styles.paginationControls}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← Previous
                  </Button>
                  <span className={styles.pageIndicator}>
                    {page + 1} / {Math.max(1, totalPages)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!pagination.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next →
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* ── Add / Edit Modal ──────────────────────────────────────────── */}
        <Modal
          isOpen={isModalOpen}
          onClose={closeModal}
          title={editingVendor ? `Edit ${editingVendor.name}` : 'Add Vendor'}
          size="md"
          footer={
            <div className={styles.modalFooter}>
              <Button variant="secondary" size="sm" onClick={closeModal} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={isSaving}
                disabled={isSaving}
              >
                {editingVendor ? 'Save Changes' : 'Add Vendor'}
              </Button>
            </div>
          }
        >
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="vendor-name">
                Vendor Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="vendor-name"
                className={styles.formInput}
                type="text"
                placeholder="e.g. Acme Consulting"
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                disabled={Boolean(editingVendor)}
                required
                autoFocus
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="vendor-type">
                Vendor Type
              </label>
              <select
                id="vendor-type"
                className={styles.formSelect}
                value={formData.vendorType}
                onChange={(e) =>
                  setFormData((f) => ({ ...f, vendorType: e.target.value as VendorType }))
                }
              >
                <option value="unknown">Select type…</option>
                <option value="individual">Individual</option>
                <option value="corporation">Corporation</option>
                <option value="partnership">Partnership</option>
                <option value="llc">LLC</option>
                <option value="nonprofit">Nonprofit</option>
                <option value="government">Government</option>
              </select>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="vendor-email">
                  Email
                </label>
                <input
                  id="vendor-email"
                  className={styles.formInput}
                  type="email"
                  placeholder="vendor@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="vendor-phone">
                  Phone
                </label>
                <input
                  id="vendor-phone"
                  className={styles.formInput}
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={formData.phone}
                  onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="vendor-address">
                Address
              </label>
              <textarea
                id="vendor-address"
                className={styles.formTextarea}
                placeholder="123 Main St, Suite 100, City, State ZIP"
                value={formData.address}
                onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
        </Modal>

        {/* ── Delete Confirmation Modal ─────────────────────────────────── */}
        <Modal
          isOpen={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="Delete Vendor"
          size="sm"
          footer={
            <div className={styles.modalFooter}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                isLoading={isDeleting}
                disabled={isDeleting}
              >
                Delete Vendor
              </Button>
            </div>
          }
        >
          <p className={styles.deleteConfirmText}>
            Are you sure you want to delete{' '}
            <span className={styles.deleteConfirmName}>{deleteTarget?.name}</span>?
            This action cannot be undone.
          </p>
        </Modal>
      </AppShell>
    </ErrorBoundary>
  );
}
