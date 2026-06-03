'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient as getSupabase } from '@/lib/supabase/client';
import { useTheme } from '@/components/providers/ThemeProvider';
import AppShell from '@/components/layout/AppShell';
import { Card, Button, Input, Modal, Toggle, Skeleton, useToast } from '@/components/ui';
import styles from './page.module.css';


interface UserProfile {
  email: string;
  fullName: string;
  initials: string;
  memberSince: string;
}

export default function AccountPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Theme from provider
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  // Notification preferences — persisted to localStorage
  const [notifPrefs, setNotifPrefsRaw] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('autokkeep-notif-prefs') : null;
      if (saved) return JSON.parse(saved);
    } catch {}
    return { email: true, slack: false, sms: false };
  });

  const setNotifPrefs: React.Dispatch<React.SetStateAction<{ email: boolean; slack: boolean; sms: boolean }>> = useCallback(
    (action: React.SetStateAction<{ email: boolean; slack: boolean; sms: boolean }>) => {
      setNotifPrefsRaw((prev: { email: boolean; slack: boolean; sms: boolean }) => {
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
          setError('Unable to load your profile. Please sign in again.');
        }
      } catch {
        setError('Unable to connect to the server. Please try again later.');
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (resetError) {
        toast.error(`Password reset failed: ${resetError.message}`);
        return;
      }
      setPasswordResetSent(true);
      toast.success('Password reset email sent! Check your inbox.');
      setTimeout(() => setPasswordResetSent(false), 5000);
    } catch (err) {
      toast.error(`Password reset failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [user, toast]);

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
    } catch (err) {
      setDeleting(false);
      toast.error(`Account deletion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [deleteConfirmText, toast]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <AppShell>
        <div className={styles.loadingPage}>
          <div className={styles.loadingCenter}>
            <Skeleton variant="rect" width={48} height={48} />
            <p className={styles.loadingText}>Loading account...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className={styles.errorPage}>
          <div className={styles.errorCenter}>
            <div className={styles.errorIcon}>⚠️</div>
            <h2 className={styles.errorTitle}>Unable to Load Account</h2>
            <p className={styles.errorMsg}>
              {error || 'Please sign in to view your account settings.'}
            </p>
            <Button as={Link} href="/auth/login">
              Sign In
            </Button>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className={styles.page}>
        <h1 className={styles.pageTitle}>Account Settings</h1>

        {/* ─── Section: Profile ─── */}
        <Card>
          <h2 className={styles.sectionTitle}>Profile</h2>
          <div className={styles.profileRow}>
            <div className={styles.avatar}>{user.initials}</div>
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{user.fullName}</div>
              <div className={styles.profileEmail}>{user.email}</div>
              <div className={styles.profileSince}>
                Member since {formatDate(user.memberSince)}
              </div>
            </div>
          </div>
        </Card>

        {/* ─── Section: Security ─── */}
        <Card>
          <h2 className={styles.sectionTitle}>Security</h2>

          {/* Change password */}
          <div className={styles.securityRow}>
            <div>
              <div className={styles.securityLabel}>Password</div>
              <div className={styles.securityHint}>
                {passwordResetSent
                  ? '✅ Password reset email sent!'
                  : 'Send a password reset link to your email'}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePasswordReset}
              disabled={passwordResetSent}
            >
              {passwordResetSent ? 'Sent ✓' : 'Change Password'}
            </Button>
          </div>

          {/* Sessions */}
          <div>
            <div className={styles.securityLabel}>Sessions</div>
            <div className={styles.sessionRow}>
              <span className={styles.sessionIcon}>🖥️</span>
              <div className={styles.sessionInfo}>
                <div className={styles.sessionLabel}>Current session</div>
                <div className={styles.sessionStatus}>Active now</div>
              </div>
              <span className={styles.sessionDot} />
            </div>
          </div>
        </Card>

        {/* ─── Section: Preferences ─── */}
        <Card>
          <h2 className={styles.sectionTitle}>Preferences</h2>

          {/* Theme */}
          <div className={styles.prefsGroup}>
            <div className={styles.prefsLabel}>Theme</div>
            <div className={styles.themeOptions}>
              {(['dark', 'light', 'system'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setTheme(opt)}
                  className={theme === opt ? styles.themeBtnActive : styles.themeBtn}
                >
                  {opt === 'dark' ? '🌙' : opt === 'light' ? '☀️' : '💻'} {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Notification preferences */}
          <div>
            <div className={styles.prefsLabel}>Notification Channels</div>
            <div className={styles.notifList}>
              {([
                { key: 'email' as const, label: '📧 Email notifications' },
                { key: 'slack' as const, label: '💬 Slack notifications' },
                { key: 'sms' as const, label: '📱 SMS notifications' },
              ]).map(({ key, label }) => (
                <Toggle
                  key={key}
                  checked={notifPrefs[key]}
                  onChange={(checked) =>
                    setNotifPrefs((prev) => ({ ...prev, [key]: checked }))
                  }
                  label={label}
                />
              ))}
            </div>
            <p className={styles.notifDisclaimer}>
              ℹ️ These preferences are saved to this browser only.
            </p>
          </div>
        </Card>

        {/* ─── Section: Danger Zone ─── */}
        <Card className={styles.dangerCard}>
          <h2 className={styles.dangerTitle}>Danger Zone</h2>
          <p className={styles.dangerDesc}>
            Once you delete your account, there is no going back. All your data will be permanently
            removed.
          </p>
          <Button
            variant="destructive"
            onClick={() => setShowDeleteModal(true)}
          >
            Delete Account
          </Button>
        </Card>
      </div>

      {/* ─── Delete Confirmation Modal ─── */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        title="Delete Account"
        size="sm"
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              isLoading={deleting}
            >
              Delete My Account
            </Button>
          </div>
        }
      >
        <p className={styles.modalText}>
          This action is <strong className={styles.modalStrong}>irreversible</strong>.
          All your data, transactions, and settings will be permanently deleted.
        </p>
        <p className={styles.modalPrompt}>
          Type <strong className={styles.modalStrong}>DELETE</strong> to confirm:
        </p>
        <Input
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          placeholder="DELETE"
          className={styles.confirmInput}
        />
      </Modal>
    </AppShell>
  );
}
