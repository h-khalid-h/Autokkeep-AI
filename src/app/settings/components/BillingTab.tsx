'use client';

import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import type { SubscriptionData } from '../types';
import CardSkeletonBlock from './CardSkeletonBlock';
import styles from '../page.module.css';

export default function BillingTab({
  loading: pageLoading,
  orgId,
  userEmail,
  subscription,
  entityCount,
  transactionCount,
  hitlCount,
}: {
  loading: boolean;
  orgId: string;
  userEmail: string;
  subscription: SubscriptionData | null;
  entityCount: number;
  transactionCount: number;
  hitlCount: number;
}) {
  const [loading, setLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const planLabels: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
    pro: 'Pro',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active',
    past_due: 'Past Due',
    canceled: 'Canceled',
    trialing: 'Trial',
  };

  const planName = subscription ? (planLabels[subscription.plan] || subscription.plan) : 'Free Pilot';
  const planStatus = subscription ? (statusLabels[subscription.status] || subscription.status) : 'trialing';
  const planDescription = subscription
    ? `${planStatus}${subscription.current_period_end ? ` · Renews ${new Date(subscription.current_period_end).toLocaleDateString()}` : ''}`
    : '3 entities, 60-day trial';

  const entityLimit = subscription
    ? (subscription.entity_count > 0 ? subscription.entity_count : '∞')
    : 3;

  const handleCheckout = async (plan: string) => {
    if (!orgId) return;
    setLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: `${plan}_monthly`, email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillingError(data.error || 'Checkout failed. Please try again.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setBillingError('Checkout failed: no redirect URL received.');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      setBillingError('Checkout failed. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    if (!orgId) return;
    setLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBillingError(data.error || 'Failed to open billing portal.');
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setBillingError('Failed to open billing portal: no redirect URL received.');
      }
    } catch (error) {
      console.error('Portal error:', error);
      setBillingError('Failed to open billing portal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) {
    return (
      <div className={styles.skeletonStack}>
        <CardSkeletonBlock />
        <CardSkeletonBlock />
        <CardSkeletonBlock />
      </div>
    );
  }

  return (
    <div className={styles.tabContent}>
      {billingError && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {billingError}</span>
        </Card>
      )}

      {/* Current Plan */}
      <Card variant="elevated" padding="lg">
        <div className={styles.billingPlanHeader}>
          <div>
            <div className={styles.planLabel}>Current Plan</div>
            <div className={styles.planName}>{planName}</div>
            <div className={styles.planDescription}>{planDescription}</div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePortal}
            disabled={loading || !orgId}
          >
            Manage Subscription
          </Button>
        </div>
      </Card>

      {/* Usage */}
      <Card>
        <h2 className={styles.sectionTitle}>Usage This Period</h2>
        <div className={styles.usageGrid}>
          <div>
            <div className={styles.usageValue}>{entityCount}/{entityLimit}</div>
            <div className={styles.usageLabel}>Entities</div>
          </div>
          <div>
            <div className={styles.usageValue}>{transactionCount}</div>
            <div className={styles.usageLabel}>Transactions Processed</div>
          </div>
          <div>
            <div className={styles.usageValue}>{hitlCount}</div>
            <div className={styles.usageLabel}>HITL Reviews</div>
          </div>
        </div>
      </Card>

      {/* Upgrade */}
      <Card variant="accent">
        <div className={styles.textCenter}>
          <div className={styles.upgradeTitle}>Ready to Scale?</div>
          <div className={styles.upgradeDesc}>Upgrade to unlock unlimited entities and advanced features.</div>
          <div className={styles.upgradeBtns}>
            <Button variant="secondary" size="sm" onClick={() => handleCheckout('starter')} disabled={loading}>
              Starter — $29/mo
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleCheckout('growth')} disabled={loading}>
              Growth — $99/mo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleCheckout('pro')} disabled={loading}>
              Pro — $299/mo
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
