# Database Schema Documentation

## Overview

Scientific Paper Reader v2.0 uses a local PostgreSQL 16 database. This replaces the previous Supabase-hosted setup from v1.0.

**Important Changes from v1.0:**
- No multi-user support (removed all `user_id` columns)
- Direct PostgreSQL connection instead of Supabase client
- Authors stored as TEXT instead of array
- Simplified file paths (no separate storage_path fields)
- Local MinIO for file storage instead of Supabase Storage

## Database Connection

Connection managed via `/lib/db/client.ts` using `pg` connection pool:

```typescript
import db from '@/lib/db/client';

// Available methods:
await db.papers.findAll();
await db.papers.findById(id);
await db.papers.create(data);
await db.papers.update(id, data);
await db.papers.delete(id);
```

**Environment Variable:**
```bash
DATABASE_URL=postgresql://paper_reader:password@localhost:3002/paper_reader
```

## Tables

### 1. papers

Stores scientific paper metadata and content.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `title` | TEXT | Paper title |
| `authors` | TEXT | Comma-separated author names (STRING, not array) |
| `abstract` | TEXT | Paper abstract |
| `publication_date` | DATE | Publication date |
| `doi` | TEXT | Digital Object Identifier |
| `pdf_file_path` | TEXT | Path to PDF in MinIO (format: `papers/{uuid}.pdf`) |
| `total_pages` | INTEGER | Number of pages in PDF |
| `extracted_text` | TEXT | Full text extracted from PDF |
| `metadata` | JSONB | Additional metadata (flexible) |
| `reading_progress` | FLOAT | Percentage 0-100 |
| `reading_status` | TEXT | `unread` \| `reading` \| `completed` |
| `tts_status` | TEXT | `pending` \| `processing` \| `completed` \| `failed` |
| `tts_error` | TEXT | Error message if TTS fails |
| `tts_started_at` | TIMESTAMPTZ | When TTS processing started |
| `tts_completed_at` | TIMESTAMPTZ | When TTS processing completed |
| `upload_date` | TIMESTAMPTZ | When paper was uploaded |
| `last_accessed` | TIMESTAMPTZ | Last time paper was viewed |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on changes |

**TypeScript Interface:** `Paper` in `/lib/types/database.ts`

**Important Notes:**
- `authors` is TEXT, not string[] (changed from v1.0)
- Use `total_pages` not `page_count`
- `pdf_file_path` is the MinIO path, not `pdf_storage_path`
- No `file_size`, `journal`, `pdf_url`, or `reading_text` columns

### 2. paper_chunks

Text segments for TTS processing. Papers are automatically chunked when uploaded.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `chunk_index` | INTEGER | Sequential order (0-based) |
| `chunk_type` | TEXT | `abstract` \| `section` \| `paragraph` |
| `section_title` | TEXT | Section heading if applicable |
| `text_content` | TEXT | The text to be converted to speech |
| `start_page` | INTEGER | Starting page number |
| `end_page` | INTEGER | Ending page number |
| `word_count` | INTEGER | Number of words |
| `char_count` | INTEGER | Number of characters |
| `audio_file_path` | TEXT | Path to generated audio in MinIO |
| `audio_duration` | INTEGER | Duration in seconds |
| `tts_status` | TEXT | `pending` \| `processing` \| `completed` \| `failed` |
| `tts_error` | TEXT | Error message if TTS fails |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on changes |

**TypeScript Interface:** `PaperChunk` in `/lib/types/database.ts`

**Important Notes:**
- Chunks are created automatically during upload
- TTS worker processes chunks in background via BullMQ
- `audio_file_path` format: `audio/{paper_id}/{chunk_id}.wav`
- `tts_error` added in v2.0 to track processing failures

### 3. tags

Custom tags for organizing papers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Tag name (unique) |
| `color` | TEXT | Hex color code (default: #3b82f6) |
| `created_at` | TIMESTAMPTZ | Record creation time |

**TypeScript Interface:** `Tag` in `/lib/types/database.ts`

### 4. paper_tags

Many-to-many relationship between papers and tags.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `tag_id` | UUID | Foreign key to tags |
| `created_at` | TIMESTAMPTZ | Record creation time |

**Constraints:**
- `UNIQUE (paper_id, tag_id)` - prevents duplicate tags on same paper

### 5. highlights

Text selections and highlights in papers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `page_number` | INTEGER | Page where highlight appears |
| `position_data` | JSONB | Flexible structure for position/coordinates |
| `highlighted_text` | TEXT | The selected text |
| `color` | TEXT | Highlight color (default: #ffeb3b) |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on changes |

**TypeScript Interface:** `Highlight` in `/lib/types/database.ts`

### 6. notes

Text or voice notes attached to papers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `chunk_id` | UUID | Optional link to paper_chunk |
| `highlight_id` | UUID | Optional link to highlight |
| `note_type` | TEXT | `text` \| `voice` |
| `content` | TEXT | Text content (for text notes) |
| `voice_file_path` | TEXT | Path to voice file in MinIO |
| `position_data` | JSONB | Page/time/scroll position |
| `context_text` | TEXT | Surrounding text for context |
| `voice_duration` | INTEGER | Duration in seconds (for voice notes) |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on changes |

**TypeScript Interface:** `Note` in `/lib/types/database.ts`

**Important Notes:**
- Use `voice_duration` not `duration`
- Use `voice_file_path` not `audio_url` or `audio_storage_path`
- Must generate audio URL from `voice_file_path` when serving

### 7. audio_sessions

Track TTS playback sessions and positions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `position` | INTEGER | Current playback position |
| `chunk_id` | UUID | Currently playing chunk |
| `playback_rate` | FLOAT | Speed multiplier (default: 1.0) |
| `volume` | FLOAT | Volume level (default: 1.0) |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Auto-updated on changes |

**TypeScript Interface:** `AudioSession` in `/lib/types/database.ts`

### 8. reading_history

Track reading sessions and positions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `paper_id` | UUID | Foreign key to papers |
| `page_number` | INTEGER | Current page |
| `scroll_position` | FLOAT | Scroll offset |
| `character_position` | INTEGER | Character position in text |
| `session_duration` | INTEGER | Time spent in seconds |
| `created_at` | TIMESTAMPTZ | Record creation time |

**TypeScript Interface:** `ReadingHistory` in `/lib/types/database.ts`

## Views

### papers_with_tags

Joins papers with their associated tags for easier querying.

```sql
CREATE OR REPLACE VIEW papers_with_tags AS
SELECT
  p.*,
  COALESCE(array_agg(t.name) FILTER (WHERE t.id IS NOT NULL), ARRAY[]::TEXT[]) as tag_names,
  COALESCE(array_agg(t.color) FILTER (WHERE t.id IS NOT NULL), ARRAY[]::TEXT[]) as tag_colors
FROM papers p
LEFT JOIN paper_tags pt ON p.id = pt.paper_id
LEFT JOIN tags t ON pt.tag_id = t.id
GROUP BY p.id;
```

**TypeScript Interface:** `PaperWithTags` in `/lib/types/database.ts`

## Functions

### search_papers(search_query TEXT)

Full-text search across title, authors, and abstract fields.

```sql
SELECT * FROM search_papers('machine learning');
```

Uses PostgreSQL `pg_trgm` extension for fuzzy matching.

## Indexes

Performance-optimized indexes:

```sql
-- Status filtering
CREATE INDEX idx_papers_status ON papers(reading_status);
CREATE INDEX idx_papers_tts_status ON papers(tts_status);
CREATE INDEX idx_papers_upload_date ON papers(upload_date DESC);

-- Chunk queries
CREATE INDEX idx_paper_chunks_paper ON paper_chunks(paper_id, chunk_index);
CREATE INDEX idx_paper_chunks_status ON paper_chunks(paper_id, tts_status);

-- Full-text search
CREATE INDEX papers_search_idx ON papers USING GIN (
  to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(authors, '') || ' ' || COALESCE(abstract, ''))
);
```

## Triggers

All tables with `updated_at` columns have triggers:

```sql
CREATE TRIGGER update_papers_updated_at BEFORE UPDATE ON papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Common Queries

### Get paper with chunks and TTS status

```typescript
const paper = await db.papers.findById(paperId);
const chunks = await db.paperChunks.findByPaperId(paperId);
```

### Get pending TTS chunks

```sql
SELECT * FROM paper_chunks
WHERE paper_id = $1 AND tts_status = 'pending'
ORDER BY chunk_index;
```

### Update reading progress

```typescript
await db.papers.update(paperId, {
  readingProgress: 45.5,
  readingStatus: 'reading'
});
```

### Search papers

```typescript
const results = await db.papers.search('quantum computing');
```

## Field Naming Conventions

**Database (PostgreSQL):** `snake_case`
- `total_pages`, `reading_progress`, `voice_duration`

**TypeScript:** `camelCase` for some helper methods, but interfaces match DB exactly
- Database interfaces use snake_case to match SQL
- Helper method parameters use camelCase

**Example:**
```typescript
// Interface matches database exactly
interface Paper {
  total_pages: number;  // snake_case like DB
  reading_progress: number;
}

// Helper method uses camelCase parameters
await db.papers.create({
  totalPages: 10,  // camelCase parameter
  // Converted to snake_case internally
});
```

## Migration Notes (v1.0 → v2.0)

### Removed Columns
- `user_id` (all tables) - no longer multi-user
- `file_size` (papers) - not tracked
- `journal` (papers) - not implemented
- `pdf_url` (papers) - use pdf_file_path
- `pdf_storage_path` (papers) - consolidated to pdf_file_path
- `reading_text` (papers) - use extracted_text
- `duration` (notes) - renamed to voice_duration
- `audio_url` (notes) - use voice_file_path
- `audio_storage_path` (notes) - consolidated to voice_file_path

### Renamed Columns
- `page_count` → `total_pages`
- `note.duration` → `note.voice_duration`

### Type Changes
- `authors`: `string[]` → `TEXT` (single string)

## TypeScript Type Definitions

Located in `/lib/types/database.ts`

**Base Types:**
```typescript
export type ReadingStatus = 'unread' | 'reading' | 'completed';
export type NoteType = 'text' | 'voice';
export type TTSStatus = 'pending' | 'processing' | 'completed' | 'failed';
```

**Interfaces:**
- `Paper` - Base paper interface
- `PaperChunk` - Chunk with TTS fields
- `Tag` - Tag definition
- `PaperTag` - Paper-tag junction
- `Highlight` - Text highlight
- `Note` - Text or voice note
- `AudioSession` - Playback session
- `ReadingHistory` - Reading session

**Extended Types:**
- `PaperWithTags` - Includes tag arrays
- `PaperWithDetails` - Includes computed fields
- `NoteWithHighlight` - Note joined with highlight

## Schema Validation

The `docker-deploy.sh` script validates schema on startup:

```bash
# Checks all critical tables exist
TABLES=("papers" "paper_chunks" "tags" "paper_tags" "highlights" "notes" "audio_sessions" "reading_history")

# Verifies schema.sql is a file (not directory)
# Initializes manually if needed
# Exits on failure with clear error messages
```

## Maintenance

### Backup

```bash
# Backup database
docker compose exec -T postgres pg_dump -U paper_reader paper_reader > backup.sql

# Restore database
docker compose exec -T postgres psql -U paper_reader -d paper_reader < backup.sql
```

### Reset Database

```bash
# Remove volume and restart (handled by docker-deploy.sh)
docker volume rm paper-readar_postgres_data
./docker-deploy.sh
```

### Check Schema Version

```bash
# Connect to database
docker compose exec postgres psql -U paper_reader -d paper_reader

# List all tables
\dt

# Check paper_chunks columns (should include tts_error)
\d paper_chunks
```

## Troubleshooting

### "relation papers does not exist"

**Cause:** Schema not initialized properly
**Fix:** Run `./docker-deploy.sh` which validates and initializes schema

### "column tts_error does not exist"

**Cause:** Using old schema without v2.0 fixes
**Fix:** Remove database volume and redeploy with updated schema.sql

### "database/schema.sql: Is a directory"

**Cause:** Docker created directory when it couldn't find file
**Fix:**
```bash
sudo rm -rf database/
git pull
./docker-deploy.sh
```

### TypeScript type errors

**Cause:** Code using old v1.0 field names
**Fix:** Update code to use v2.0 field names (see Migration Notes)

## References

- Schema Definition: `/database/schema.sql`
- TypeScript Types: `/lib/types/database.ts`
- Database Client: `/lib/db/client.ts`
- Deployment Script: `/docker-deploy.sh`
- Docker Compose: `/docker-compose.yml`
