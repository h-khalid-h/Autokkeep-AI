'use client';

import { useState } from 'react';
import Link from 'next/link';

type SettingsTab = 'integrations' | 'billing' | 'team';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('integrations');

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'integrations', label: 'Integrations', icon: '🔌' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'team', label: 'Team', icon: '👥' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="dashboard-header">
        <Link href="/dashboard" className="navbar-logo" style={{ textDecoration: 'none' }}>
          <div className="navbar-logo-icon">AK</div>
          <span>Auto<span className="text-gradient">kkeep</span></span>
        </Link>
        <nav style={{ display: 'flex', gap: '8px' }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Back to Dashboard
        </Link>
      </header>

      <main className="container" style={{ paddingTop: 'calc(var(--header-height) + 32px)', maxWidth: '900px' }}>
        <h1 className="text-h2" style={{ marginBottom: '32px' }}>
          Settings
        </h1>

        {activeTab === 'integrations' && <IntegrationsTab />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'team' && <TeamTab />}
      </main>
    </div>
  );
}

// ============================================
// INTEGRATIONS TAB
// ============================================

function IntegrationsTab() {
  const integrations = [
    {
      category: 'Banking',
      items: [
        {
          name: 'Plaid',
          description: 'Connect bank accounts and credit cards for automatic transaction import.',
          icon: '🏦',
          status: 'available',
          action: 'Connect Bank',
          endpoint: '/api/plaid/link-token',
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
          status: 'available',
          action: 'Connect QBO',
          endpoint: '/api/ledger/quickbooks/auth',
        },
        {
          name: 'Xero',
          description: 'Sync categorized transactions and manual journals to Xero.',
          icon: '📘',
          status: 'available',
          action: 'Connect Xero',
          endpoint: '/api/ledger/xero/auth',
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
          status: 'available',
          action: 'Add to Slack',
          endpoint: '/api/channels/slack/install',
        },
        {
          name: 'Microsoft Teams',
          description: 'Send receipt requests via Teams Adaptive Cards and incoming webhooks.',
          icon: '🟣',
          status: 'available',
          action: 'Configure Teams',
          endpoint: '#',
        },
        {
          name: 'WhatsApp',
          description: 'Chase receipts and get categorization input via WhatsApp Business.',
          icon: '📱',
          status: 'available',
          action: 'Setup WhatsApp',
          endpoint: '#',
        },
        {
          name: 'SMS',
          description: 'Send receipt requests and get responses via text message.',
          icon: '📲',
          status: 'available',
          action: 'Setup SMS',
          endpoint: '#',
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
          status: 'configured',
          action: 'Configure',
          endpoint: '#',
        },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {integrations.map((category) => (
        <div key={category.category}>
          <h3 className="text-h4" style={{ marginBottom: '16px', color: 'var(--text-secondary)' }}>
            {category.category}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {category.items.map((item) => (
              <div key={item.name} className="card" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '20px',
              }}>
                <div style={{ fontSize: '2rem', flexShrink: 0 }}>{item.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="text-h4">{item.name}</div>
                  <div className="text-body" style={{ marginTop: '4px' }}>{item.description}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  {item.status === 'configured' && (
                    <span className="badge badge-success">Connected</span>
                  )}
                  <a
                    href={item.endpoint}
                    className={`btn ${item.status === 'configured' ? 'btn-ghost' : 'btn-primary'} btn-sm`}
                  >
                    {item.status === 'configured' ? 'Manage' : item.action}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// BILLING TAB
// ============================================

function BillingTab() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async (plan: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: 'current-org', plan, email: 'user@example.com' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: 'current-org' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Portal error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Current Plan */}
      <div className="card-elevated" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="text-caption" style={{ marginBottom: '4px' }}>Current Plan</div>
            <div className="text-h3">Free Pilot</div>
            <div className="text-body" style={{ marginTop: '4px' }}>3 entities, 60-day trial</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handlePortal} disabled={loading}>
            Manage Subscription
          </button>
        </div>
      </div>

      {/* Usage */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Usage This Period</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>2/3</div>
            <div className="text-caption">Entities</div>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>147</div>
            <div className="text-caption">Transactions Processed</div>
          </div>
          <div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>12</div>
            <div className="text-caption">HITL Reviews</div>
          </div>
        </div>
      </div>

      {/* Upgrade */}
      <div className="card-accent" style={{ padding: '24px', textAlign: 'center' }}>
        <div className="text-h4" style={{ marginBottom: '8px' }}>Ready to Scale?</div>
        <div className="text-body" style={{ marginBottom: '16px' }}>Upgrade to unlock unlimited entities and advanced features.</div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleCheckout('smb_basic')} disabled={loading}>
            SMB Basic — $249/mo
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleCheckout('smb_growth')} disabled={loading}>
            SMB Growth — $499/mo
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// TEAM TAB
// ============================================

function TeamTab() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('accountant');

  const mockMembers = [
    { name: 'You (Owner)', email: 'you@company.com', role: 'owner', accepted: true },
    { name: 'Sarah Chen', email: 'sarah@company.com', role: 'admin', accepted: true },
    { name: 'Pending Invite', email: 'new@company.com', role: 'accountant', accepted: false },
  ];

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Invitation sent to ${email} as ${role}`);
    setEmail('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Invite Form */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Invite Team Member</div>
        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="invite-email" className="text-caption" style={{ display: 'block', marginBottom: '4px' }}>Email</label>
            <input
              id="invite-email"
              type="email"
              className="input"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div style={{ width: '180px' }}>
            <label htmlFor="invite-role" className="text-caption" style={{ display: 'block', marginBottom: '4px' }}>Role</label>
            <select id="invite-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="accountant">Accountant</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Invite</button>
        </form>
        <p className="text-caption" style={{ marginTop: '8px' }}>
          💡 Unlimited seats — all plans include unlimited team members at no extra cost.
        </p>
      </div>

      {/* Team Members */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="text-h4" style={{ marginBottom: '16px' }}>Team Members</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {mockMembers.map((member) => (
            <div key={member.email} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid var(--border-primary)',
            }}>
              <div>
                <div className="text-body" style={{ fontWeight: 600 }}>{member.name}</div>
                <div className="text-caption">{member.email}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`badge ${member.accepted ? 'badge-success' : 'badge-warning'}`}>
                  {member.accepted ? member.role : 'Pending'}
                </span>
                {member.role !== 'owner' && (
                  <button className="btn btn-ghost btn-sm">Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
