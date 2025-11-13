/**
 * Database Type Definitions
 * Updated to match database/schema.sql v2.0 (local PostgreSQL stack)
 *
 * IMPORTANT: These types must stay in sync with database/schema.sql
 * Any schema changes must be reflected here.
 */

export type ReadingStatus = 'unread' | 'reading' | 'completed';
export type NoteType = 'text' | 'voice';
export type TTSStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Papers table
 * Stores scientific paper metadata and content
 */
export interface Paper {
  id: string;
  title: string;
  authors: string; // Note: STRING, not array (changed from Supabase v1)
  abstract: string | null;
  publication_date: string | null;
  doi: string | null;
  pdf_file_path: string;
  total_pages: number | null;
  extracted_text: string | null;
  metadata: Record<string, any>;
  reading_progress: number;
  reading_status: ReadingStatus;
  tts_status: TTSStatus;
  tts_error: string | null;
  tts_started_at: string | null;
  tts_completed_at: string | null;
  upload_date: string;
  last_accessed: string;
  created_at: string;
  updated_at: string;
}

/**
 * Paper chunks table
 * Text segments for TTS processing
 */
export interface PaperChunk {
  id: string;
  paper_id: string;
  chunk_index: number;
  chunk_type: 'abstract' | 'section' | 'paragraph';
  section_title: string | null;
  text_content: string;
  start_page: number | null;
  end_page: number | null;
  word_count: number | null;
  char_count: number | null;
  audio_file_path: string | null;
  audio_duration: number | null;
  tts_status: TTSStatus;
  tts_error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Tags table
 * Custom tags for organizing papers
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

/**
 * Paper tags table
 * Many-to-many relationship between papers and tags
 */
export interface PaperTag {
  id: string;
  paper_id: string;
  tag_id: string;
  created_at: string;
}

/**
 * Highlights table
 * Text selections and highlights in papers
 */
export interface Highlight {
  id: string;
  paper_id: string;
  page_number: number;
  position_data: Record<string, any>; // JSONB - flexible structure
  highlighted_text: string;
  color: string;
  created_at: string;
  updated_at: string;
}

/**
 * Notes table
 * Text or voice notes attached to papers
 */
export interface Note {
  id: string;
  paper_id: string;
  chunk_id: string | null;
  highlight_id: string | null;
  note_type: NoteType;
  content: string | null;
  voice_file_path: string | null;
  position_data: {
    page_number?: number;
    time_position?: number;
    character_position?: number;
    scroll_position?: number;
  } | null;
  context_text: string | null;
  voice_duration: number | null; // Duration in seconds
  created_at: string;
  updated_at: string;
}

/**
 * Audio sessions table
 * Track TTS playback sessions
 */
export interface AudioSession {
  id: string;
  paper_id: string;
  position: number;
  chunk_id: string | null;
  playback_rate: number;
  volume: number;
  created_at: string;
  updated_at: string;
}

/**
 * Reading history table
 * Track reading sessions and positions
 */
export interface ReadingHistory {
  id: string;
  paper_id: string;
  page_number: number;
  scroll_position: number;
  character_position: number;
  session_duration: number;
  created_at: string;
}

/**
 * Extended types with relations
 */

/**
 * Paper with tags (from papers_with_tags view)
 * This view aggregates tags for each paper
 */
export interface PaperWithTags extends Paper {
  tag_names: string[];
  tag_colors: string[];
}

/**
 * Paper with additional computed fields
 */
export interface PaperWithDetails extends Paper {
  tags?: Tag[];
  highlights_count?: number;
  notes_count?: number;
  last_read?: string | null;
}

/**
 * Note with optional highlight reference
 */
export interface NoteWithHighlight extends Note {
  highlight?: Highlight;
}

/**
 * Paper chunk with computed progress
 */
export interface PaperChunkWithProgress extends PaperChunk {
  progress_percentage?: number;
}
