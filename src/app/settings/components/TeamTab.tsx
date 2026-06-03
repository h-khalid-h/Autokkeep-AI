'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { SupabaseQueryClient } from '@/lib/supabase/query-client';
import { Card, Badge, Button, Input, Modal } from '@/components/ui';
import type { TeamMemberData } from '../types';
import CardSkeletonBlock from './CardSkeletonBlock';
import styles from '../page.module.css';

export default function TeamTab({
  loading: pageLoading,
  orgId,
  userId,
  userRole,
  teamMembers,
  plan,
  onRefresh,
  entities,
}: {
  loading: boolean;
  orgId: string;
  userId: string;
  userRole: string;
  teamMembers: TeamMemberData[];
  plan: string;
  onRefresh: () => void;
  entities: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('accountant');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [entityAssignments, setEntityAssignments] = useState<Record<string, string[]>>({});

  // Load entity assignments for all entities
  useEffect(() => {
    async function loadAssignments() {
      if (!entities || entities.length === 0) return;
      try {
        const supabase = createClient();
        const db = supabase as unknown as SupabaseQueryClient;
        const entityIds = entities.map(e => e.id);
        const { data } = await db
          .from('entity_assignments')
          .select('user_id, entity_id')
          .in('entity_id', entityIds);
        if (data) {
          const map: Record<string, string[]> = {};
          for (const row of data as { user_id: string; entity_id: string }[]) {
            if (!map[row.user_id]) map[row.user_id] = [];
            map[row.user_id].push(row.entity_id);
          }
          setEntityAssignments(map);
        }
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssignments();
  }, [entities, teamMembers]);

  const canManageTeam = userRole === 'owner' || userRole === 'admin';

  // Seat limit enforcement
  // Plan keys match DB values set by Stripe webhook via PLAN_DB_NAMES
  const PLAN_SEAT_LIMITS: Record<string, number> = {
    free: 3,
    starter: 3,
    smb_growth: 10,
    cpa_professional: Infinity,
    cpa_enterprise: Infinity,
  };
  const seatLimit = PLAN_SEAT_LIMITS[plan] ?? 3;
  const currentSeats = teamMembers.length;
  const isAtSeatLimit = currentSeats >= seatLimit;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !email) return;
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setActionError('Please enter a valid email address');
      return;
    }
    setInviteLoading(true);
    setActionError(null);

    // Enforce seat limit
    if (isAtSeatLimit) {
      setActionError(`Your plan allows up to ${seatLimit} seats. Upgrade to add more team members.`);
      setInviteLoading(false);
      return;
    }

    try {
      // Use the server-side API exclusively — it validates role, checks duplicates, enforces seat limits
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send invite');
      }

      setEmail('');
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const handleRemove = async (memberId: string) => {
    setRemoveLoading(memberId);
    setActionError(null);

    try {
      const supabase = createClient();
      const db = supabase as unknown as SupabaseQueryClient;
      const { error: deleteError } = await db
        .from('team_members')
        .delete()
        .eq('id', memberId)
        .eq('org_id', orgId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemoveLoading(null);
      setConfirmRemoveId(null);
    }
  };

  if (pageLoading) {
    return (
      <div className={styles.skeletonStack}>
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

      {/* Invite Form */}
      <Card>
        <h2 className={styles.sectionTitle}>Invite Team Member</h2>
        <form onSubmit={handleInvite} className={styles.inviteForm}>
          <div className={styles.inviteEmailField}>
            <Input
              label="Email"
              type="email"
              placeholder="colleague@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={!canManageTeam}
            />
          </div>
          <div className={styles.inviteRoleField}>
            <label htmlFor="invite-role" className={styles.fieldLabel}>Role</label>
            <select
              id="invite-role"
              className={styles.select}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!canManageTeam}
            >
              <option value="admin" className={styles.selectOption}>Admin</option>
              <option value="accountant" className={styles.selectOption}>Accountant</option>
              <option value="viewer" className={styles.selectOption}>Viewer</option>
            </select>
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={inviteLoading || !canManageTeam || isAtSeatLimit} isLoading={inviteLoading}>
            Invite
          </Button>
        </form>
        <p className={styles.inviteHint}>
          💡 {isAtSeatLimit
            ? `Seat limit reached (${currentSeats}/${seatLimit === Infinity ? '∞' : seatLimit}). Upgrade your plan to add more members.`
            : userRole === 'owner' || userRole === 'admin'
            ? `${currentSeats}/${seatLimit === Infinity ? '∞' : seatLimit} seats used. Seat limits vary by plan: Starter (3), Growth (10), Pro (unlimited).`
            : 'Contact your admin for seat availability.'}
        </p>
      </Card>

      {/* Team Members */}
      <Card>
        <h2 className={styles.sectionTitle}>Team Members</h2>
        <div className={styles.memberList}>
          {teamMembers.map((member) => {
            const isCurrentUser = member.user_id === userId;
            const isAccepted = !!member.accepted_at;
            const displayName = isCurrentUser
              ? 'You'
              : (member.user_email || member.invited_email || 'Unknown');
            const displayEmail = member.user_email || member.invited_email || '';

            return (
              <div key={member.id} className={styles.memberRow}>
                <div>
                  <div className={styles.memberName}>
                    {displayName}{isCurrentUser ? ` (${member.role})` : ''}
                  </div>
                  <div className={styles.memberEmail}>{displayEmail}</div>
                  <div className={styles.memberBadges}>
                    {(member.role === 'owner' || member.role === 'admin') ? (
                      <Badge variant="accent">All Entities</Badge>
                    ) : (
                      (entityAssignments[member.user_id || ''] || []).map(eid => {
                        const ent = entities.find(e => e.id === eid);
                        return ent ? (
                          <Badge key={eid} variant="default">{ent.name}</Badge>
                        ) : null;
                      })
                    )}
                  </div>
                </div>
                <div className={styles.memberActions}>
                  <Badge variant={isAccepted ? 'success' : 'warning'}>
                    {isAccepted ? member.role : 'Pending'}
                  </Badge>
                  {member.role !== 'owner' && !isCurrentUser && canManageTeam && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveId(member.id)}
                      disabled={removeLoading === member.id}
                      isLoading={removeLoading === member.id}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {teamMembers.length === 0 && (
            <div className={styles.emptyText}>No team members found.</div>
          )}
        </div>
      </Card>
      {/* Confirm Remove Modal */}
      <Modal
        isOpen={!!confirmRemoveId}
        onClose={() => setConfirmRemoveId(null)}
        title="Remove Team Member"
        size="sm"
        footer={
          <div className={styles.modalFooter}>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => confirmRemoveId && handleRemove(confirmRemoveId)}
              isLoading={!!removeLoading}
            >
              Remove
            </Button>
          </div>
        }
      >
        <p>Are you sure you want to remove this team member? They will lose access to this organization immediately.</p>
      </Modal>
    </div>
  );
}
