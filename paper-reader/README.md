# Scientific Paper Reader

A Progressive Web App for reading, annotating, and listening to scientific papers with AI-powered features.

## Features

### ✅ Implemented Core Features

- **📄 PDF Upload & Management**
  - Drag-and-drop PDF upload interface
  - Cloud storage with Supabase
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
  - Cloud storage for audio files

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
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage
- **PDF Processing**: PDF.js
- **Icons**: Lucide React
- **PWA**: @ducanh2912/next-pwa

## Deployment Options

### 🐳 Docker Deployment (Recommended for Home Lab)

**For Portainer users and home lab deployments**, see:
- **[PORTAINER_SETUP.md](PORTAINER_SETUP.md)** - Quick 5-minute setup guide
- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Complete Docker deployment guide

Quick start with Docker:
```bash
# Simple deployment (app + cloud Supabase)
docker-compose up -d

# Or use the deployment script
./docker-deploy.sh
```

**What you get with Docker:**
- ✅ One-command deployment
- ✅ Automatic container management
- ✅ Easy updates and rollbacks
- ✅ Optional local Supabase instance
- ✅ Perfect for home lab/Portainer setups

### 💻 Local Development

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account ([supabase.com](https://supabase.com))

### 1. Clone the Repository

```bash
git clone <repository-url>
cd paper-reader
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL schema from `supabase/schema.sql` in the Supabase SQL Editor
3. Create storage buckets:
   - `papers` (for PDF files)
   - `voice-notes` (for audio recordings)
   - `tts-audio` (for pre-processed TTS audio)
4. Configure storage policies as described in `supabase/README.md`

### 4. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# TTS Service (if using custom service)
NEXT_PUBLIC_TTS_API_URL=http://localhost:8000/api/tts
TTS_API_KEY=your-tts-api-key
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
│   ├── supabase/                 # Supabase clients
│   └── types/                    # TypeScript types
├── public/                       # Static assets
├── supabase/                     # Database schema
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

- `papers` - Stores paper metadata and extracted text
- `tags` - Custom tags for organizing papers
- `paper_tags` - Many-to-many relationship for tags
- `highlights` - Text selections and highlights
- `notes` - Text and voice notes
- `audio_sessions` - TTS playback sessions
- `reading_history` - Reading progress tracking

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.

## API Routes

### Papers

- `POST /api/papers/upload` - Upload a PDF
- `GET /api/papers/[id]/notes` - Get notes for a paper
- `DELETE /api/papers/[id]` - Delete a paper

### Notes

- `POST /api/notes/text` - Create a text note
- `POST /api/notes/voice` - Create a voice note
- `DELETE /api/notes/[id]` - Delete a note

## Self-Hosting TTS Service

The app currently uses browser-native text-to-speech. For better quality, you can integrate a custom TTS service:

1. Set up your TTS service (e.g., Coqui TTS, Mozilla TTS, or commercial APIs)
2. Configure the API endpoint in `.env.local`
3. Implement the API client in `lib/tts/client.ts`
4. Update the AudioPlayer component to use your service

Example TTS service interface:

```typescript
POST /api/tts/generate
{
  "text": "Paper text...",
  "voice": "en-US-neural",
  "speed": 1.0
}

Response:
{
  "audio_url": "https://..."
}
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
