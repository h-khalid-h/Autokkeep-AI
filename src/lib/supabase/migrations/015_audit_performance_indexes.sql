-- ============================================
-- Migration 015: Additional Performance Indexes
-- ============================================
-- Adds indexes identified during production audit.
--
-- Run in Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================

-- Organizations: Stripe webhook lookups by customer ID
-- Used by webhooks/stripe/route.ts for checkout.session.completed,
-- customer.subscription.updated, and customer.subscription.deleted
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Receipt Requests: Twilio webhook lookups by message_id
-- Used by webhooks/twilio/route.ts to match incoming SMS to receipt requests
CREATE INDEX IF NOT EXISTS idx_receipt_requests_message_id
  ON receipt_requests (message_id)
  WHERE message_id IS NOT NULL;

-- Transactions: Admin stats filter by created_at time ranges
-- The existing idx_transactions_entity_created covers entity-scoped queries,
-- but admin stats query across all entities by created_at
CREATE INDEX IF NOT EXISTS idx_transactions_created_at
  ON transactions (created_at DESC);

-- Bank Connections: Plaid webhook lookups by item_id
-- Used by webhooks/plaid/route.ts to find the connection for an incoming webhook
CREATE INDEX IF NOT EXISTS idx_bank_connections_plaid_item_id
  ON bank_connections (plaid_item_id)
  WHERE plaid_item_id IS NOT NULL;
