# Scientific Paper Reader

A Progressive Web App for reading, annotating, and listening to scientific papers with AI-powered features. Warning! This is my first experiment with "Vibe coding", or letting AI code a entire project with me only providing human language inputs. I have done no code validation of what it has written. Use at your own risk!

## Features

### ✅ Implemented Core Features

- **📄 PDF Upload & Management**
  - Drag-and-drop PDF upload interface
  - MinIO S3-compatible object storage
  - Automatic metadata extraction (title, authors, page count)
  - File size and page count tracking

- **📖 PDF Viewer**
  - Built with PDF.js
  - Page navigation and zoom controls
  - Responsive design for all devices
  - Automatic text extraction for TTS

- **🎧 Text-to-Speech (TTS)**
  - Browser-native speech synthesis
  - Adjustable playback speed (0.5x - 2.0x)
  - Volume control
  - Position tracking and syncing with PDF

- **🎙️ Voice Notes**
  - Record voice notes during reading or listening
  - Automatic syncing to current text position
  - Context capture (text being read when note was created)
  - MinIO object storage for audio files

- **📝 Text Notes**
  - Add text notes to specific pages
  - Organize notes by page or view all
  - Context preservation

- **📚 Library Management**
  - Grid view of all papers
  - Search by title or author
  - Filter by reading status (unread, reading, completed)
  - Reading progress tracking
  - Quick delete functionality

- **📱 Progressive Web App (PWA)**
  - Installable on Android and iOS devices
  - Offline support (service worker)
  - App-like experience
  - Fast loading and responsive

### 🚧 Planned Features

- **Smart Text Extraction**
  - Filter out citations and references for cleaner TTS
  - Identify and skip bibliographies
  - Parse section headers for better navigation

- **Tags & Categories**
  - Create custom tags
  - Organize papers into categories
  - Color-coded tag system

- **Highlights & Annotations**
  - Text highlighting with color options
  - Annotations tied to specific text selections
  - Export highlights and notes

- **Advanced TTS**
  - Integration with custom/self-hosted TTS service
  - Pre-processed audio support
  - Better voice quality options

## Tech Stack

- **Frontend Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL 16
- **Object Storage**: MinIO (S3-compatible)
- **Job Queue**: Redis + BullMQ
- **TTS Engine**: Kokoro-82M (CPU-optimized, #1 ranked quality)
- **PDF Processing**: PDF.js
- **Icons**: Lucide React
- **PWA**: @ducanh2912/next-pwa
- **Deployment**: Docker + Docker Compose

## Deployment Options

### 🐳 Docker Deployment (Recommended for Home Lab)

**For Portainer users and home lab deployments**, see:
- **[PORTAINER_SETUP.md](PORTAINER_SETUP.md)** - Quick 5-minute setup guide
- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Complete Docker deployment guide

Quick start with Docker:
```bash
# Option 1: Interactive deployment (Recommended)
# - Prompts for development/production mode
# - Generates secure credentials automatically
# - Creates .env file for you
./docker-deploy.sh

# Option 2: Manual deployment
# - Requires you to create .env file first (copy from .env.example)
# - No interactive prompts
docker-compose up -d
```

**What you get with Docker:**
- ✅ One-command deployment of complete stack
- ✅ Automatic container management
- ✅ Easy updates and rollbacks
- ✅ No external dependencies (fully self-hosted)
- ✅ Perfect for home lab/Portainer setups
- ✅ Automatic database initialization
- ✅ Automatic MinIO bucket setup

### 💻 Local Development

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (for self-hosted deployment)
- PostgreSQL, MinIO, and Redis (if running locally without Docker)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd paper-reader
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Backend Services

**Option A: Using Docker (Recommended)**
```bash
# Start all services with Docker Compose
docker-compose up -d
```

This automatically sets up:
- PostgreSQL database with schema
- MinIO object storage with buckets
- Redis job queue
- TTS service and worker

**Option B: Local Services**
1. Install and run PostgreSQL, MinIO, and Redis locally
2. Run the database schema from `database/schema.sql`
3. Create MinIO buckets: `papers`, `audio`
4. Configure service URLs in `.env.local`

### 4. Configure Environment Variables

**For Docker deployment:**
```bash
# Create .env file (or use ./docker-deploy.sh to create it interactively)
cp .env.example .env

# Edit .env and set NODE_ENV to 'development' for detailed error logging
# or 'production' for optimized performance
```

**For local development:**
```bash
cp .env.example .env.local
```

Edit your env file and configure:

```env
# Application Configuration
NODE_ENV=development  # Use 'development' for detailed logging

# Database Configuration
POSTGRES_PASSWORD=your_secure_password

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_minio_password

# TTS Worker Configuration
WORKER_CONCURRENCY=2
CPU_CORES=8
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

### 6. Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
paper-reader/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   ├── papers/               # Paper management
│   │   └── notes/                # Notes management
│   ├── library/                  # Library page
│   ├── papers/[id]/              # Paper reader page
│   ├── upload/                   # Upload page
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── components/                   # React components
│   ├── library/                  # Library components
│   ├── reader/                   # Reader components
│   │   ├── PdfViewer.tsx         # PDF viewer
│   │   ├── AudioPlayer.tsx       # TTS audio player
│   │   ├── NotesPanel.tsx        # Notes panel
│   │   └── PaperReader.tsx       # Main reader
│   └── upload/                   # Upload components
├── lib/                          # Utilities and types
│   ├── db/                       # PostgreSQL client
│   ├── storage/                  # MinIO client
│   ├── queue/                    # BullMQ client
│   ├── utils/                    # Utilities (chunking, etc.)
│   └── types/                    # TypeScript types
├── services/                     # Backend services
│   ├── tts-service/              # Kokoro TTS FastAPI service
│   └── tts-worker/               # BullMQ background worker
├── database/                     # Database schema
│   └── schema.sql                # PostgreSQL schema
├── public/                       # Static assets
├── next.config.ts                # Next.js config
└── tailwind.config.ts            # Tailwind config
```

## Usage

### Uploading Papers

1. Click "Upload Paper" on the home page or go to `/upload`
2. Drag and drop PDF files or click to browse
3. Papers are automatically uploaded and processed
4. Metadata is extracted (title, authors, page count)

### Reading Papers

1. Go to the Library page
2. Click on any paper to open the reader
3. Use the toolbar to navigate pages and zoom
4. Switch between Read, Listen, and Notes modes

### Listening to Papers

1. Open a paper and switch to "Listen" mode
2. Click play to start text-to-speech
3. Adjust speed and volume as needed
4. The PDF scrolls automatically to match audio position

### Taking Voice Notes

1. While listening or reading, pause the audio
2. Click "Add Voice Note"
3. Record your thoughts
4. The note is automatically synced to the current text position
5. View all notes in the Notes tab

### Managing Your Library

- **Search**: Use the search bar to find papers by title or author
- **Filter**: Filter by reading status (unread, reading, completed)
- **Delete**: Click the trash icon to remove papers

## Database Schema

The app uses PostgreSQL with the following main tables:

- `papers` - Stores paper metadata, TTS status, and extracted text
- `paper_chunks` - Text chunks for TTS processing
- `tags` - Custom tags for organizing papers
- `paper_tags` - Many-to-many relationship for tags
- `highlights` - Text selections and highlights
- `notes` - Text and voice notes with position data
- `audio_sessions` - TTS playback sessions
- `reading_history` - Reading progress tracking

See `database/schema.sql` for the complete schema.

## API Routes

### Papers

- `GET /api/papers` - List all papers
- `POST /api/papers/upload` - Upload a PDF (triggers chunking and TTS processing)
- `GET /api/papers/[id]` - Get specific paper
- `GET /api/papers/[id]/chunks` - Get paper chunks with audio URLs
- `GET /api/papers/[id]/notes` - Get notes for a paper
- `DELETE /api/papers/[id]` - Delete a paper

### Notes

- `POST /api/notes/text` - Create a text note
- `POST /api/notes/voice` - Create a voice note
- `DELETE /api/notes/[id]` - Delete a note

## TTS Processing Architecture

The app uses **Kokoro-82M**, the #1 ranked TTS model for quality, optimized for CPU-only hardware:

### How it Works

1. **Upload**: User uploads PDF
2. **Chunking**: Text is extracted and split into ~500-word chunks (`lib/utils/chunking.ts`)
3. **Queueing**: Chunks are queued in Redis via BullMQ
4. **Processing**: TTS worker (`services/tts-worker`) processes jobs:
   - Calls Kokoro TTS service (`services/tts-service`)
   - Uploads generated WAV audio to MinIO
   - Updates database with audio URLs
5. **Playback**: Frontend fetches chunks with audio URLs and plays sequentially

### Performance

- **Speed**: RTF 0.15-0.3 (generates 3-7x faster than playback)
- **Quality**: #1 ranked in TTS Arena blind tests
- **Resource**: CPU-optimized, ~2GB RAM per worker
- **Typical Paper**: 20 pages = 15 chunks = ~70 min audio = ~10 min processing

### Customization

Configure worker concurrency and CPU cores in `.env`:
```env
WORKER_CONCURRENCY=2  # Number of parallel TTS jobs
CPU_CORES=8           # ONNX thread count
```

## Future Enhancements

- Advanced citation parsing and filtering
- Export notes and highlights to Markdown/PDF
- Integration with reference managers (Zotero, Mendeley)
- Collaborative features (share papers, comments)
- Mobile apps (React Native)
- Advanced search with filters
- Paper recommendations based on reading history
- Integration with academic databases (arXiv, PubMed)
