-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For full-text search

-- Papers table: stores metadata and content for each scientific paper
CREATE TABLE papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  authors TEXT[] DEFAULT '{}',
  publication_date DATE,
  journal TEXT,
  doi TEXT,
  pdf_url TEXT NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  extracted_text TEXT, -- Raw extracted text
  reading_text TEXT, -- Cleaned text for TTS (citations removed)
  page_count INTEGER,
  file_size BIGINT,
  reading_status TEXT DEFAULT 'unread' CHECK (reading_status IN ('unread', 'reading', 'completed')),
  reading_progress FLOAT DEFAULT 0, -- Progress percentage
  metadata JSONB DEFAULT '{}', -- Additional metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index for full-text search
CREATE INDEX papers_search_idx ON papers USING GIN (
  to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(extracted_text, ''))
);

-- Tags table: organize papers with custom tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT unique_user_tag UNIQUE (user_id, name)
);

-- Paper tags: many-to-many relationship between papers and tags
CREATE TABLE paper_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_paper FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  CONSTRAINT unique_paper_tag UNIQUE (paper_id, tag_id)
);

-- Highlights: text selections in papers
CREATE TABLE highlights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL,
  user_id UUID NOT NULL,
  page_number INTEGER NOT NULL,
  position_data JSONB NOT NULL, -- Stores coordinates, text position
  highlighted_text TEXT NOT NULL,
  color TEXT DEFAULT '#ffeb3b',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_paper FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Notes: text or voice notes attached to papers or highlights
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL,
  user_id UUID NOT NULL,
  highlight_id UUID, -- Optional: link to specific highlight
  note_type TEXT NOT NULL CHECK (note_type IN ('text', 'voice')),
  content TEXT, -- For text notes
  audio_url TEXT, -- For voice notes
  audio_storage_path TEXT, -- Storage path for voice files
  position_data JSONB, -- Page number, reading position when note was created
  context_text TEXT, -- Text being read when note was created
  duration INTEGER, -- Duration in seconds for voice notes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_paper FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_highlight FOREIGN KEY (highlight_id) REFERENCES highlights(id) ON DELETE SET NULL
);

-- Audio sessions: track TTS playback sessions
CREATE TABLE audio_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL,
  user_id UUID NOT NULL,
  audio_url TEXT, -- URL to pre-processed audio file (if using that mode)
  audio_storage_path TEXT,
  position INTEGER DEFAULT 0, -- Current position in text (character offset)
  duration INTEGER, -- Total duration in seconds
  playback_rate FLOAT DEFAULT 1.0,
  voice_settings JSONB DEFAULT '{}', -- TTS voice configuration used
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_paper FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Reading history: track reading sessions and positions
CREATE TABLE reading_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id UUID NOT NULL,
  user_id UUID NOT NULL,
  page_number INTEGER NOT NULL,
  scroll_position FLOAT DEFAULT 0,
  character_position INTEGER DEFAULT 0, -- For TTS sync
  session_duration INTEGER DEFAULT 0, -- Time spent in seconds
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_paper FOREIGN KEY (paper_id) REFERENCES papers(id) ON DELETE CASCADE,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_papers_user ON papers(user_id);
CREATE INDEX idx_papers_status ON papers(user_id, reading_status);
CREATE INDEX idx_tags_user ON tags(user_id);
CREATE INDEX idx_highlights_paper ON highlights(paper_id);
CREATE INDEX idx_notes_paper ON notes(paper_id);
CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_audio_sessions_paper ON audio_sessions(paper_id);
CREATE INDEX idx_reading_history_paper ON reading_history(paper_id, user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to auto-update updated_at
CREATE TRIGGER update_papers_updated_at BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_highlights_updated_at BEFORE UPDATE ON highlights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audio_sessions_updated_at BEFORE UPDATE ON audio_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;

-- Papers policies
CREATE POLICY "Users can view their own papers"
  ON papers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own papers"
  ON papers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own papers"
  ON papers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own papers"
  ON papers FOR DELETE
  USING (auth.uid() = user_id);

-- Tags policies
CREATE POLICY "Users can view their own tags"
  ON tags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tags"
  ON tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags"
  ON tags FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags"
  ON tags FOR DELETE
  USING (auth.uid() = user_id);

-- Paper tags policies
CREATE POLICY "Users can manage paper tags for their papers"
  ON paper_tags FOR ALL
  USING (EXISTS (
    SELECT 1 FROM papers WHERE papers.id = paper_tags.paper_id AND papers.user_id = auth.uid()
  ));

-- Highlights policies
CREATE POLICY "Users can manage their own highlights"
  ON highlights FOR ALL
  USING (auth.uid() = user_id);

-- Notes policies
CREATE POLICY "Users can manage their own notes"
  ON notes FOR ALL
  USING (auth.uid() = user_id);

-- Audio sessions policies
CREATE POLICY "Users can manage their own audio sessions"
  ON audio_sessions FOR ALL
  USING (auth.uid() = user_id);

-- Reading history policies
CREATE POLICY "Users can manage their own reading history"
  ON reading_history FOR ALL
  USING (auth.uid() = user_id);

-- Storage buckets setup (run these in Supabase dashboard)
-- 1. Create bucket 'papers' for PDF storage
-- 2. Create bucket 'voice-notes' for audio recordings
-- 3. Create bucket 'tts-audio' for pre-processed TTS audio

-- Storage policies would be:
-- Bucket: papers
--   SELECT: authenticated users can read their own files
--   INSERT: authenticated users can upload
--   UPDATE: authenticated users can update their own files
--   DELETE: authenticated users can delete their own files
