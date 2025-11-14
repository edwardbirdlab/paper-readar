-- Migration: Fix audio_duration type from INTEGER to NUMERIC
-- This preserves decimal precision for audio durations

ALTER TABLE paper_chunks
  ALTER COLUMN audio_duration TYPE NUMERIC(10, 2);

COMMENT ON COLUMN paper_chunks.audio_duration IS 'Duration in seconds with decimal precision (e.g., 3.45 seconds)';
