-- =============================================================================
-- 021_chase_state_extensions.sql — Extend receipt chase state machine
-- =============================================================================
-- Adds 'unresolved' and 'closed_no_receipt' values to the receipt_status
-- enum, enabling the chase agent to explicitly mark transactions where:
--   - No card_holder could be resolved to a reachable person ('unresolved')
--   - The chase cycle completed without a receipt ('closed_no_receipt')
--
-- Previously, these states were implicit (row absence = never chased,
-- max attempts reached = silently stopped).
-- =============================================================================

ALTER TYPE receipt_status ADD VALUE IF NOT EXISTS 'unresolved';
ALTER TYPE receipt_status ADD VALUE IF NOT EXISTS 'closed_no_receipt';
