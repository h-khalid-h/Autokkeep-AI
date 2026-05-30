-- =============================================================================
-- 007_citation_engine.sql — Citation & Workpaper Engine
-- =============================================================================
-- Adds structured citation fields for SOC 2 audit trails.
-- Every AI-processed transaction gets a verifiable citation record.
-- =============================================================================

-- 1. Add citation fields to audit_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'source_hash'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN source_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_log' AND column_name = 'citation_token'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN citation_token text;
  END IF;
END $$;

-- 2. Add confidence breakdown to categorization_history
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'confidence_breakdown'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN confidence_breakdown jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'source_hash'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN source_hash text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'categorization_history' AND column_name = 'citation_token'
  ) THEN
    ALTER TABLE categorization_history ADD COLUMN citation_token text;
  END IF;
END $$;

-- 3. Create document_anchors table for SHA-256 document registry
CREATE TABLE IF NOT EXISTS document_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  document_type text NOT NULL DEFAULT 'transaction',
  source_hash text NOT NULL,
  citation_token text NOT NULL,
  raw_metadata jsonb DEFAULT '{}',
  verified_at timestamptz,
  verified_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_anchors_hash ON document_anchors(source_hash);
CREATE INDEX IF NOT EXISTS idx_document_anchors_entity ON document_anchors(entity_id);
CREATE INDEX IF NOT EXISTS idx_document_anchors_citation ON document_anchors(citation_token);

-- 4. Add is_adjustment flag to journal_entries for period locking exception
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_entries' AND column_name = 'is_adjustment'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN is_adjustment boolean DEFAULT false;
  END IF;
END $$;
