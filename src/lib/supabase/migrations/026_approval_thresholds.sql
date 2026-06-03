-- =============================================================================
-- 026: Approval Hierarchy (G3)
-- =============================================================================
-- Threshold-based approval for large transactions. Transactions above a
-- configured amount require explicit approval from users of sufficient role
-- before moving from human_review → approved.

CREATE TABLE approval_thresholds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  min_amount            decimal(15,2) NOT NULL,
  required_role         team_role NOT NULL DEFAULT 'admin',
  requires_dual_approval boolean DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  UNIQUE(entity_id, min_amount)
);

ALTER TABLE approval_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity-scoped thresholds"
  ON approval_thresholds FOR ALL
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

CREATE TABLE approval_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transaction_id    uuid NOT NULL REFERENCES transactions(id),
  threshold_id      uuid REFERENCES approval_thresholds(id),
  requested_role    team_role NOT NULL,
  approver_user_id  uuid,
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_at        timestamptz,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity-scoped approvals"
  ON approval_requests FOR ALL
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

CREATE INDEX idx_approval_requests_pending
  ON approval_requests (entity_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_approval_requests_txn
  ON approval_requests (transaction_id);
