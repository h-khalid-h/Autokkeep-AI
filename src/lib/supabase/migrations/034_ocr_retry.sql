-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 034: Add retry tracking to receipt_ocr_queue
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'receipt_ocr_queue' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE receipt_ocr_queue ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;
