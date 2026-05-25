'use client';

import { useState } from 'react';
import Link from 'next/link';

type OnboardingStep = 'welcome' | 'entity' | 'bank' | 'ledger' | 'channel' | 'complete';

const STEPS: { id: OnboardingStep; title: string; icon: string; description: string }[] = [
  { id: 'welcome', title: 'Welcome', icon: '👋', description: 'Let\'s set up your autonomous bookkeeping engine' },
  { id: 'entity', title: 'Create Entity', icon: '🏢', description: 'Set up your bookkeeping entity' },
  { id: 'bank', title: 'Connect Bank', icon: '🏦', description: 'Link your bank accounts via Plaid' },
  { id: 'ledger', title: 'Connect Ledger', icon: '📗', description: 'Connect QuickBooks or Xero' },
  { id: 'channel', title: 'Set Up Channel', icon: '💬', description: 'Choose your receipt chase channel' },
  { id: 'complete', title: 'All Set!', icon: '🚀', description: 'Your autonomous engine is ready' },
];

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [entityName, setEntityName] = useState('');
  const [selectedLedger, setSelectedLedger] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');

  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((currentIndex) / (STEPS.length - 1)) * 100;

  const goNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <header style={{
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: '14px',
          }}>AK</div>
          <span className="text-gradient" style={{ fontSize: '18px', fontWeight: 700 }}>
            Autokkeep Setup
          </span>
        </div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">Skip for now →</Link>
      </header>

      {/* Progress Bar */}
      <div style={{ padding: '0 32px', marginTop: '24px' }}>
        <div style={{
          height: '4px', borderRadius: '2px',
          background: 'var(--bg-tertiary)', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: '2px',
            background: 'var(--accent-gradient)',
            width: `${progress}%`,
            transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
          {STEPS.map((step, i) => (
            <div key={step.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              opacity: i <= currentIndex ? 1 : 0.35,
              transition: 'opacity 0.3s ease',
            }}>
              <span style={{ fontSize: '14px' }}>{step.icon}</span>
              <span className="text-caption" style={{
                fontWeight: i === currentIndex ? 600 : 400,
                color: i === currentIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}>{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 32px',
      }}>
        <div style={{ maxWidth: '560px', width: '100%' }}>

          {/* Welcome Step */}
          {currentStep === 'welcome' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '4rem', marginBottom: '24px' }}>👋</div>
              <h1 className="text-h1" style={{ marginBottom: '16px' }}>Welcome to Autokkeep</h1>
              <p className="text-body" style={{ marginBottom: '40px', maxWidth: '400px', margin: '0 auto 40px' }}>
                Let&apos;s get your autonomous bookkeeping engine running in under 5 minutes.
                We&apos;ll connect your bank, your ledger, and your preferred communication channel.
              </p>
              <button className="btn btn-primary btn-lg" onClick={goNext}>
                Let&apos;s Get Started →
              </button>
            </div>
          )}

          {/* Entity Step */}
          {currentStep === 'entity' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>🏢 Create Your Entity</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                An entity represents a company or client you&apos;re managing bookkeeping for.
              </p>
              <div className="card" style={{ padding: '32px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <label className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Entity Name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Acme Corp, My Startup LLC"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Base Currency</label>
                  <select className="input" defaultValue="USD">
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="CAD">CAD — Canadian Dollar</option>
                  </select>
                </div>
                <div>
                  <label className="text-caption" style={{ display: 'block', marginBottom: '8px' }}>Fiscal Year End</label>
                  <select className="input" defaultValue="12">
                    <option value="12">December</option>
                    <option value="3">March</option>
                    <option value="6">June</option>
                    <option value="9">September</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack}>← Back</button>
                <button className="btn btn-primary" onClick={goNext} disabled={!entityName.trim()}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Bank Step */}
          {currentStep === 'bank' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>🏦 Connect Your Bank</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                We use Plaid to securely connect to your bank. Your credentials are never stored on our servers.
              </p>
              <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
                <p className="text-body" style={{ marginBottom: '24px' }}>
                  Click below to open Plaid Link and connect your bank accounts.
                  Autokkeep will automatically import and categorize your transactions.
                </p>
                <button className="btn btn-primary btn-lg" onClick={() => {
                  // In production, this calls /api/plaid/link-token
                  alert('Plaid Link would open here. Configure PLAID_CLIENT_ID in .env.local to enable.');
                  goNext();
                }}>
                  🏦 Connect Bank Account
                </button>
                <p className="text-caption" style={{ marginTop: '16px' }}>
                  Supported: Chase, Bank of America, Wells Fargo, Capital One, and 12,000+ more
                </p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack}>← Back</button>
                <button className="btn btn-ghost" onClick={goNext}>Skip for now →</button>
              </div>
            </div>
          )}

          {/* Ledger Step */}
          {currentStep === 'ledger' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>📗 Connect Your Ledger</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                Choose your accounting software. We&apos;ll sync your Chart of Accounts and push journal entries automatically.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { id: 'quickbooks', name: 'QuickBooks Online', icon: '📗', desc: 'Most popular for US businesses' },
                  { id: 'xero', name: 'Xero', icon: '📘', desc: 'Popular worldwide, especially UK/AU' },
                  { id: 'none', name: 'No ledger yet', icon: '📋', desc: 'I\'ll connect one later' },
                ].map((ledger) => (
                  <button
                    key={ledger.id}
                    className="card"
                    onClick={() => setSelectedLedger(ledger.id)}
                    style={{
                      padding: '20px',
                      display: 'flex', alignItems: 'center', gap: '16px',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      border: selectedLedger === ledger.id
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-primary)',
                      transition: 'border 0.2s ease',
                    }}
                  >
                    <span style={{ fontSize: '2rem' }}>{ledger.icon}</span>
                    <div>
                      <div className="text-h4">{ledger.name}</div>
                      <div className="text-caption">{ledger.desc}</div>
                    </div>
                    {selectedLedger === ledger.id && (
                      <span style={{ marginLeft: 'auto', color: 'var(--status-success)' }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack}>← Back</button>
                <button className="btn btn-primary" onClick={goNext} disabled={!selectedLedger}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Channel Step */}
          {currentStep === 'channel' && (
            <div>
              <h2 className="text-h2" style={{ marginBottom: '8px' }}>💬 Set Up Receipt Chase</h2>
              <p className="text-body" style={{ marginBottom: '32px' }}>
                Choose how Autokkeep should reach your team when it needs a receipt or categorization confirmation.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { id: 'slack', name: 'Slack', icon: '💬', desc: 'Interactive messages' },
                  { id: 'teams', name: 'Teams', icon: '🟣', desc: 'Adaptive Cards' },
                  { id: 'sms', name: 'SMS', icon: '📲', desc: 'Text messages' },
                  { id: 'whatsapp', name: 'WhatsApp', icon: '📱', desc: 'Business messaging' },
                ].map((channel) => (
                  <button
                    key={channel.id}
                    className="card"
                    onClick={() => setSelectedChannel(channel.id)}
                    style={{
                      padding: '24px',
                      cursor: 'pointer', textAlign: 'center',
                      border: selectedChannel === channel.id
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--border-primary)',
                      transition: 'border 0.2s ease',
                    }}
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>{channel.icon}</div>
                    <div className="text-h4">{channel.name}</div>
                    <div className="text-caption">{channel.desc}</div>
                    {selectedChannel === channel.id && (
                      <div style={{ color: 'var(--status-success)', marginTop: '8px' }}>✓ Selected</div>
                    )}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                <button className="btn btn-ghost" onClick={goBack}>← Back</button>
                <button className="btn btn-primary" onClick={goNext} disabled={!selectedChannel}>
                  Finish Setup →
                </button>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {currentStep === 'complete' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px', height: '80px', borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 24px', fontSize: '2.5rem',
              }}>🚀</div>
              <h1 className="text-h1" style={{ marginBottom: '16px' }}>You&apos;re All Set!</h1>
              <p className="text-body" style={{ marginBottom: '12px', maxWidth: '420px', margin: '0 auto 12px' }}>
                {entityName ? `${entityName} is ready to go.` : 'Your entity is ready to go.'}
                {' '}Autokkeep will now:
              </p>
              <div className="card" style={{ padding: '24px', textAlign: 'left', marginBottom: '32px' }}>
                <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <li className="text-body">✅ Automatically import new bank transactions</li>
                  <li className="text-body">✅ Categorize each transaction using the dual-engine AI</li>
                  <li className="text-body">✅ Auto-approve high-confidence matches (≥95%)</li>
                  <li className="text-body">✅ Flag exceptions for your review</li>
                  <li className="text-body">✅ Chase missing receipts via {selectedChannel || 'your channel'}</li>
                  <li className="text-body">✅ Sync approved entries to {selectedLedger === 'quickbooks' ? 'QuickBooks' : selectedLedger === 'xero' ? 'Xero' : 'your ledger'}</li>
                </ul>
              </div>
              <Link href="/dashboard" className="btn btn-primary btn-lg" style={{ textDecoration: 'none' }}>
                Go to Dashboard →
              </Link>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
