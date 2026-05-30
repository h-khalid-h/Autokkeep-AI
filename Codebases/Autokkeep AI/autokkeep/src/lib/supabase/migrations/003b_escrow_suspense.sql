-- =============================================================================
-- 003_escrow_suspense.sql — Add escrow_suspense transaction status
-- =============================================================================

-- Add escrow_suspense to transaction_status enum
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'escrow_suspense' AFTER 'human_review';
