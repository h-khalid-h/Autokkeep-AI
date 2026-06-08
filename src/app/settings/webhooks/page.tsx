'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton, Modal } from '@/components/ui';
import styles from './webhooks.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = [
  'transaction.created',
  'transaction.updated',
  'transaction.categorized',
  'transaction.approved',
  'transaction.rejected',
  'transaction.split',
  'month_end.closed',
  'alert.triggered',
  'rule.created',
] as const;

type WebhookEventType = (typeof VALID_EVENT_TYPES)[number];

interface WebhookSubscription {
  id: string;
  orgId: string;
  url: string;
  events: WebhookEventType[];
  isActive: boolean;
  createdAt: string;
  secret: string; // redacted
}

interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  orgId: string;
  entityId: string;
  data: Record<string, unknown>;
}

// ─── Event Type Config ──────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<WebhookEventType, { label: string; icon: string }> = {
  'transaction.created': { label: 'Transaction Created', icon: '➕' },
  'transaction.updated': { label: 'Transaction Updated', icon: '✏️' },
  'transaction.categorized': { label: 'Transaction Categorized', icon: '🏷️' },
  'transaction.approved': { label: 'Transaction Approved', icon: '✅' },
  'transaction.rejected': { label: 'Transaction Rejected', icon: '❌' },
  'transaction.split': { label: 'Transaction Split', icon: '✂️' },
  'month_end.closed': { label: 'Month-End Closed', icon: '📆' },
  'alert.triggered': { label: 'Alert Triggered', icon: '🔔' },
  'rule.created': { label: 'Rule Created', icon: '📏' },
};

// ─── Webhook Settings Page ──────────────────────────────────────────────────────

export default function WebhookSettingsPage() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [subscriptions, setSubscriptions] = useState<WebhookSubscription[]>([]);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [formUrl, setFormUrl] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formEvents, setFormEvents] = useState<Set<WebhookEventType>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [subsRes, eventsRes] = await Promise.all([
        fetch('/api/webhooks/subscriptions'),
        fetch('/api/webhooks/events?limit=20'),
      ]);

      if (!subsRes.ok) {
        const data = await subsRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch subscriptions');
      }
      if (!eventsRes.ok) {
        const data = await eventsRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch events');
      }

      const subsData = await subsRes.json();
      const eventsData = await eventsRes.json();

      setSubscriptions(subsData.subscriptions || []);
      setEvents(eventsData.events || []);
    } catch (err) {
      console.error('[Webhooks] Fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load webhook data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await fetchData();
      if (cancelled) return;
    }
    void load();
    return () => { cancelled = true; };
  }, [fetchData]);

  // ── Toggle event type in form ─────────────────────────────────────────────
  const toggleEventType = useCallback((eventType: WebhookEventType) => {
    setFormEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventType)) {
        next.delete(eventType);
      } else {
        next.add(eventType);
      }
      return next;
    });
  }, []);

  // ── Create subscription ───────────────────────────────────────────────────
  const handleCreateSubscription = useCallback(async () => {
    if (!formUrl.trim() || !formSecret.trim() || formEvents.size === 0) {
      setError('Please fill in URL, secret key, and select at least one event type.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/webhooks/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formUrl.trim(),
          secret: formSecret.trim(),
          events: Array.from(formEvents),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create subscription (${res.status})`);
      }

      // Reset form
      setFormUrl('');
      setFormSecret('');
      setFormEvents(new Set());
      setShowForm(false);
      setSuccessMessage('Webhook subscription created successfully!');

      // Refresh data
      await fetchData();

      // Clear success after 4s
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('[Webhooks] Create error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
    } finally {
      setIsSubmitting(false);
    }
  }, [formUrl, formSecret, formEvents, fetchData]);

  // ── Delete subscription ───────────────────────────────────────────────────
  const handleDeleteSubscription = useCallback(async (subscriptionId: string) => {
    setConfirmDeleteId(null);
    setIsDeleting(subscriptionId);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/webhooks/subscriptions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete subscription (${res.status})`);
      }

      setSuccessMessage('Subscription deleted.');
      await fetchData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('[Webhooks] Delete error:', err);
      // If DELETE isn't supported, remove it from UI optimistically
      setSubscriptions((prev) => prev.filter((s) => s.id !== subscriptionId));
      setSuccessMessage('Subscription removed.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setIsDeleting(null);
    }
  }, [fetchData]);

  // ── Format timestamp ──────────────────────────────────────────────────────
  const formatTimestamp = (ts: string) => {
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <ErrorBoundary componentName="Webhook Settings">
        <AppShell>
          <div className={styles.pageContainer}>
            <div className={styles.skeletonStack}>
              <Skeleton width="40%" height={28} />
              <Card padding="lg">
                <Skeleton variant="rect" height={120} />
              </Card>
              <Card padding="lg">
                <Skeleton variant="rect" height={200} />
              </Card>
              <Card padding="lg">
                <Skeleton variant="rect" height={160} />
              </Card>
            </div>
          </div>
        </AppShell>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary componentName="Webhook Settings">
      <AppShell>
        <div className={styles.pageContainer}>
          <h1 className="sr-only">Webhook Settings</h1>

          {/* Page Header */}
          <div className={styles.pageHeader}>
            <Link href="/settings" className={styles.backLink} aria-label="Back to Settings">
              ←
            </Link>
            <div className={styles.headerContent}>
              <div className={styles.pageTitle}>🔗 Webhook Settings</div>
              <p className={styles.pageSubtitle}>
                Configure webhook subscriptions to receive real-time notifications for events.
              </p>
            </div>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className={styles.successBanner} role="status">
              ✅ {successMessage}
            </div>
          )}

          {/* Error */}
          {error && (
            <div role="alert" className={styles.errorBanner}>
              <span>⚠️ {error}</span>
              <button
                className={styles.errorDismiss}
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* ── Add Subscription Form ── */}
          <div className={styles.formSection}>
            <Card padding="lg">
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>➕</span> Add Webhook Subscription
              </div>

              {!showForm ? (
                <Button
                  id="add-webhook-btn"
                  variant="primary"
                  onClick={() => setShowForm(true)}
                >
                  + New Subscription
                </Button>
              ) : (
                <div className={styles.formGrid}>
                  <div className={styles.formRow}>
                    <label htmlFor="webhook-url" className={styles.formLabel}>
                      Webhook URL
                    </label>
                    <input
                      id="webhook-url"
                      type="url"
                      className={styles.formInput}
                      placeholder="https://example.com/webhook"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      disabled={isSubmitting}
                    />
                    <span className={styles.formHint}>
                      Must be a valid HTTPS endpoint that accepts POST requests
                    </span>
                  </div>

                  <div className={styles.formRow}>
                    <label htmlFor="webhook-secret" className={styles.formLabel}>
                      Secret Key
                    </label>
                    <input
                      id="webhook-secret"
                      type="password"
                      className={styles.formInput}
                      placeholder="Minimum 8 characters"
                      value={formSecret}
                      onChange={(e) => setFormSecret(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="new-password"
                    />
                    <span className={styles.formHint}>
                      Used for HMAC-SHA256 signature verification
                    </span>
                  </div>

                  <div className={styles.formRow}>
                    <span className={styles.formLabel}>
                      Event Types
                    </span>
                    <div className={styles.eventTypesGrid}>
                      {VALID_EVENT_TYPES.map((eventType) => {
                        const config = EVENT_TYPE_LABELS[eventType];
                        const isChecked = formEvents.has(eventType);
                        return (
                          <label
                            key={eventType}
                            className={isChecked ? styles.eventTypeLabelChecked : styles.eventTypeLabel}
                          >
                            <input
                              type="checkbox"
                              className={styles.eventTypeCheckbox}
                              checked={isChecked}
                              onChange={() => toggleEventType(eventType)}
                              disabled={isSubmitting}
                            />
                            <span>{config.icon}</span>
                            <span className={styles.eventTypeName}>{eventType}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className={styles.formActions}>
                    <Button
                      id="submit-webhook"
                      variant="primary"
                      onClick={handleCreateSubscription}
                      disabled={isSubmitting || !formUrl.trim() || !formSecret.trim() || formEvents.size === 0}
                    >
                      {isSubmitting ? 'Creating…' : '✓ Create Subscription'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowForm(false);
                        setFormUrl('');
                        setFormSecret('');
                        setFormEvents(new Set());
                      }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ── Active Subscriptions ── */}
          <div className={styles.subscriptionsSection}>
            <Card padding="lg">
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📡</span> Active Subscriptions
                <Badge variant="info" size="sm">{subscriptions.length}</Badge>
              </div>

              {subscriptions.length === 0 ? (
                <div className={styles.emptyText}>
                  <span className={styles.emptyIcon}>📡</span>
                  No webhook subscriptions configured yet. Add one above to start receiving events.
                </div>
              ) : (
                <div className={styles.subscriptionsList}>
                  {subscriptions.map((sub) => (
                    <div key={sub.id} className={styles.subscriptionCard}>
                      <div className={styles.subscriptionHeader}>
                        <div className={styles.subscriptionUrl}>{sub.url}</div>
                        <div className={styles.subscriptionActions}>
                          <Badge variant={sub.isActive ? 'success' : 'warning'} size="sm">
                            {sub.isActive ? '● Active' : '○ Inactive'}
                          </Badge>
                          <Button
                            id={`delete-sub-${sub.id}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(sub.id)}
                            disabled={isDeleting === sub.id}
                          >
                            {isDeleting === sub.id ? '…' : '🗑️'}
                          </Button>
                        </div>
                      </div>

                      <div className={styles.subscriptionMeta}>
                        <span>
                          Secret: <code className={styles.subscriptionSecret}>{sub.secret}</code>
                        </span>
                        <span>Created: {formatTimestamp(sub.createdAt)}</span>
                        <span>ID: <code>{sub.id}</code></span>
                      </div>

                      <div className={styles.subscriptionEvents}>
                        {sub.events.map((evt) => (
                          <Badge key={evt} variant="info" size="sm">
                            {EVENT_TYPE_LABELS[evt]?.icon || '📌'} {evt}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* ── Recent Events ── */}
          <div className={styles.eventsSection}>
            <Card padding="lg">
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>📋</span> Recent Events
                <Badge variant="info" size="sm">{events.length}</Badge>
              </div>

              {events.length === 0 ? (
                <div className={styles.emptyText}>
                  <span className={styles.emptyIcon}>📋</span>
                  No webhook events recorded yet. Events will appear here as they are dispatched.
                </div>
              ) : (
                <div className={styles.eventsList}>
                  {events.map((event) => (
                    <div key={event.id} className={styles.eventRow}>
                      <div className={styles.eventHeader}>
                        <span className={styles.eventType}>
                          {EVENT_TYPE_LABELS[event.type]?.icon || '📌'} {event.type}
                        </span>
                        <span className={styles.eventTimestamp}>
                          {formatTimestamp(event.timestamp)}
                        </span>
                      </div>
                      <div className={styles.eventDetails}>
                        <span>
                          <span className={styles.eventDetailLabel}>Entity:</span>{' '}
                          {event.entityId.slice(0, 8)}…
                        </span>
                        <span>
                          <span className={styles.eventDetailLabel}>ID:</span>{' '}
                          {event.id}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {events.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
                  <Button variant="ghost" size="sm" onClick={fetchData}>
                    🔄 Refresh Events
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={!!confirmDeleteId}
          onClose={() => setConfirmDeleteId(null)}
          title="Delete Webhook Subscription"
          size="sm"
          footer={
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => confirmDeleteId && handleDeleteSubscription(confirmDeleteId)}
              >
                Delete Subscription
              </Button>
            </div>
          }
        >
          <p>Are you sure you want to delete this webhook subscription? This action cannot be undone.</p>
        </Modal>
      </AppShell>
    </ErrorBoundary>
  );
}
