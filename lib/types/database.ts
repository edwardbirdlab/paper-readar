export type ReadingStatus = 'unread' | 'reading' | 'completed';
export type NoteType = 'text' | 'voice';

export interface Paper {
  id: string;
  user_id: string;
  title: string;
  authors: string[];
  publication_date: string | null;
  journal: string | null;
  doi: string | null;
  pdf_url: string;
  pdf_storage_path: string;
  extracted_text: string | null;
  reading_text: string | null;
  page_count: number | null;
  file_size: number | null;
  reading_status: ReadingStatus;
  reading_progress: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface PaperTag {
  id: string;
  paper_id: string;
  tag_id: string;
  created_at: string;
}

export interface Highlight {
  id: string;
  paper_id: string;
  user_id: string;
  page_number: number;
  position_data: {
    x: number;
    y: number;
    width: number;
    height: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  };
  highlighted_text: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  paper_id: string;
  user_id: string;
  highlight_id: string | null;
  note_type: NoteType;
  content: string | null;
  audio_url: string | null;
  audio_storage_path: string | null;
  position_data: {
    page_number: number;
    character_position: number;
    scroll_position: number;
  } | null;
  context_text: string | null;
  duration: number | null;
  created_at: string;
  updated_at: string;
}

export interface AudioSession {
  id: string;
  paper_id: string;
  user_id: string;
  audio_url: string | null;
  audio_storage_path: string | null;
  position: number;
  duration: number | null;
  playback_rate: number;
  voice_settings: {
    voice?: string;
    speed?: number;
    pitch?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface ReadingHistory {
  id: string;
  paper_id: string;
  user_id: string;
  page_number: number;
  scroll_position: number;
  character_position: number;
  session_duration: number;
  created_at: string;
}

// Extended types with relations
export interface PaperWithTags extends Paper {
  tags: Tag[];
}

export interface PaperWithDetails extends Paper {
  tags: Tag[];
  highlights_count: number;
  notes_count: number;
  last_read: string | null;
}

export interface NoteWithHighlight extends Note {
  highlight?: Highlight;
}
