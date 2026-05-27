'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient as getSupabase } from '@/lib/supabase/client';


interface UserProfile {
  email: string;
  fullName: string;
  initials: string;
  memberSince: string;
}

const MOCK_USER: UserProfile = {
  email: 'demo@autokkeep.com',
  fullName: 'Demo User',
  initials: 'DU',
  memberSince: '2024-01-15T00:00:00Z',
};

export default function AccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Preferences state — persisted to localStorage
  const [theme, setThemeRaw] = useState<'dark' | 'light' | 'system'>('dark');
  const [notifPrefs, setNotifPrefsRaw] = useState({
    email: true,
    slack: false,
    sms: false,
  });

  // Load saved preferences on mount
  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('autokkeep-theme');
      if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'system') {
        setThemeRaw(savedTheme);
      }
      const savedNotifs = localStorage.getItem('autokkeep-notif-prefs');
      if (savedNotifs) {
        setNotifPrefsRaw(JSON.parse(savedNotifs));
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Wrap setters to persist
  const setTheme = useCallback((t: 'dark' | 'light' | 'system') => {
    setThemeRaw(t);
    try { localStorage.setItem('autokkeep-theme', t); } catch {}
  }, []);

  const setNotifPrefs: React.Dispatch<React.SetStateAction<{ email: boolean; slack: boolean; sms: boolean }>> = useCallback(
    (action: React.SetStateAction<{ email: boolean; slack: boolean; sms: boolean }>) => {
      setNotifPrefsRaw((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        try { localStorage.setItem('autokkeep-notif-prefs', JSON.stringify(next)); } catch {}
        return next;
      });
    },
    []
  );

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = getSupabase();
        const { data: { user: authUser } } = await supabase.auth.getUser();

        if (authUser) {
          const email = authUser.email || '';
          const parts = email.split('@')[0].split(/[._-]/);
          const initials = parts.length >= 2
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : email.slice(0, 2).toUpperCase();
          const fullName = parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

          setUser({
            email,
            fullName,
            initials,
            memberSince: authUser.created_at || new Date().toISOString(),
          });
        } else {
          setUser(MOCK_USER);
        }
      } catch {
        setUser(MOCK_USER);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const handlePasswordReset = useCallback(async () => {
    if (!user) return;
    try {
      const supabase = getSupabase();
      await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      setPasswordResetSent(true);
      setTimeout(() => setPasswordResetSent(false), 5000);
    } catch {
      // Silently fail for demo mode
    }
  }, [user]);

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete account');
      }

      const supabase = getSupabase();
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch {
      setDeleting(false);
    }
  }, [deleteConfirmText]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: '18px',
              margin: '0 auto 16px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          >
            AK
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Loading account...
          </p>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.6; transform: scale(0.95); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        padding: 'var(--space-8)',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Back link */}
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            textDecoration: 'none',
            marginBottom: 'var(--space-6)',
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
        >
          ← Back to Dashboard
        </Link>

        {/* Page title */}
        <h1
          style={{
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: 'var(--space-8)',
            color: 'var(--text-primary)',
          }}
        >
          Account Settings
        </h1>

        {/* ─── Section: Profile ─────────────────────────────────────────── */}
        <section
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-5)',
            }}
          >
            Profile
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
            {/* Avatar */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: '22px',
                flexShrink: 0,
              }}
            >
              {user.initials}
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '4px',
                }}
              >
                {user.fullName}
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  marginBottom: '4px',
                }}
              >
                {user.email}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: 'var(--text-tertiary)',
                }}
              >
                Member since {formatDate(user.memberSince)}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Section: Security ────────────────────────────────────────── */}
        <section
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-5)',
            }}
          >
            Security
          </h2>

          {/* Change password */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-5)',
              paddingBottom: 'var(--space-5)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Password
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {passwordResetSent
                  ? '✅ Password reset email sent!'
                  : 'Send a password reset link to your email'}
              </div>
            </div>
            <button
              onClick={handlePasswordReset}
              disabled={passwordResetSent}
              className="btn btn-secondary btn-sm"
              style={{
                opacity: passwordResetSent ? 0.6 : 1,
                cursor: passwordResetSent ? 'default' : 'pointer',
              }}
            >
              {passwordResetSent ? 'Sent ✓' : 'Change Password'}
            </button>
          </div>

          {/* Sessions */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Sessions
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: '16px' }}>🖥️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Current session
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  Active now
                </div>
              </div>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--success)',
                }}
              />
            </div>
          </div>
        </section>

        {/* ─── Section: Preferences ─────────────────────────────────────── */}
        <section
          style={{
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            marginBottom: 'var(--space-6)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-5)',
            }}
          >
            Preferences
          </h2>

          {/* Theme */}
          <div
            style={{
              marginBottom: 'var(--space-5)',
              paddingBottom: 'var(--space-5)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Theme
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              {(['dark', 'light', 'system'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTheme(opt)}
                  style={{
                    padding: 'var(--space-2) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${theme === opt ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                    background: theme === opt ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                    color: theme === opt ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textTransform: 'capitalize',
                  }}
                >
                  {opt === 'dark' ? '🌙' : opt === 'light' ? '☀️' : '💻'} {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Notification preferences */}
          <div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Notification Channels
            </div>
            {([
              { key: 'email' as const, label: 'Email notifications', icon: '📧' },
              { key: 'slack' as const, label: 'Slack notifications', icon: '💬' },
              { key: 'sms' as const, label: 'SMS notifications', icon: '📱' },
            ]).map(({ key, label, icon }) => (
              <label
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) 0',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="checkbox"
                  checked={notifPrefs[key]}
                  onChange={(e) =>
                    setNotifPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: 'var(--accent-primary)',
                    cursor: 'pointer',
                  }}
                />
                <span>{icon}</span>
                {label}
              </label>
            ))}
          </div>
        </section>

        {/* ─── Section: Danger Zone ─────────────────────────────────────── */}
        <section
          style={{
            background: 'var(--destructive-subtle)',
            border: '1px solid var(--destructive-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-6)',
            marginBottom: 'var(--space-10)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--destructive)',
              marginBottom: 'var(--space-3)',
            }}
          >
            Danger Zone
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-4)',
            }}
          >
            Once you delete your account, there is no going back. All your data will be permanently
            removed.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            style={{
              padding: 'var(--space-2) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              border: '1px solid var(--destructive)',
              color: 'var(--destructive)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--destructive)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--destructive)';
            }}
          >
            Delete Account
          </button>
        </section>
      </div>

      {/* ─── Delete Confirmation Modal ──────────────────────────────────── */}
      {showDeleteModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            animation: 'accountModalFadeIn 0.2s ease-out',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
        >
          <div
            style={{
              width: '420px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-8)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
            }}
          >
            <h3
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: 'var(--destructive)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Delete Account
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                marginBottom: 'var(--space-5)',
              }}
            >
              This action is <strong style={{ color: 'var(--text-primary)' }}>irreversible</strong>.
              All your data, transactions, and settings will be permanently deleted.
            </p>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-3)',
              }}
            >
              Type <strong style={{ color: 'var(--text-primary)' }}>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="input"
              style={{ marginBottom: 'var(--space-5)' }}
            />
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText('');
                }}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                style={{
                  padding: 'var(--space-2) var(--space-5)',
                  borderRadius: 'var(--radius-md)',
                  background: deleteConfirmText === 'DELETE' ? 'var(--destructive)' : 'var(--bg-elevated)',
                  color: deleteConfirmText === 'DELETE' ? '#fff' : 'var(--text-tertiary)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: deleteConfirmText === 'DELETE' && !deleting ? 'pointer' : 'not-allowed',
                  border: 'none',
                  opacity: deleting ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                {deleting ? '⏳ Deleting...' : 'Delete My Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes accountModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
