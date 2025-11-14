# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🆕 Recent Changes: TTS Service v2 Redesign

**IMPORTANT:** The TTS service has been completely redesigned from scratch to fix reliability issues.

### What Changed
- **Location:** `services/tts-service-v2/` (replaces `services/tts-service/`)
- **API Endpoint:** `/synthesize` (replaces `/generate`)
- **Response:** Audio returned as base64 in response (no file download needed)
- **Status:** ✅ **Tested and working** (31 unit tests, 18 integration tests, manual verification)

### Key Improvements
1. **Actually works!** (v1 always returned 500 errors)
2. Text preprocessing removes citations, URLs, LaTeX for better audio quality
3. Simplified API - audio returned directly, no temp file management
4. Comprehensive error handling with structured responses
5. 54 voices available (categorized by accent/gender)

### Migration
- See `TTS_V2_MIGRATION_GUIDE.md` for detailed migration steps
- Worker already updated in `services/tts-worker/src/index.ts`
- `docker-compose.yml` already points to v2
- Just rebuild: `docker-compose up -d --build tts-service tts-worker`

### Documentation
- **API Docs:** `services/tts-service-v2/README.md`
- **Migration Guide:** `TTS_V2_MIGRATION_GUIDE.md`
- **Tests:** `services/tts-service-v2/test_*.py`

---

## Project Overview

Scientific Paper Reader v2.0 - A Progressive Web App for reading, annotating, and listening to scientific papers using AI-powered TTS. Fully self-hosted local stack optimized for home lab deployment with Docker, using Kokoro TTS (CPU-optimized, #1 ranked quality).

## Port Mapping

All services use sequential ports starting from 3001:
- **App**: 3001 (internal 3000)
- **PostgreSQL**: 3002 (internal 5432)
- **MinIO API**: 3003 (internal 9000)
- **MinIO Console**: 3004 (internal 9001)
- **Redis**: 3005 (internal 6379)
- **TTS Service**: 3006 (internal 8000)

## Essential Commands

### Development (Next.js App)
```bash
npm run dev          # Start dev server on http://localhost:3001
npm run build        # Build production bundle
npm run start        # Start production server
npm run lint         # Run ESLint
```

### TTS Worker Service
```bash
cd services/tts-worker
npm run build        # Compile TypeScript to JavaScript
npm run dev          # Run worker in development with ts-node
npm run start        # Run compiled worker (production)
```

### Docker Stack Management
```bash
docker-compose up -d                       # Start all services
docker-compose down                        # Stop all services
docker-compose down -v                     # Stop and remove volumes (DESTRUCTIVE)
docker-compose logs -f [service]           # View logs (tts-worker, tts-service, app, etc.)
docker-compose up -d --build [service]     # Rebuild specific service
docker-compose up -d --scale tts-worker=3  # Scale worker instances
docker-compose ps                          # Check service status
```

### Database Operations
```bash
# Backup database
docker-compose exec postgres pg_dump -U paper_reader paper_reader > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U paper_reader paper_reader

# Apply schema changes manually
docker-compose exec postgres psql -U paper_reader -d paper_reader -f /docker-entrypoint-initdb.d/01-schema.sql
```

### Monitoring & Debugging
```bash
# Check TTS queue depth
docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait

# View all queue keys
docker-compose exec redis redis-cli KEYS 'bull:tts-jobs:*'

# Check resource usage
docker stats

# Test database connection from app
docker-compose exec app node -e "const {Pool}=require('pg'); new Pool({connectionString:process.env.DATABASE_URL}).query('SELECT NOW()').then(r=>console.log(r.rows))"
```

## High-Level Architecture

### Service Communication Flow

**6 Core Services in Docker Stack** (all communicate via `paper-reader-network`):

1. **PostgreSQL** (port 5432) - Primary data store
2. **MinIO** (ports 9000/9001) - S3-compatible object storage
3. **Redis** (port 6379) - BullMQ job queue backend
4. **Kokoro TTS Service** (port 8001→8000) - FastAPI-based TTS generation
5. **TTS Worker** (no exposed ports) - BullMQ background processor
6. **Next.js App** (port 3000) - Frontend + API routes

**Data Flow Pattern**:
```
User Upload (PDF)
  → Next.js API (/api/papers/upload)
  → Store PDF in MinIO (papers bucket)
  → Extract text & chunk (lib/utils/chunking.ts)
  → Create records in PostgreSQL (papers, paper_chunks)
  → Queue jobs in Redis (BullMQ)
  → TTS Worker pulls jobs
  → Worker calls TTS Service (HTTP POST /generate)
  → Worker uploads audio to MinIO (audio bucket)
  → Worker updates PostgreSQL (chunk status, audio path)
  → Frontend polls for completion
  → User plays audio from MinIO public URLs
```

### TTS Processing Pipeline

**Upload → Chunk → Queue → Process → Playback**

1. **Upload** (`app/api/papers/upload/route.ts`):
   - Validate PDF (max 50MB)
   - Extract text with `pdf-parse`
   - Upload to MinIO `papers` bucket
   - Create paper record (status: `processing`)

2. **Chunking** (`lib/utils/chunking.ts`):
   - Split by sections (Abstract, Introduction, Methods, etc.)
   - Target: ~500 words per chunk (min: 100, max: 800)
   - Clean text: Remove citations `(Author, 2020)`, URLs, LaTeX
   - Skip references/bibliography sections
   - Create chunk records in database (status: `pending`)

3. **Queueing** (`lib/queue/client.ts`):
   - Bulk add jobs to BullMQ `tts-jobs` queue
   - One job per chunk with priority by chunk_index
   - Job structure: `{paperId, chunkId, text, chunkIndex, voice}`

4. **Processing** (`services/tts-worker/src/index.ts`):
   - Worker pulls job from Redis queue
   - Updates chunk status to `processing`
   - Calls TTS service: `POST /generate` with cleaned text
   - Downloads generated WAV audio
   - Uploads to MinIO: `audio/{paperId}/{chunkIndex}.wav`
   - Updates chunk: audio_file_path, duration, status `completed`
   - Checks if all chunks complete → updates paper status

5. **Playback** (`app/api/papers/[id]/chunks/route.ts`):
   - Frontend polls every 5s while processing
   - Returns chunks with MinIO public URLs
   - AudioPlayer component handles sequential playback

## Key Integration Points

### PostgreSQL Database

**Client**: `lib/db/client.ts`

**Pattern**: Direct `pg` pool (no ORM), helper functions organized by domain

```typescript
// Example usage
import { db } from '@/lib/db/client'

// Use domain helpers
const papers = await db.papers.getAll()
const chunks = await db.paperChunks.getByPaperId(paperId)

// Use transactions for multi-step operations
await db.transaction(async (client) => {
  await client.query('INSERT INTO papers ...')
  await client.query('INSERT INTO paper_chunks ...')
})
```

**Key Tables**:
- `papers` - Paper metadata, TTS status (`pending`/`processing`/`completed`/`failed`), progress
- `paper_chunks` - Text chunks with `audio_file_path` and individual status
- `notes` - Text/voice notes linked to papers/chunks
- `tags`, `paper_tags` - Tagging system
- `highlights` - Text highlights (future feature)

**Schema Location**: `database/schema.sql` (mounted to PostgreSQL container at `/docker-entrypoint-initdb.d/01-schema.sql`)

### MinIO Object Storage

**Client**: `lib/storage/client.ts`

**S3-Compatible API**: Standard AWS S3 client methods

**Buckets**:
- `papers` - PDF files (public-read)
- `audio` - Generated TTS audio WAV files (public-read)
- `voice-notes` - User voice recordings

**Helper Modules**:
```typescript
import { storage } from '@/lib/storage/client'

// Upload PDF
await storage.papers.upload(buffer, filename)

// Upload audio
await storage.audio.upload(buffer, paperId, chunkIndex)

// Get public URL
const url = await storage.audio.getPublicUrl(paperId, chunkIndex)
```

**Naming Conventions**:
- PDFs: `{timestamp}-{sanitized-filename}.pdf`
- Audio: `{paperId}/{chunkIndex}.wav`

### Redis + BullMQ

**Client**: `lib/queue/client.ts`

**Queue Name**: `tts-jobs`

**Job Configuration**:
- Retry: 3 attempts with exponential backoff (5s initial)
- Cleanup: Auto-remove completed after 24h, failed after 7d
- Rate limiting: 10 jobs/minute per worker
- Priority: Sequential by chunk_index

```typescript
import { ttsQueue } from '@/lib/queue/client'

// Add job
await ttsQueue.add('generate-tts', {
  paperId: string,
  chunkId: string,
  text: string,
  chunkIndex: number,
  voice: 'af_sarah'  // default voice
})
```

### Kokoro TTS Service (Python FastAPI)

**Location**: `services/tts-service/main.py`

**API Endpoints**:
- `POST /generate` - Generate TTS audio (accepts: `{text, voice?, speed?}`)
- `GET /audio/{filename}` - Retrieve generated audio file
- `DELETE /audio/{filename}` - Clean up temp files
- `GET /voices` - List available voices (10 English voices)
- `GET /health` - Health check

**Performance**: RTF 0.15-0.3 (generates 3-7x faster than playback on CPU)

**Voices**: 10 options (af/am/bf/bm = American/British Female/Male, e.g., `af_sarah`, `am_michael`)

**Threading**: Configurable via `CPU_CORES` env var (default: 8) - set to match server cores

### TTS Worker (Node.js/TypeScript)

**Location**: `services/tts-worker/src/index.ts`

**Framework**: BullMQ Worker with configurable concurrency

**Processing Flow**:
1. Fetch chunk from PostgreSQL
2. Call TTS service `POST /generate`
3. Download audio from TTS service
4. Upload to MinIO `audio/{paperId}/{chunkIndex}.wav`
5. Update chunk: audio_file_path, audio_duration, status
6. Check completion: if all chunks done → update paper status

**Error Handling**: Updates both chunk and paper with error message, BullMQ handles retry

## Important Patterns & Conventions

### Database Access Pattern

- **No ORM**: Direct SQL queries with `pg` pool
- **Helper Functions**: Organized by domain (papers, chunks, notes, tags) in `lib/db/client.ts`
- **Transactions**: Use `db.transaction()` for multi-step operations
- **All queries logged** with duration for debugging

### Storage Pattern

- **MinIO buckets** are public-read for audio and papers (simplifies streaming)
- **Content-Type** must be set explicitly on upload
- Use `getPublicUrl()` for direct access, `getPresignedUrl()` for secure temporary access

### Error Handling

- **TTS Failures**: Update both chunk AND paper with error message
- **Retry Logic**: BullMQ automatically retries (3 attempts with exponential backoff)
- **Graceful Degradation**: Partial audio available (completed chunks are playable even if others fail)

### State Management

- **TTS Status Flow**: `pending` → `processing` → `completed` | `failed`
- **Timestamps**: Track `tts_started_at`, `tts_completed_at` for monitoring
- **Progress Calculation**: Count completed chunks / total chunks

### API Route Structure

```
app/api/
  papers/
    route.ts              # GET all papers
    upload/route.ts       # POST upload PDF (multipart/form-data)
    [id]/route.ts         # GET/DELETE specific paper
    [id]/chunks/route.ts  # GET chunks with audio URLs
    [id]/notes/route.ts   # GET notes for paper
  notes/
    text/route.ts         # POST create text note
    voice/route.ts        # POST create voice note
    [id]/route.ts         # DELETE note
```

## Special Considerations

### CPU Optimization for TTS

- **Model**: Kokoro-82M chosen specifically for CPU performance (no GPU needed)
- **Threading**: Set `CPU_CORES` env var to match server hardware (default: 8)
- **Worker Concurrency**: Set to CPU cores / 2 to avoid overload (default: 2)
- **Expected Speed**: 15-30 minutes for typical 20-page paper (generates 5-6 hours of audio)
- **Scaling**: Can run multiple worker instances with `docker-compose up -d --scale tts-worker=3`

### Text Cleaning for TTS Quality

**Location**: `lib/utils/chunking.ts`

- Remove in-text citations: `(Author, 2020)`, `[1]`, `et al.`
- Remove URLs and email addresses
- Filter references/bibliography sections (skip entirely)
- Normalize quotes and special characters
- Clean LaTeX formatting: `$equation$`, `\textbf{}`

**Chunking Strategy**:
- Split at semantic boundaries (section headers)
- 500 words = ~3 minutes audio = optimal for navigation
- Detect common scientific paper sections (Abstract, Introduction, Methods, Results, Discussion)
- Extract abstract as separate chunk

### Storage Considerations

- **Audio Format**: WAV uncompressed (~10MB per chunk)
- **Typical Paper**: 20 pages = ~15 chunks = ~150MB audio
- **100 Papers**: ~15GB storage needed
- **No Automatic Cleanup**: Audio files are never deleted (manual cleanup required)

### Error Recovery

- **Isolated Failures**: Failed chunks don't block others
- **Reprocessing**: Reset chunk status to `pending` and re-queue job
- **Check Queue**: `docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait`
- **Worker Logs**: `docker-compose logs -f tts-worker` for debugging

### Development Workflow

**Local Development (Without Docker)**:
1. Run PostgreSQL, MinIO, Redis locally
2. Create `.env.local` with local service URLs
3. Run `npm run dev` for hot-reload
4. Use MinIO console (port 9001) to verify uploads

**Docker Development**:
1. Edit code locally
2. Rebuild service: `docker-compose up -d --build [service]`
3. View logs: `docker-compose logs -f [service]`
4. For schema changes: Update `database/schema.sql`, reapply to container

**Testing TTS Pipeline**:
1. Upload small test PDF (10 pages) via UI
2. Monitor: `docker-compose logs -f tts-worker`
3. Check queue: `docker-compose exec redis redis-cli KEYS 'bull:tts-jobs:*'`
4. Verify audio in MinIO console (http://localhost:3004)
5. Test playback in browser

## Architecture Decisions (Context)

### Why Local Stack vs Supabase?
Originally used Supabase. Migrated to self-hosted for:
- Cost control (no SaaS fees)
- Data sovereignty (runs on your hardware)
- Full customization of services
- Better for home lab deployments

### Why Kokoro TTS?
- #1 ranked quality in TTS Arena blind tests
- CPU-optimized (RTF 0.15-0.3 without GPU)
- Small model (82M params, ~2GB RAM)
- Apache 2.0 license (commercial use OK)
- Alternatives (XTTS v2, Bark) too slow on CPU or non-commercial

### Why Chunk-Based Audio?
- Better navigation (skip to sections)
- Resume capability (pick up where you left off)
- Partial availability (listen to completed chunks while others process)
- Lower latency (no real-time generation delays)

### Why BullMQ?
- Robust job queue for Node.js with Redis backend
- Built-in retry logic and error handling
- Progress tracking for UI updates
- Supports multiple workers for scaling
