-- Migration: Add text processing fields and stages
-- Purpose: Support two-stage LLM text processing pipeline
-- Date: 2025-01-15

BEGIN;

-- Add new columns to papers table
ALTER TABLE papers
  ADD COLUMN IF NOT EXISTS processing_stage TEXT DEFAULT 'extracting',
  ADD COLUMN IF NOT EXISTS text_processing_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS text_processing_completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS text_processing_error TEXT,
  ADD COLUMN IF NOT EXISTS processed_text TEXT;

-- Add constraint for valid processing stages
ALTER TABLE papers
  DROP CONSTRAINT IF EXISTS processing_stage_check;

ALTER TABLE papers
  ADD CONSTRAINT processing_stage_check
  CHECK (processing_stage IN (
    'extracting',         -- PDF extraction in progress
    'text_processing',    -- LLM pipeline running (Stage 1 & 2)
    'text_completed',     -- LLM processing complete
    'tts_processing',     -- TTS generation in progress
    'completed',          -- All processing complete
    'failed'              -- Processing failed at any stage
  ));

-- Add index for filtering by processing stage
CREATE INDEX IF NOT EXISTS idx_papers_processing_stage
  ON papers(processing_stage);

-- Add index for filtering by completion times
CREATE INDEX IF NOT EXISTS idx_papers_text_processing_completed
  ON papers(text_processing_completed_at)
  WHERE text_processing_completed_at IS NOT NULL;

-- Update existing papers to new schema (if any exist)
-- Default to 'completed' for papers uploaded before this migration
UPDATE papers
SET processing_stage = 'completed'
WHERE processing_stage IS NULL;

-- Add section_title column to paper_chunks (for section-based chunking)
ALTER TABLE paper_chunks
  ADD COLUMN IF NOT EXISTS section_title TEXT;

-- Add index for filtering chunks by section
CREATE INDEX IF NOT EXISTS idx_chunks_section_title
  ON paper_chunks(section_title)
  WHERE section_title IS NOT NULL;

COMMIT;

-- Migration rollback instructions:
-- To roll back this migration, run:
--
-- BEGIN;
-- DROP INDEX IF EXISTS idx_chunks_section_title;
-- ALTER TABLE paper_chunks DROP COLUMN IF EXISTS section_title;
-- DROP INDEX IF EXISTS idx_papers_text_processing_completed;
-- DROP INDEX IF EXISTS idx_papers_processing_stage;
-- ALTER TABLE papers DROP CONSTRAINT IF EXISTS processing_stage_check;
-- ALTER TABLE papers
--   DROP COLUMN IF EXISTS processed_text,
--   DROP COLUMN IF EXISTS text_processing_error,
--   DROP COLUMN IF EXISTS text_processing_completed_at,
--   DROP COLUMN IF EXISTS text_processing_started_at,
--   DROP COLUMN IF EXISTS processing_stage;
-- COMMIT;
