-- Scientific Paper Reader v2.0 - Local Stack Database Schema
-- PostgreSQL schema without Supabase auth dependencies

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- Papers table: stores metadata and content for each scientific paper
CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  authors TEXT DEFAULT '',
  abstract TEXT,
  publication_date DATE,
  doi TEXT,
  pdf_file_path TEXT NOT NULL,
  total_pages INTEGER,
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  reading_progress FLOAT DEFAULT 0,
  reading_status TEXT DEFAULT 'unread' CHECK (reading_status IN ('unread', 'reading', 'completed')),
  tts_status TEXT DEFAULT 'pending' CHECK (tts_status IN ('pending', 'processing', 'completed', 'failed')),
  tts_started_at TIMESTAMP WITH TIME ZONE,
  tts_completed_at TIMESTAMP WITH TIME ZONE,
  upload_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Paper chunks: text segments for TTS processing
CREATE TABLE IF NOT EXISTS paper_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_type TEXT DEFAULT 'paragraph' CHECK (chunk_type IN ('abstract', 'section', 'paragraph')),
  section_title TEXT,
  text_content TEXT NOT NULL,
  start_page INTEGER,
  end_page INTEGER,
  word_count INTEGER,
  char_count INTEGER,
  audio_file_path TEXT,
  audio_duration INTEGER, -- Duration in seconds
  tts_status TEXT DEFAULT 'pending' CHECK (tts_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_paper_chunk UNIQUE (paper_id, chunk_index)
);

-- Tags: organize papers with custom tags
CREATE TABLE IF NOT EXISTS tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Paper tags: many-to-many relationship between papers and tags
CREATE TABLE IF NOT EXISTS paper_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_paper_tag UNIQUE (paper_id, tag_id)
);

-- Highlights: text selections in papers
CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  position_data JSONB NOT NULL,
  highlighted_text TEXT NOT NULL,
  color TEXT DEFAULT '#ffeb3b',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notes: text or voice notes attached to papers
CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES paper_chunks(id) ON DELETE SET NULL,
  highlight_id UUID REFERENCES highlights(id) ON DELETE SET NULL,
  note_type TEXT NOT NULL CHECK (note_type IN ('text', 'voice')),
  content TEXT,
  voice_file_path TEXT,
  position_data JSONB,
  context_text TEXT,
  duration INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audio sessions: track TTS playback sessions
CREATE TABLE IF NOT EXISTS audio_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  chunk_id UUID REFERENCES paper_chunks(id) ON DELETE SET NULL,
  playback_rate FLOAT DEFAULT 1.0,
  volume FLOAT DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reading history: track reading sessions and positions
CREATE TABLE IF NOT EXISTS reading_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  scroll_position FLOAT DEFAULT 0,
  character_position INTEGER DEFAULT 0,
  session_duration INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(reading_status);
CREATE INDEX IF NOT EXISTS idx_papers_tts_status ON papers(tts_status);
CREATE INDEX IF NOT EXISTS idx_papers_upload_date ON papers(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_paper_chunks_paper ON paper_chunks(paper_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_paper_chunks_status ON paper_chunks(paper_id, tts_status);
CREATE INDEX IF NOT EXISTS idx_highlights_paper ON highlights(paper_id);
CREATE INDEX IF NOT EXISTS idx_notes_paper ON notes(paper_id);
CREATE INDEX IF NOT EXISTS idx_audio_sessions_paper ON audio_sessions(paper_id);
CREATE INDEX IF NOT EXISTS idx_reading_history_paper ON reading_history(paper_id);

-- Create full-text search index
CREATE INDEX IF NOT EXISTS papers_search_idx ON papers USING GIN (
  to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(authors, '') || ' ' || COALESCE(abstract, ''))
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
DROP TRIGGER IF EXISTS update_papers_updated_at ON papers;
CREATE TRIGGER update_papers_updated_at BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_paper_chunks_updated_at ON paper_chunks;
CREATE TRIGGER update_paper_chunks_updated_at BEFORE UPDATE ON paper_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_highlights_updated_at ON highlights;
CREATE TRIGGER update_highlights_updated_at BEFORE UPDATE ON highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notes_updated_at ON notes;
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_audio_sessions_updated_at ON audio_sessions;
CREATE TRIGGER update_audio_sessions_updated_at BEFORE UPDATE ON audio_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
