'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AppShell from '@/components/layout/AppShell';
import { Card, Badge, Button, Skeleton } from '@/components/ui';
import { useDataFetcher } from '@/hooks/useDataFetcher';
import styles from './team.module.css';

// ─── Types ──────────────────────────────────────────────────────────────────────

type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
type MemberStatus = 'active' | 'invited' | 'suspended';

interface TeamMember {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: TeamRole;
  status: MemberStatus;
  invitedBy: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
}

interface TeamStats {
  total: number;
  owners: number;
  admins: number;
  members: number;
  viewers: number;
  active: number;
  invited: number;
  suspended: number;
}

// ─── Role Config ────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<TeamRole, { label: string; icon: string; className: string }> = {
  owner: { label: 'Owner', icon: '👑', className: 'roleOwner' },
  admin: { label: 'Admin', icon: '🛡️', className: 'roleAdmin' },
  member: { label: 'Member', icon: '👤', className: 'roleMember' },
  viewer: { label: 'Viewer', icon: '👁️', className: 'roleViewer' },
};

const INVITE_ROLES: { value: 'admin' | 'member' | 'viewer'; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

// ─── Main Component ─────────────────────────────────────────────────────────────

function TeamManagementPage() {
  // Data fetching via hook
  const { data: teamData, isLoading, error: fetchError, refetch } = useDataFetcher(
    { members: [] as TeamMember[], stats: null as TeamStats | null },
    async (signal) => {
      const res = await fetch('/api/team', { signal });
      if (!res.ok) throw new Error('Failed to fetch team data');
      const data = await res.json();
      return { members: (data.members || []) as TeamMember[], stats: (data.stats || null) as TeamStats | null };
    },
  );
  const members = teamData.members;
  const stats = teamData.stats;

  // Separate error state for mutations
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Invite form state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Actions state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'role' | 'remove';
    memberId: string;
    memberName: string;
    newRole?: TeamRole;
  } | null>(null);

  // Auto-dismiss success messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Close menu on outside click
  useEffect(() => {
    if (openMenuId) {
      const handler = () => setOpenMenuId(null);
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [openMenuId]);

  // ─── Invite Handler ────────────────────────────────────────────────────────

  const handleInvite = useCallback(async () => {
    if (!inviteEmail.trim()) return;
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invite');
      }

      setSuccessMessage(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteForm(false);
      void refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setIsSubmitting(false);
    }
  }, [inviteEmail, inviteRole, refetch]);

  // ─── Role Change Handler ───────────────────────────────────────────────────

  const handleRoleChange = useCallback(async (memberId: string, newRole: TeamRole) => {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update role');
      }

      setSuccessMessage('Role updated successfully');
      setConfirmAction(null);
      void refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
      setConfirmAction(null);
    }
  }, [refetch]);

  // ─── Remove Handler ────────────────────────────────────────────────────────

  const handleRemove = useCallback(async (memberId: string) => {
    try {
      const res = await fetch(`/api/team/${memberId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }

      setSuccessMessage('Member removed successfully');
      setConfirmAction(null);
      void refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
      setConfirmAction(null);
    }
  }, [refetch]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const getInitials = (member: TeamMember): string => {
    if (member.displayName) {
      return member.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2);
    }
    return member.email.slice(0, 2);
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'invited');

  // ─── Loading State ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell>
        <div className={styles.pageContainer}>
          <div className={styles.pageHeader}>
            <Link href="/settings" className={styles.backLink} aria-label="Back to Settings">←</Link>
            <div className={styles.headerContent}>
              <h1 className={styles.pageTitle}>Team Management</h1>
              <p className={styles.pageSubtitle}>Manage your team members and invitations</p>
            </div>
          </div>
          <div className={styles.skeletonStack}>
            <div className={styles.statsBar}>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rect" height={80} />
              ))}
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rect" height={64} />
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
            <h1 className={styles.pageTitle}>Team Management</h1>
            <p className={styles.pageSubtitle}>
              Manage team members, roles, and invitations
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowInviteForm(!showInviteForm)}
            id="invite-member-btn"
          >
            {showInviteForm ? 'Cancel' : '+ Invite Member'}
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

        {/* Stats Bar */}
        {stats && (
          <div className={styles.statsBar}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.total}</span>
              <span className={styles.statLabel}>Total</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.admins + stats.owners}</span>
              <span className={styles.statLabel}>Admins</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.active}</span>
              <span className={styles.statLabel}>Active</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.invited}</span>
              <span className={styles.statLabel}>Pending</span>
            </div>
          </div>
        )}

        {/* Invite Form */}
        {showInviteForm && (
          <Card padding="lg">
            <div className={styles.inviteSection}>
              <h2 className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>✉️</span> Invite Team Member
              </h2>
              <div className={styles.inviteForm}>
                <div className={styles.inviteRow}>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel} htmlFor="invite-email">Email Address</label>
                    <input
                      id="invite-email"
                      type="email"
                      className={styles.formInput}
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={isSubmitting}
                      autoComplete="email"
                    />
                  </div>
                  <div className={styles.formRow}>
                    <label className={styles.formLabel} htmlFor="invite-role">Role</label>
                    <select
                      id="invite-role"
                      className={styles.formSelect}
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member' | 'viewer')}
                      disabled={isSubmitting}
                    >
                      {INVITE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleInvite}
                    disabled={isSubmitting || !inviteEmail.trim()}
                    id="send-invite-btn"
                  >
                    {isSubmitting ? 'Sending…' : 'Send Invite'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowInviteForm(false)}
                    id="cancel-invite-btn"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Pending Invites */}
        {pendingMembers.length > 0 && (
          <div className={styles.pendingSection}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>⏳</span> Pending Invites ({pendingMembers.length})
            </h2>
            <div className={styles.pendingList}>
              {pendingMembers.map((member) => (
                <div key={member.id} className={styles.pendingCard}>
                  <div className={styles.pendingInfo}>
                    <span className={styles.pendingEmail}>{member.email}</span>
                    <span className={styles.pendingMeta}>
                      Invited as {member.role} • {formatDate(member.joinedAt)}
                    </span>
                  </div>
                  <Badge variant="warning">Pending</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active Members */}
        <div className={styles.membersSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>👥</span> Team Members ({activeMembers.length})
          </h2>

          {activeMembers.length === 0 ? (
            <div className={styles.emptyText}>
              <span className={styles.emptyIcon}>👥</span>
              <p>No active team members found.</p>
            </div>
          ) : (
            <div className={styles.membersList}>
              {activeMembers.map((member) => {
                const roleConfig = ROLE_CONFIG[member.role];
                return (
                  <div key={member.id} className={styles.memberRow}>
                    {/* Avatar */}
                    <div className={styles.memberAvatar}>
                      {getInitials(member)}
                    </div>

                    {/* Info */}
                    <div className={styles.memberInfo}>
                      <span className={styles.memberName}>
                        {member.displayName || member.email.split('@')[0]}
                      </span>
                      <span className={styles.memberEmail}>{member.email}</span>
                    </div>

                    {/* Meta */}
                    <div className={styles.memberMeta}>
                      <span className={styles[roleConfig.className as keyof typeof styles]}>
                        {roleConfig.icon} {roleConfig.label}
                      </span>

                      <span className={styles.memberLastActive}>
                        {member.lastActiveAt ? formatDate(member.lastActiveAt) : '—'}
                      </span>

                      {/* Actions */}
                      {member.role !== 'owner' && (
                        <div className={styles.actionsDropdown}>
                          <button
                            className={styles.actionsTrigger}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === member.userId ? null : member.userId);
                            }}
                            aria-label={`Actions for ${member.email}`}
                            id={`actions-${member.userId}`}
                          >
                            ⋮
                          </button>

                          {openMenuId === member.userId && (
                            <div className={styles.actionsMenu} onClick={(e) => e.stopPropagation()}>
                              {member.role !== 'admin' && (
                                <button
                                  className={styles.actionButton}
                                  onClick={() => {
                                    setConfirmAction({
                                      type: 'role',
                                      memberId: member.userId,
                                      memberName: member.displayName || member.email,
                                      newRole: 'admin',
                                    });
                                    setOpenMenuId(null);
                                  }}
                                >
                                  🛡️ Make Admin
                                </button>
                              )}
                              {member.role !== 'member' && (
                                <button
                                  className={styles.actionButton}
                                  onClick={() => {
                                    setConfirmAction({
                                      type: 'role',
                                      memberId: member.userId,
                                      memberName: member.displayName || member.email,
                                      newRole: 'member',
                                    });
                                    setOpenMenuId(null);
                                  }}
                                >
                                  👤 Make Member
                                </button>
                              )}
                              {member.role !== 'viewer' && (
                                <button
                                  className={styles.actionButton}
                                  onClick={() => {
                                    setConfirmAction({
                                      type: 'role',
                                      memberId: member.userId,
                                      memberName: member.displayName || member.email,
                                      newRole: 'viewer',
                                    });
                                    setOpenMenuId(null);
                                  }}
                                >
                                  👁️ Make Viewer
                                </button>
                              )}
                              <button
                                className={styles.actionButtonDanger}
                                onClick={() => {
                                  setConfirmAction({
                                    type: 'remove',
                                    memberId: member.userId,
                                    memberName: member.displayName || member.email,
                                  });
                                  setOpenMenuId(null);
                                }}
                              >
                                🗑️ Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Confirmation Dialog */}
        {confirmAction && (
          <div className={styles.confirmOverlay} onClick={() => setConfirmAction(null)}>
            <div className={styles.confirmContent} onClick={(e) => e.stopPropagation()}>
              {confirmAction.type === 'role' ? (
                <>
                  <h3 className={styles.confirmTitle}>Change Role</h3>
                  <p className={styles.confirmDescription}>
                    Are you sure you want to change <strong>{confirmAction.memberName}</strong>&apos;s
                    role to <strong>{confirmAction.newRole}</strong>?
                  </p>
                  <div className={styles.confirmActions}>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRoleChange(confirmAction.memberId, confirmAction.newRole!)}
                      id="confirm-role-change-btn"
                    >
                      Confirm
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={styles.confirmTitle}>Remove Member</h3>
                  <p className={styles.confirmDescription}>
                    Are you sure you want to remove <strong>{confirmAction.memberName}</strong> from
                    the team? This action can be undone by re-inviting them.
                  </p>
                  <div className={styles.confirmActions}>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(confirmAction.memberId)}
                      id="confirm-remove-btn"
                    >
                      Remove
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Export with ErrorBoundary ───────────────────────────────────────────────────

export default function TeamSettingsPage() {
  return (
    <ErrorBoundary>
      <TeamManagementPage />
    </ErrorBoundary>
  );
}
