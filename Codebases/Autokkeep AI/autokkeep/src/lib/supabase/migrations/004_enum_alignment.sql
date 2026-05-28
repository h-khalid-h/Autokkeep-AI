-- =============================================================================
-- Autokkeep — Enum Fix Migration (004)
-- =============================================================================
-- Aligns database enum types with the codebase after the production readiness
-- audit. This migration:
--   1. Adds 'escrow_suspense' to transaction_status (if not exists)
--   2. Adds 'failed' to receipt_status (if not exists)
--   3. Adds new subscription_plan values: 'free', 'starter', 'cpa_professional'
--
-- Safe to run multiple times (uses IF NOT EXISTS).
-- =============================================================================

-- 1. Add escrow_suspense and categorization_failed to transaction_status
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'escrow_suspense';
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'categorization_failed';

-- 2. Add 'failed' to receipt_status (for Twilio failed deliveries)
ALTER TYPE receipt_status ADD VALUE IF NOT EXISTS 'failed';

-- 3. Add new subscription_plan values to match plans.ts
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'starter';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'cpa_professional';
