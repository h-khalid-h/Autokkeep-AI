-- =============================================================================
-- 028: Receipt OCR Queue (G5/G6)
-- =============================================================================
-- Processing queue for receipt image extraction and auto-matching against
-- transactions. Uses OpenAI Vision (GPT-4o) for OCR extraction.

CREATE TABLE IF NOT EXISTS receipt_ocr_queue (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id               uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transaction_id          uuid REFERENCES transactions(id),
  file_url                text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'matched')),
  extracted_data          jsonb,
  match_confidence        numeric(5,4),
  matched_transaction_id  uuid REFERENCES transactions(id),
  error_message           text,
  processed_at            timestamptz,
  created_at              timestamptz DEFAULT now()
);

ALTER TABLE receipt_ocr_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Entity-scoped OCR queue"
  ON receipt_ocr_queue FOR ALL
  USING (entity_id IN (SELECT public.auth_user_entity_ids()));

-- Index for cron job to efficiently pick up pending items
CREATE INDEX idx_ocr_queue_pending
  ON receipt_ocr_queue (status, created_at)
  WHERE status = 'pending';

-- Index for looking up OCR results by transaction
CREATE INDEX idx_ocr_queue_txn
  ON receipt_ocr_queue (transaction_id)
  WHERE transaction_id IS NOT NULL;
