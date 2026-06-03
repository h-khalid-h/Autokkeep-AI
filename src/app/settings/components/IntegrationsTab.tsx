'use client';

import { useState, useEffect } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import type { EntityData, ConnectionStatus } from '../types';
import CardSkeletonBlock from './CardSkeletonBlock';
import styles from '../page.module.css';

export default function IntegrationsTab({
  loading,
  entities,
  connections,
  onRefresh,
}: {
  loading: boolean;
  entities: EntityData[];
  connections: ConnectionStatus;
  onRefresh: () => void;
}) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Load Plaid Link SDK on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) return;
    const existing = document.querySelector('script[src*="plaid.com/link"]');
    if (existing) return;

    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    document.head.appendChild(script);
  }, []);

  // Helper: wait for Plaid SDK to be available (may still be loading)
  const waitForPlaid = (): Promise<unknown | null> => {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).Plaid) {
        resolve((window as unknown as Record<string, unknown>).Plaid);
        return;
      }
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 100;
        if ((window as unknown as Record<string, unknown>).Plaid) {
          clearInterval(interval);
          resolve((window as unknown as Record<string, unknown>).Plaid);
        } else if (elapsed >= 10000) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    });
  };

  // Default to first entity if available
  const primaryEntityId = entities.length > 0 ? entities[0].id : '';

  const handlePlaidConnect = async () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('plaid');
    setActionError(null);
    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: primaryEntityId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create link token');

      // Wait for Plaid SDK (may still be loading)
      const plaidObj = await waitForPlaid();
      if (!plaidObj) {
        setActionError('Plaid Link SDK failed to load. Please refresh and try again.');
        return;
      }

      const PlaidLink = plaidObj as Record<string, (...args: unknown[]) => unknown>;
      const handler = PlaidLink.create({
        token: data.link_token,
        onSuccess: async (publicToken: string, metadata: Record<string, unknown>) => {
          try {
            const exchangeRes = await fetch('/api/plaid/exchange', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                publicToken,
                entityId: primaryEntityId,
                institutionId: (metadata?.institution as Record<string, unknown>)?.institution_id || undefined,
                institutionName: (metadata?.institution as Record<string, unknown>)?.name || 'Unknown',
              }),
            });
            if (!exchangeRes.ok) {
              const errData = await exchangeRes.json().catch(() => ({}));
              throw new Error(errData.error || 'Token exchange failed');
            }
            onRefresh();
          } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Failed to connect bank account');
          }
        },
        onExit: () => setActionLoading(null),
      });
      (handler as Record<string, unknown> & { open: () => void }).open();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to connect bank');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLedgerConnect = (provider: 'quickbooks' | 'xero') => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading(provider);
    const path = provider === 'quickbooks'
      ? `/api/ledger/quickbooks/auth?entityId=${primaryEntityId}`
      : `/api/ledger/xero/auth?entityId=${primaryEntityId}`;
    window.location.assign(path);
  };

  const handleSlackConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('slack');
    window.location.assign(`/api/channels/slack/install?entityId=${primaryEntityId}`);
  };

  const handleTeamsConnect = async () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('teams');
    setActionError(null);
    try {
      const webhookUrl = prompt('Enter your Microsoft Teams Incoming Webhook URL:');
      if (!webhookUrl) {
        setActionLoading(null);
        return;
      }
      const res = await fetch('/api/channels/teams/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: primaryEntityId, webhookUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to configure Teams');
      }
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to configure Teams');
    } finally {
      setActionLoading(null);
    }
  };

  const handleWhatsAppConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('whatsapp');
    window.location.assign(`/api/channels/whatsapp/setup?entityId=${primaryEntityId}`);
  };

  const handleSMSConnect = () => {
    if (!primaryEntityId) {
      setActionError('No entity found. Please create an entity first.');
      return;
    }
    setActionLoading('sms');
    window.location.assign(`/api/channels/sms/setup?entityId=${primaryEntityId}`);
  };

  const getStatus = (key: string): 'configured' | 'available' => {
    if (key === 'Plaid') return connections.plaid ? 'configured' : 'available';
    if (key === 'QuickBooks Online') return connections.quickbooks ? 'configured' : 'available';
    if (key === 'Xero') return connections.xero ? 'configured' : 'available';
    if (key === 'Slack') return connections.slack ? 'configured' : 'available';
    return 'available';
  };

  const getHandler = (key: string): (() => void) | undefined => {
    if (key === 'Plaid') return handlePlaidConnect;
    if (key === 'QuickBooks Online') return () => handleLedgerConnect('quickbooks');
    if (key === 'Xero') return () => handleLedgerConnect('xero');
    if (key === 'Slack') return handleSlackConnect;
    if (key === 'Microsoft Teams') return handleTeamsConnect;
    if (key === 'WhatsApp') return handleWhatsAppConnect;
    if (key === 'SMS') return handleSMSConnect;
    if (key === 'OpenAI (GPT-4o)') return () => {
      alert('OpenAI is configured server-side via environment variables.\n\nModel: GPT-4o\nConfidence threshold: 0.95\n\nContact your admin to change AI settings.');
    };
    return undefined;
  };

  const integrations = [
    {
      category: 'Banking',
      items: [
        {
          name: 'Plaid',
          description: 'Connect bank accounts and credit cards for automatic transaction import.',
          icon: '🏦',
          action: 'Connect Bank',
        },
      ],
    },
    {
      category: 'Accounting Ledger',
      items: [
        {
          name: 'QuickBooks Online',
          description: 'Sync categorized transactions and journal entries to QuickBooks.',
          icon: '📗',
          action: 'Connect QBO',
        },
        {
          name: 'Xero',
          description: 'Sync categorized transactions and manual journals to Xero.',
          icon: '📘',
          action: 'Connect Xero',
        },
      ],
    },
    {
      category: 'Messaging Channels',
      items: [
        {
          name: 'Slack',
          description: 'Send receipt requests and get categorization input via Slack interactive messages.',
          icon: '💬',
          action: 'Add to Slack',
        },
        {
          name: 'Microsoft Teams',
          description: 'Send receipt requests via Teams Adaptive Cards and incoming webhooks.',
          icon: '🟣',
          action: 'Configure Teams',
        },
        {
          name: 'WhatsApp',
          description: 'Chase receipts and get categorization input via WhatsApp Business.',
          icon: '📱',
          action: 'Setup WhatsApp',
        },
        {
          name: 'SMS',
          description: 'Send receipt requests and get responses via text message.',
          icon: '📲',
          action: 'Setup SMS',
        },
      ],
    },
    {
      category: 'AI Engine',
      items: [
        {
          name: 'OpenAI (GPT-4o)',
          description: 'Powers the probabilistic categorization engine with structured output and confidence scoring.',
          icon: '🤖',
          action: 'Configure',
        },
      ],
    },
  ];

  if (loading) {
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
      {actionError && (
        <Card className={styles.errorBanner} padding="sm">
          <span className={styles.errorText}>⚠️ {actionError}</span>
        </Card>
      )}

      {integrations.map((category) => (
        <div key={category.category}>
          <h3 className={styles.categoryTitle}>{category.category}</h3>
          <div className={styles.categoryList}>
            {category.items.map((item) => {
              const status = getStatus(item.name);
              const handler = getHandler(item.name);
              const isItemLoading = actionLoading === item.name.toLowerCase().replace(/\s.*/, '');

              return (
                <Card key={item.name} padding="sm">
                  <div className={styles.integrationRow}>
                    <div className={styles.integrationIcon}>{item.icon}</div>
                    <div className={styles.integrationInfo}>
                      <div className={styles.integrationName}>{item.name}</div>
                      <div className={styles.integrationDesc}>{item.description}</div>
                    </div>
                    <div className={styles.integrationActions}>
                      {status === 'configured' && (
                        <Badge variant="success">Connected</Badge>
                      )}
                      {handler ? (
                        <Button
                          variant={status === 'configured' ? 'ghost' : 'primary'}
                          size="sm"
                          onClick={handler}
                          disabled={isItemLoading}
                          isLoading={isItemLoading}
                        >
                          {status === 'configured' ? 'Manage' : item.action}
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled
                          className={styles.comingSoon}
                        >
                          Not Available
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
