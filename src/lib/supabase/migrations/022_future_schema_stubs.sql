-- =============================================================================
-- 022_future_schema_stubs.sql — Documentation of planned features
-- =============================================================================
-- This migration originally documented architectural features that were
-- planned but not yet implemented. All features have now been implemented
-- in migrations 025-028.
--
-- No tables or functions are created by this migration. It serves as
-- historical documentation of the product roadmap's schema implications.
-- =============================================================================

-- ─── G2: Vendor/Customer Manager Model ─────────────────────────────────────
-- STATUS: ✅ IMPLEMENTED — migration 025_vendor_managers.sql
-- Service: src/lib/vendor-manager.ts
-- API: src/app/api/vendor-managers/route.ts
-- Integration: chase-agent.ts routes by vendor manager before card_holder

-- ─── G3: Approval Hierarchy ────────────────────────────────────────────────
-- STATUS: ✅ IMPLEMENTED — migration 026_approval_thresholds.sql
-- Service: src/lib/approval.ts
-- API: src/app/api/approvals/route.ts
-- Integration: transactions/[id]/route.ts gates status→approved

-- ─── G4: Per-User Channel Preferences ──────────────────────────────────────
-- STATUS: ✅ IMPLEMENTED — migration 027_user_channel_preferences.sql
-- Service: src/lib/user-channel-prefs.ts
-- API: src/app/api/user/preferences/route.ts
-- Integration: chase-agent.ts resolves user prefs before entity defaults

-- ─── G5/G6: OCR Pipeline & Receipt-Transaction Matching ───────────────────
-- STATUS: ✅ IMPLEMENTED — migration 028_receipt_ocr.sql
-- Extractor: src/lib/ocr/extractor.ts (OpenAI Vision GPT-4o)
-- Matcher: src/lib/ocr/matcher.ts (weighted scoring: vendor 40%, amount 35%, date 25%)
-- Cron: src/app/api/cron/ocr-process/route.ts
-- Integration: receipt upload auto-enqueues OCR processing

-- ─── G9: Email Channel Integration ─────────────────────────────────────────
-- STATUS: ✅ IMPLEMENTED — migration 027 adds 'email' to channel_type enum
-- Adapter: src/lib/channels/email.ts (Resend-based)
-- Integration: dispatcher.ts includes email case with priority order

-- ─── G10: Automated Month-End Close Notification ───────────────────────────
-- STATUS: ✅ IMPLEMENTED
-- Builders: src/lib/notifications/close-reminder.ts (Slack/SMS/email)
-- Cron: src/app/api/cron/close-reminder/route.ts
-- Integration: uses close-engine readiness score to determine severity

-- =============================================================================
-- End of future schema documentation — all features implemented
-- =============================================================================
