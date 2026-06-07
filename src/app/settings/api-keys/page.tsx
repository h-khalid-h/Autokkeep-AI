'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton } from '@/components/ui';
import { useDataFetcher } from '@/hooks/useDataFetcher';
import styles from './api-keys.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

// ─── Permission & Expiry Config ─────────────────────────────────────────────────

const PERMISSION_OPTIONS = [
  { value: 'read:transactions', label: 'Read Transactions', icon: '📖' },
  { value: 'write:transactions', label: 'Write Transactions', icon: '✏️' },
  { value: 'read:reports', label: 'Read Reports', icon: '📊' },
  { value: 'manage:webhooks', label: 'Manage Webhooks', icon: '🔗' },
  { value: 'read:entities', label: 'Read Entities', icon: '🏢' },
  { value: 'manage:team', label: 'Manage Team', icon: '👥' },
];

const EXPIRY_OPTIONS = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '1y', label: '1 year' },
  { value: 'never', label: 'Never' },
];

function getExpiryDate(option: string): string | undefined {
  const now = Date.now();
  switch (option) {
    case '30d': return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    case '90d': return new Date(now + 90 * 24 * 60 * 60 * 1000).toISOString();
    case '1y': return new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();
    default: return undefined;
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────────

function ApiKeysPage() {
  // Data fetching via hook
  const { data: keys = [], isLoading, error: fetchError, refetch } = useDataFetcher(
    [] as ApiKeyInfo[],
    async (signal) => {
      const res = await fetch('/api/settings/api-keys', { signal });
      if (!res.ok) throw new Error('Failed to fetch API keys');
      const data = await res.json();
      return (data.keys || []) as ApiKeyInfo[];
    },
  );

  // Separate error state for mutation errors
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());
  const [expiryOption, setExpiryOption] = useState('90d');
  const [isCreating, setIsCreating] = useState(false);

  // Reveal state
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ─── Create Key Handler ────────────────────────────────────────────────────

  const handleCreateKey = useCallback(async () => {
    if (!keyName.trim() || selectedPermissions.size === 0) return;
    setIsCreating(true);

    try {
      const res = await fetch('/api/settings/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          permissions: Array.from(selectedPermissions),
          expiresAt: getExpiryDate(expiryOption),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create API key');
      }

      const data = await res.json();
      setRevealedKey(data.fullKey);
      setShowCreateForm(false);
      setKeyName('');
      setSelectedPermissions(new Set());
      setExpiryOption('90d');
      setSuccessMessage('API key created successfully');
      void refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  }, [keyName, selectedPermissions, expiryOption, refetch]);

  // ─── Revoke Handler ────────────────────────────────────────────────────────

  const handleRevoke = useCallback(async (keyId: string) => {
    try {
      const res = await fetch(`/api/settings/api-keys/${keyId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke API key');
      }

      setSuccessMessage('API key revoked successfully');
      setConfirmRevokeId(null);
      void refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke API key');
      setConfirmRevokeId(null);
    }
  }, [refetch]);

  // ─── Copy Handler ──────────────────────────────────────────────────────────

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  // ─── Toggle Permission ────────────────────────────────────────────────────

  const togglePermission = (perm: string) => {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) {
        next.delete(perm);
      } else {
        next.add(perm);
      }
      return next;
    });
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getKeyStatus = (key: ApiKeyInfo): { label: string; className: string } => {
    if (!key.isActive) return { label: 'Revoked', className: 'statusRevoked' };
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return { label: 'Expired', className: 'statusExpired' };
    }
    return { label: 'Active', className: 'statusActive' };
  };

  const activeKeys = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell>
        <div className={styles.pageContainer}>
          <div className={styles.pageHeader}>
            <Link href="/settings" className={styles.backLink} aria-label="Back to Settings">←</Link>
            <div className={styles.headerContent}>
              <h1 className={styles.pageTitle}>API Keys</h1>
              <p className={styles.pageSubtitle}>Manage programmatic access to your data</p>
            </div>
          </div>
          <div className={styles.skeletonStack}>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rect" height={120} />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <div className={styles.pageContainer}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <Link href="/settings" className={styles.backLink} aria-label="Back to Settings">←</Link>
          <div className={styles.headerContent}>
            <h1 className={styles.pageTitle}>API Keys</h1>
            <p className={styles.pageSubtitle}>
              Manage API keys for programmatic access to your Autokkeep data
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
            id="create-api-key-btn"
          >
            {showCreateForm ? 'Cancel' : '+ Create Key'}
          </Button>
        </div>

        {/* Banners */}
        {(fetchError || error) && (
          <div className={styles.errorBanner}>
            <span>⚠️ {fetchError || error}</span>
            <button className={styles.errorDismiss} onClick={() => setError(null)} aria-label="Dismiss error">✕</button>
          </div>
        )}

        {successMessage && (
          <div className={styles.successBanner}>
            <span>✓</span> {successMessage}
          </div>
        )}

        {/* Revealed Key */}
        {revealedKey && (
          <Card padding="lg">
            <div className={styles.keyReveal}>
              <h3 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🔑</span> Your New API Key
              </h3>
              <div className={styles.keyRevealBox}>
                <span className={styles.keyRevealValue}>{revealedKey}</span>
                <button
                  className={styles.copyButton}
                  onClick={() => handleCopy(revealedKey)}
                  aria-label="Copy API key"
                  id="copy-api-key-btn"
                >
                  {copied ? '✓' : '📋'}
                </button>
              </div>
              <div className={styles.keyRevealWarning}>
                ⚠️ Copy this key now — it won&apos;t be shown again.
              </div>
              <div className={styles.formActions}>
                <Button variant="ghost" size="sm" onClick={() => setRevealedKey(null)}>
                  I&apos;ve saved the key
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Create Form */}
        {showCreateForm && (
          <Card padding="lg">
            <div className={styles.createSection}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>🔑</span> Create API Key
              </h2>
              <div className={styles.createForm}>
                {/* Name */}
                <div className={styles.formRow}>
                  <label className={styles.formLabel} htmlFor="key-name">Key Name</label>
                  <input
                    id="key-name"
                    type="text"
                    className={styles.formInput}
                    placeholder="e.g. Production Backend"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    disabled={isCreating}
                    maxLength={100}
                  />
                  <span className={styles.formHint}>A descriptive name to identify this key</span>
                </div>

                {/* Permissions */}
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Permissions</label>
                  <div className={styles.permissionGrid}>
                    {PERMISSION_OPTIONS.map((perm) => (
                      <label
                        key={perm.value}
                        className={
                          selectedPermissions.has(perm.value)
                            ? styles.permissionLabelChecked
                            : styles.permissionLabel
                        }
                      >
                        <input
                          type="checkbox"
                          className={styles.permissionCheckbox}
                          checked={selectedPermissions.has(perm.value)}
                          onChange={() => togglePermission(perm.value)}
                          disabled={isCreating}
                        />
                        <span>{perm.icon}</span>
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Expiry */}
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>Expiry</label>
                  <div className={styles.expirySelector}>
                    {EXPIRY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        className={
                          expiryOption === opt.value
                            ? styles.expiryOptionActive
                            : styles.expiryOption
                        }
                        onClick={() => setExpiryOption(opt.value)}
                        type="button"
                        disabled={isCreating}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.formActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleCreateKey}
                    disabled={isCreating || !keyName.trim() || selectedPermissions.size === 0}
                    id="submit-create-key-btn"
                  >
                    {isCreating ? 'Creating…' : 'Create Key'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCreateForm(false)}
                    id="cancel-create-key-btn"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Active Keys */}
        <div className={styles.keysSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>🔐</span> Active Keys ({activeKeys.length})
          </h2>

          {activeKeys.length === 0 && !showCreateForm ? (
            <div className={styles.emptyText}>
              <span className={styles.emptyIcon}>🔑</span>
              <p>No API keys created yet. Create one to get started.</p>
            </div>
          ) : (
            <div className={styles.keysList}>
              {activeKeys.map((key) => {
                const status = getKeyStatus(key);
                return (
                  <div key={key.id} className={styles.keyRow}>
                    <div className={styles.keyHeader}>
                      <div className={styles.keyInfo}>
                        <span className={styles.keyName}>{key.name}</span>
                        <span className={styles.keyPrefix}>{key.prefix}…</span>
                      </div>
                      <div className={styles.keyActions}>
                        <Badge variant={status.label === 'Active' ? 'success' : 'warning'}>
                          {status.label}
                        </Badge>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setConfirmRevokeId(key.id)}
                          id={`revoke-key-${key.id}`}
                        >
                          Revoke
                        </Button>
                      </div>
                    </div>

                    <div className={styles.keyPermissions}>
                      {key.permissions.map((perm) => (
                        <span key={perm} className={styles.permissionBadge}>
                          {PERMISSION_OPTIONS.find((p) => p.value === perm)?.icon || '•'}{' '}
                          {perm}
                        </span>
                      ))}
                    </div>

                    <div className={styles.keyMeta}>
                      <span>Created: {formatDate(key.createdAt)}</span>
                      <span>Last used: {formatDate(key.lastUsedAt)}</span>
                      {key.expiresAt && <span>Expires: {formatDate(key.expiresAt)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Revoked Keys */}
        {revokedKeys.length > 0 && (
          <div className={styles.keysSection}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>⚫</span> Revoked Keys ({revokedKeys.length})
            </h2>
            <div className={styles.keysList}>
              {revokedKeys.map((key) => (
                <div key={key.id} className={styles.keyRow} style={{ opacity: 0.6 }}>
                  <div className={styles.keyHeader}>
                    <div className={styles.keyInfo}>
                      <span className={styles.keyName}>{key.name}</span>
                      <span className={styles.keyPrefix}>{key.prefix}…</span>
                    </div>
                    <Badge variant="default">Revoked</Badge>
                  </div>
                  <div className={styles.keyMeta}>
                    <span>Created: {formatDate(key.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Revoke Confirmation */}
        {confirmRevokeId && (
          <div className={styles.revokeOverlay} onClick={() => setConfirmRevokeId(null)}>
            <div className={styles.revokeContent} onClick={(e) => e.stopPropagation()}>
              <h3 className={styles.revokeTitle}>Revoke API Key</h3>
              <p className={styles.revokeDescription}>
                Are you sure you want to revoke this API key? Any applications using this key
                will immediately lose access. This action cannot be undone.
              </p>
              <div className={styles.revokeActions}>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRevokeId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRevoke(confirmRevokeId)}
                  id="confirm-revoke-btn"
                >
                  Revoke Key
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Export with ErrorBoundary ───────────────────────────────────────────────────

export default function ApiKeysSettingsPage() {
  return (
    <ErrorBoundary>
      <ApiKeysPage />
    </ErrorBoundary>
  );
}
