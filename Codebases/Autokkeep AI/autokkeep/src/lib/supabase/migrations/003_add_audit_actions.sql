-- Migration: Add 'revoke' and 'export' to audit_action enum
-- Date: 2026-05-30
-- Description: Extends the audit_action PostgreSQL enum to support
--   bank connection revocation events and data export actions.
-- Run this on existing databases. Safe to run multiple times (IF NOT EXISTS).

ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'revoke';
ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'export';
