# Developer Notes - Scientific Paper Reader

This document contains technical notes, architecture decisions, and context for future development sessions.

---

## 📋 Project Overview

**Purpose**: Progressive Web App for reading, annotating, and listening to scientific papers
**Status**: v2.0 - Local stack with Kokoro TTS (November 2025)
**Deployment**: Full Docker stack for home lab/Portainer deployment
**Stack**: Next.js 14, TypeScript, PostgreSQL, MinIO, Redis, Kokoro TTS (CPU-optimized)

---

## 🏗️ Architecture Decisions

### Why Local Stack Instead of Supabase?

**Moved from Supabase to fully self-hosted stack:**
- **Cost control**: No external SaaS fees for database/storage
- **Data sovereignty**: Everything runs on your hardware
- **Performance**: Local network latency for all services
- **Customization**: Full control over database, storage, and queues
- **Scalability**: Can scale individual services based on needs

### Why Kokoro-82M TTS?

**Chosen for maximum quality on CPU-only hardware:**
- **#1 Ranked**: Top quality in TTS Arena blind tests
- **CPU-optimized**: Excellent performance without GPU (RTF 0.15-0.3)
- **Small model**: Only 82M parameters, minimal RAM usage (~2GB)
- **Fast processing**: Can generate hours of audio in minutes
- **ONNX Runtime**: Multi-core CPU utilization
- **Apache 2.0**: Fully open for commercial use

**Alternatives considered:**
- XTTS v2: Too slow on CPU, non-commercial license
- Bark: Extremely slow on CPU
- Piper: Lower quality output
- StyleTTS2: Slower than Kokoro with similar quality

### Why Chunk-Based Audio?

**Pre-generate audio in semantic chunks:**
- **Better navigation**: Jump between sections easily
- **Resume playback**: Pick up where you left off
- **Partial availability**: Listen to completed chunks while others process
- **Lower latency**: No real-time generation delays
- **Better quality**: Can use slower, higher-quality models

---

## 📁 Project Structure

```
paper-reader/
│
├── app/                              # Next.js App Router
│   ├── api/                          # Backend API routes
│   │   └── papers/
│   │       ├── route.ts              # List all papers
│   │       ├── upload/route.ts       # Upload, chunk, queue TTS
│   │       └── [id]/
│   │           ├── route.ts          # Get/update/delete paper
│   │           └── chunks/route.ts   # Get chunks with audio URLs
│   ├── library/page.tsx              # Library grid view
│   ├── papers/[id]/page.tsx          # Paper reader
│   ├── upload/page.tsx               # Upload interface
│   └── page.tsx                      # Home page
│
├── components/
│   ├── library/
│   │   └── LibraryView.tsx           # Client-side library
│   └── reader/
│       ├── PaperReader.tsx           # Main reader (Read/Listen/Notes tabs)
│       ├── AudioPlayer.tsx           # Chunk-based audio player
│       ├── PdfViewer.tsx             # PDF.js integration
│       └── NotesPanel.tsx            # Notes display
│
├── lib/
│   ├── db/client.ts                  # PostgreSQL client
│   ├── storage/client.ts             # MinIO S3 client
│   ├── queue/client.ts               # BullMQ job queue
│   └── utils/chunking.ts             # Text chunking for papers
│
├── services/
│   ├── tts-service/                  # Kokoro TTS FastAPI service
│   │   ├── Dockerfile
│   │   ├── main.py                   # TTS generation API
│   │   └── requirements.txt
│   └── tts-worker/                   # Background job processor
│       ├── Dockerfile
│       ├── package.json
│       └── src/index.ts              # BullMQ worker
│
├── database/
│   └── schema.sql                    # PostgreSQL schema
│
├── docker-compose.yml                # Full stack orchestration
└── package.json                      # App dependencies
```

---

## 🔑 Key Services

### 1. PostgreSQL Database
- **Image**: `postgres:16-alpine`
- **Purpose**: Store papers, chunks, notes, tags
- **Port**: 5432
- **Schema**: Auto-initialized from `database/schema.sql`
- **Features**: Full-text search, JSONB, triggers

### 2. MinIO Object Storage
- **Image**: `minio/minio:latest`
- **Purpose**: S3-compatible storage for PDFs and audio
- **Ports**: 9000 (API), 9001 (Console)
- **Buckets**: `papers`, `audio`, `voice-notes`
- **Access**: Public read for audio/papers

### 3. Redis
- **Image**: `redis:7-alpine`
- **Purpose**: Job queue backend for BullMQ
- **Port**: 6379
- **Persistence**: Enabled with volume

### 4. Kokoro TTS Service
- **Base**: Python 3.11 with ONNX Runtime
- **Purpose**: Generate high-quality TTS audio
- **Port**: 8001 (mapped from 8000)
- **API**: FastAPI with /generate, /voices endpoints
- **Model**: Downloaded on first run, cached in volume
- **Config**: Multi-core CPU optimization

### 5. TTS Worker
- **Base**: Node.js 20
- **Purpose**: Process TTS jobs from queue
- **Concurrency**: Configurable (default: 2)
- **Flow**: Fetch chunk → Call TTS → Upload to MinIO → Update DB

### 6. Next.js App
- **Base**: Node.js 20
- **Purpose**: Web application frontend + API
- **Port**: 3000
- **Build**: Multi-stage Docker for optimization

---

## 🔄 Paper Processing Flow

### Upload → TTS Generation

1. **User uploads PDF** → `/api/papers/upload`
2. **Extract text and metadata** using `pdf-parse`
3. **Chunk the text** using `lib/utils/chunking.ts`:
   - Detect sections (Abstract, Introduction, etc.)
   - Split into ~500-word chunks
   - Clean citations and special characters
4. **Create database records**:
   - Insert paper record (status: `processing`)
   - Create chunk records (status: `pending`)
5. **Queue TTS jobs**:
   - Bulk add to BullMQ queue
   - One job per chunk
6. **Worker processes jobs**:
   - Fetch chunk text from DB
   - Call TTS service `/generate`
   - Download generated audio
   - Upload to MinIO `audio/{paperId}/{chunkIndex}.wav`
   - Update chunk record (status: `completed`)
7. **When all chunks complete**:
   - Update paper status to `completed`
   - User can now listen

### Playback Flow

1. **User clicks "Listen" tab**
2. **Frontend fetches** `/api/papers/{id}/chunks`
3. **AudioPlayer component**:
   - Displays chunks in order
   - Shows progress (X/Y chunks ready)
   - Polls every 5s if still processing
4. **User clicks Play**:
   - Loads audio URL from MinIO
   - Plays using HTML5 Audio API
   - Auto-advances to next chunk when done
5. **Navigation**:
   - Skip forward/back between chunks
   - Seek within current chunk
   - Speed and volume controls

---

## 💾 Database Schema

### papers
```sql
- id (UUID, PK)
- title, authors, abstract
- pdf_file_path (MinIO path)
- total_pages, extracted_text
- metadata (JSONB)
- reading_progress (0-100)
- tts_status (pending/processing/completed/failed)
- tts_started_at, tts_completed_at
- upload_date, last_accessed
```

### paper_chunks
```sql
- id (UUID, PK)
- paper_id (FK to papers)
- chunk_index (sequential number)
- chunk_type (abstract/section/paragraph)
- section_title (optional)
- text_content (cleaned text)
- start_page, end_page
- word_count, char_count
- audio_file_path (MinIO path)
- audio_duration (seconds)
- tts_status (pending/processing/completed/failed)
```

### notes
```sql
- id (UUID, PK)
- paper_id (FK to papers)
- chunk_id (FK to chunks, optional)
- note_type (text/voice)
- content (for text notes)
- voice_file_path (for voice notes)
- position_data (JSONB: page, position, etc.)
- context_text (text being read)
```

### tags, paper_tags, highlights
Standard structure for tagging and highlighting features.

---

## 🚀 Deployment Guide

### Requirements
- Docker and Docker Compose
- 144GB RAM (overkill, but you have it!)
- CPU with many cores (Xeon - perfect for Kokoro)
- ~20GB disk space for images
- Additional space for papers and audio

### Quick Start

1. **Clone repository**
   ```bash
   cd /your/deployment/path
   git clone https://github.com/edwardbirdlab/paper-readar.git
   cd paper-readar
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   nano .env
   ```

3. **Start stack**
   ```bash
   docker-compose up -d
   ```

4. **Check status**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

5. **Access services**
   - App: http://localhost:3000
   - MinIO Console: http://localhost:9001
   - Database: localhost:5432

### First Time Setup

**Database** initializes automatically from `database/schema.sql`

**MinIO buckets** auto-created by `minio-init` container:
- papers
- audio
- voice-notes

**TTS model** downloads on first generation (~80MB)

### Monitoring

```bash
# View all logs
docker-compose logs -f

# View specific service
docker-compose logs -f tts-worker

# Check TTS queue
docker-compose exec redis redis-cli
> KEYS *
> HGETALL bull:tts-jobs:1
```

---

## 🔧 Development Workflow

### Local Development (Without Docker)

```bash
# Install dependencies
npm install

# Set up local services
# You'll need: PostgreSQL, MinIO, Redis running locally

# Configure environment
cp .env.example .env.local
# Edit with local service URLs

# Run dev server
npm run dev

# App runs on http://localhost:3000
```

### Making Changes

**Frontend changes:**
- Edit components → Hot reload works
- API routes → Server restarts automatically

**Database changes:**
1. Update `database/schema.sql`
2. Apply to running DB:
   ```bash
   docker-compose exec postgres psql -U paper_reader -d paper_reader -f /docker-entrypoint-initdb.d/01-schema.sql
   ```

**TTS service changes:**
1. Edit `services/tts-service/main.py`
2. Rebuild:
   ```bash
   docker-compose up -d --build tts-service
   ```

**Worker changes:**
1. Edit `services/tts-worker/src/index.ts`
2. Rebuild:
   ```bash
   docker-compose up -d --build tts-worker
   ```

---

## 🐛 Troubleshooting

### TTS Generation Stuck

```bash
# Check worker logs
docker-compose logs tts-worker

# Check TTS service
docker-compose logs tts-service

# Check queue
docker-compose exec redis redis-cli
> KEYS bull:tts-jobs:*
```

### Audio Not Playing

- Check MinIO bucket permissions
- Verify audio file exists in MinIO console
- Check browser console for CORS errors
- Ensure MinIO is accessible from browser

### Database Connection Errors

```bash
# Check postgres is running
docker-compose ps postgres

# Check connection
docker-compose exec app node -e "const {Pool}=require('pg'); new Pool({connectionString:process.env.DATABASE_URL}).query('SELECT NOW()').then(r=>console.log(r.rows))"
```

### Slow TTS Generation

- Check CPU usage: `htop` or `docker stats`
- Increase worker concurrency in `.env`: `WORKER_CONCURRENCY=4`
- Adjust TTS threads: `CPU_CORES=16`
- Remember: Quality over speed (hours are OK!)

---

## 📊 Performance Expectations

### TTS Generation Speed (Kokoro on CPU)
- **Processing**: ~15-30 minutes for typical paper
- **Output**: 5-6 hours of audio
- **RTF**: 0.15-0.3 (generates 3-7x faster than playback)
- **Your hardware**: Many cores = fast parallel processing

### Typical Paper Sizes
- **Small** (10 pages): ~5,000 words → ~8 chunks → ~35 min audio → ~5 min TTS
- **Medium** (20 pages): ~10,000 words → ~15 chunks → ~70 min audio → ~10 min TTS
- **Large** (50 pages): ~25,000 words → ~40 chunks → ~3 hr audio → ~20 min TTS

### Storage Requirements
- **PDF**: 1-5 MB typical
- **Audio per paper**: ~50-100 MB (WAV format)
- **With 100 papers**: ~5-10 GB storage needed

---

## 🚧 TODO / Future Features

### High Priority
- [ ] **Authentication**: Add user accounts (optional for self-hosted)
- [ ] **Tags UI**: Frontend for creating and assigning tags
- [ ] **Highlights**: Text selection and color-coded highlighting
- [ ] **Mobile optimization**: Better responsive design

### Medium Priority
- [ ] **Voice selection**: Let users choose from Kokoro voices
- [ ] **Bookmark system**: Quick links to important sections
- [ ] **Export notes**: Markdown/PDF export
- [ ] **Citation parsing**: Better filtering of references
- [ ] **Search**: Full-text search across papers

### Low Priority / Nice to Have
- [ ] **Collaborative features**: Share papers and notes
- [ ] **Integration**: arXiv, PubMed import
- [ ] **OCR support**: For scanned PDFs
- [ ] **Dark mode toggle**: UI already supports it
- [ ] **Keyboard shortcuts**: Power user features

---

## 💡 Tips & Best Practices

### For Best TTS Quality
- Upload clean, text-based PDFs (not scans)
- Papers with clear section headers chunk better
- Remove extremely long papers into separate uploads

### For Performance
- Let TTS finish processing before listening (better experience)
- Use worker concurrency = CPU cores / 2
- Monitor disk space (audio files add up!)

### For Development
- Test with small papers first (~10 pages)
- Check logs frequently when debugging workers
- Use MinIO console to verify uploads
- Keep docker-compose logs open in separate terminal

---

## 📝 Commit Guidelines

```
Short summary (50 chars)

## Changes
- Bullet point 1
- Bullet point 2

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 📚 Useful Commands

```bash
# Full stack restart
docker-compose down && docker-compose up -d

# Clean restart (removes volumes!)
docker-compose down -v && docker-compose up -d

# View specific service logs
docker-compose logs -f [service-name]

# Execute command in container
docker-compose exec [service] [command]

# Check resource usage
docker stats

# Backup database
docker-compose exec postgres pg_dump -U paper_reader paper_reader > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U paper_reader paper_reader
```

---

**Last Updated**: 2025-11-12
**Version**: 2.0.0 - Local Stack with Kokoro TTS
**Architecture**: Fully self-hosted, CPU-optimized, production-ready

Happy reading! 📖🎧
