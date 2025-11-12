# Developer Notes - Scientific Paper Reader

This document contains technical notes, architecture decisions, and context for future development sessions.

---

## 📋 Project Overview

**Purpose**: Progressive Web App for reading, annotating, and listening to scientific papers
**Status**: MVP Complete - Core features implemented
**Deployment**: Docker-ready for home lab/Portainer deployment
**Stack**: Next.js 14, TypeScript, Supabase, PDF.js, Tailwind CSS

---

## 🏗️ Architecture Decisions

### Why Next.js 14 with App Router?
- Server-side rendering for better performance
- Built-in API routes eliminate need for separate backend
- App Router provides better code organization
- Excellent TypeScript support
- Native image optimization

### Why Supabase?
- **PostgreSQL**: Robust database with full-text search
- **Row Level Security**: Built-in multi-tenancy
- **Storage**: Integrated file storage for PDFs and audio
- **Auth**: Ready-to-use authentication (not yet implemented but ready)
- **Realtime** (future): Could enable collaborative features

### Why Browser-Native TTS?
- **Current**: Using Web Speech API for immediate functionality
- **Future**: Designed to easily swap in custom TTS service
- Position tracking and syncing already implemented
- API interface designed in documentation

### Docker Architecture
- **Multi-stage build**: Optimizes image size (~200MB final)
- **Standalone output**: Next.js standalone mode for Docker
- **Two deployment options**:
  - Simple: App only (uses cloud Supabase)
  - Full stack: Complete self-hosted with local Supabase

---

## 📁 Project Structure Explained

```
paper-reader/
│
├── app/                              # Next.js App Router
│   ├── api/                          # Backend API routes
│   │   ├── papers/
│   │   │   ├── upload/route.ts       # PDF upload handler
│   │   │   └── [id]/
│   │   │       ├── route.ts          # Delete paper
│   │   │       └── notes/route.ts    # Get notes for paper
│   │   └── notes/
│   │       ├── text/route.ts         # Create text note
│   │       ├── voice/route.ts        # Upload voice note
│   │       └── [id]/route.ts         # Delete note
│   │
│   ├── library/page.tsx              # Library grid view
│   ├── papers/[id]/page.tsx          # Paper reader (server component)
│   ├── upload/page.tsx               # Upload interface
│   ├── page.tsx                      # Home page
│   └── layout.tsx                    # Root layout with PWA meta
│
├── components/
│   ├── library/
│   │   └── LibraryView.tsx           # Client-side library with search/filter
│   ├── reader/
│   │   ├── PaperReader.tsx           # Main reader with tabs (Read/Listen/Notes)
│   │   ├── PdfViewer.tsx             # PDF.js integration
│   │   ├── AudioPlayer.tsx           # TTS player + voice recording
│   │   └── NotesPanel.tsx            # Notes display and management
│   └── upload/
│       └── PdfUploader.tsx           # Drag-drop upload with progress
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Browser Supabase client
│   │   └── server.ts                 # Server-side Supabase client
│   └── types/
│       └── database.ts               # TypeScript types for database
│
├── supabase/
│   ├── schema.sql                    # Complete database schema
│   ├── kong.yml                      # API gateway config (local Supabase)
│   └── README.md                     # Supabase setup instructions
│
└── Docker files, docs, configs...
```

---

## 🔑 Key Components Deep Dive

### PDF Upload Flow
1. **Client** (`PdfUploader.tsx`): Handles file selection, drag-drop, UI feedback
2. **API** (`/api/papers/upload/route.ts`):
   - Validates PDF
   - Extracts metadata using PDF.js
   - Uploads to Supabase Storage
   - Creates database record
   - Returns paper ID
3. **Redirect**: Sends user to reader page

### PDF Viewing & Text Extraction
- **PdfViewer.tsx** uses PDF.js CDN worker
- Renders pages to canvas
- Extracts ALL text on mount (background process)
- Text passed to parent for TTS
- Page navigation and zoom controls

### Text-to-Speech System
- **Current**: `window.speechSynthesis` (Web Speech API)
- **Position Tracking**: `utterance.onboundary` tracks character position
- **Sync**: Character position used to highlight current text
- **Voice Notes**: Records at current position with context

### Voice Note Recording
1. **Trigger**: User clicks "Add Voice Note" during playback
2. **Capture**: Uses `MediaRecorder` API (WebM audio)
3. **Context**: Grabs ±100 chars of text around current position
4. **Upload**: Sends to `/api/notes/voice`
5. **Storage**: Supabase Storage in `voice-notes` bucket
6. **Database**: Links to paper, position, and context text

### Database Schema Highlights

**Papers Table**:
- Stores PDF metadata and extracted text
- `reading_text`: Cleaned text for TTS (future: citation filtering)
- `reading_progress`: Percentage completed
- Full-text search index on title + text

**Notes Table**:
- Polymorphic: text or voice notes
- `position_data`: JSON with page, character position, scroll
- `context_text`: What was being read when note created
- Links to highlights (future feature)

**RLS Policies**:
- All tables have Row Level Security
- Users can only access their own data
- Based on `auth.uid()` from Supabase Auth

---

## 🚧 Known Limitations & TODOs

### Implemented ✅
- [x] PDF upload and storage
- [x] PDF viewer with navigation
- [x] Text extraction
- [x] Basic TTS (browser native)
- [x] Voice note recording with position sync
- [x] Text notes
- [x] Library with search and filters
- [x] Reading progress tracking
- [x] Docker deployment
- [x] PWA support

### Not Yet Implemented ⏳

#### High Priority
- [ ] **Smart Citation Filtering**: Parse PDF to remove citations/references from TTS
  - Strategy: Regex patterns + section detection
  - Skip "References", "Bibliography" sections
  - Filter inline citations like [1], (Author, 2020)
  - Store in `reading_text` column (already exists!)

- [ ] **Authentication**: Supabase Auth integration
  - Login/signup pages
  - Protected routes
  - Currently uses RLS but no auth UI

- [ ] **Tags System**: Database schema exists, needs UI
  - Tag creation/management
  - Tag assignment to papers
  - Filter by tags in library

- [ ] **Highlights**: Database schema exists, needs UI
  - Text selection in PDF
  - Color-coded highlights
  - Save position data
  - Display in sidebar

#### Medium Priority
- [ ] **Custom TTS Integration**: Replace browser TTS
  - API client in `lib/tts/client.ts`
  - Update AudioPlayer component
  - Support for pre-processed audio

- [ ] **Search Improvements**
  - Full-text search across paper content
  - Search within notes
  - Advanced filters (date range, authors)

- [ ] **Export Features**
  - Export highlights and notes as Markdown
  - PDF export with annotations
  - BibTeX export

- [ ] **Reading Analytics**
  - Time spent reading
  - Reading history timeline
  - Statistics dashboard

#### Low Priority / Nice to Have
- [ ] **Collaborative Features**
  - Share papers with other users
  - Shared annotations
  - Comments/discussions

- [ ] **Mobile App**: React Native version
- [ ] **Integration with Reference Managers**: Zotero, Mendeley
- [ ] **Academic Database Integration**: arXiv, PubMed
- [ ] **OCR Support**: For scanned PDFs
- [ ] **Dark Mode**: Already styled for it, needs toggle

---

## 🔧 Development Workflow

### Local Development Setup

```bash
cd paper-reader
npm install

# Create .env.local with Supabase credentials
cp .env.example .env.local
# Edit .env.local with your Supabase URL and key

# Run dev server
npm run dev

# Open http://localhost:3000
```

### Making Changes

1. **Frontend Changes**: Edit components, hot reload works
2. **API Changes**: Edit routes in `app/api/`, server restarts
3. **Database Changes**: Update `supabase/schema.sql`, rerun in Supabase
4. **Type Changes**: Update `lib/types/database.ts` to match schema

### Testing PDF Upload

You have sample PDFs in `/workspace/sample_papers/`:
- `insects-12-00917.pdf` (1.5 MB)
- Mosquito research paper

### Docker Testing

```bash
# Build and run
docker-compose up --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## 🐛 Debugging Tips

### PDF.js Issues
- **Worker errors**: Check CDN worker URL in `PdfViewer.tsx`
- **CORS issues**: PDF.js needs proper CORS headers
- **Memory**: Large PDFs can crash - implement pagination

### Supabase Storage Issues
- **Upload fails**: Check bucket exists and RLS policies
- **Can't view PDFs**: Storage policies must allow SELECT
- **File path**: Format is `{user_id}/{timestamp}-{filename}`

### TTS Not Working
- **Browser support**: Check `window.speechSynthesis` exists
- **Voices**: Different browsers have different voices
- **Rate limits**: Some browsers limit TTS length

### Voice Recording Issues
- **Permission denied**: Browser blocks mic without HTTPS
- **Format support**: WebM may not work on all browsers
- **Size limits**: Large recordings may fail upload

---

## 📊 Database Queries to Know

### Get all papers for user with tags
```sql
SELECT p.*,
       array_agg(t.name) as tag_names
FROM papers p
LEFT JOIN paper_tags pt ON p.id = pt.paper_id
LEFT JOIN tags t ON pt.tag_id = t.id
WHERE p.user_id = 'user-uuid'
GROUP BY p.id;
```

### Full-text search
```sql
SELECT * FROM papers
WHERE to_tsvector('english', title || ' ' || extracted_text)
      @@ to_tsquery('english', 'mosquito & insecticide')
AND user_id = 'user-uuid';
```

### Get notes with context
```sql
SELECT n.*, p.title as paper_title
FROM notes n
JOIN papers p ON n.paper_id = p.id
WHERE n.user_id = 'user-uuid'
ORDER BY n.created_at DESC;
```

---

## 🔐 Environment Variables Reference

### Required
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key

### Optional
- `NEXT_PUBLIC_TTS_API_URL`: Custom TTS service endpoint
- `TTS_API_KEY`: API key for TTS service

### Docker-specific (Full Stack)
- `POSTGRES_PASSWORD`: Database password
- `JWT_SECRET`: Min 32 chars for JWT signing
- `SUPABASE_ANON_KEY`: Generated anon key
- `SUPABASE_SERVICE_KEY`: Generated service role key

---

## 🚀 Deployment Checklist

### Before Deploying
- [ ] Update environment variables
- [ ] Run database schema in Supabase
- [ ] Create storage buckets (papers, voice-notes, tts-audio)
- [ ] Apply storage policies
- [ ] Test PDF upload
- [ ] Test TTS playback
- [ ] Test voice recording

### Production Considerations
- [ ] Enable Supabase Auth
- [ ] Set up SSL/HTTPS (for PWA and mic access)
- [ ] Configure rate limiting
- [ ] Set up backup strategy
- [ ] Monitor storage usage
- [ ] Set file size limits

---

## 💡 Code Patterns Used

### Server Components
- Pages in `app/` are server components by default
- Fetch data, no client-side JavaScript until needed
- SEO-friendly, fast initial load

### Client Components
- Use `'use client'` directive at top
- All interactive components (buttons, forms)
- All components using hooks (useState, useEffect)

### API Routes
- Follow Next.js App Router conventions
- TypeScript with proper types
- Error handling with try/catch
- Return JSON with NextResponse

### Supabase Usage
- Server-side: Use server client with cookies
- Client-side: Use browser client
- Always check authentication before DB operations
- Let RLS handle authorization

---

## 🎨 Styling Conventions

- **Tailwind CSS**: Utility-first, responsive
- **Dark mode**: `dark:` classes already added
- **Colors**: Blue primary, semantic colors for status
- **Spacing**: Consistent padding/margin scale
- **Components**: Self-contained styling

---

## 📝 Commit Message Format

Follow the format used:
```
Short summary (50 chars)

## Section
- Bullet points
- Detailed changes

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 🔮 Future Architecture Ideas

### Microservices (If Scaling)
- Separate TTS service (already designed for)
- PDF processing service (for OCR, citation parsing)
- Search service (Elasticsearch/Meilisearch)

### State Management
- Currently using React state
- If complex: Consider Zustand or Jotai
- Avoid Redux (overkill for this app)

### Real-time Features
- Supabase Realtime for collaborative editing
- Live cursor positions
- Shared annotations

### Performance
- Implement virtual scrolling for large libraries
- Lazy load PDF pages
- Cache parsed text in IndexedDB
- Service worker caching for offline PDFs

---

## 🆘 Common Issues & Solutions

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### PDF.js worker errors
Check `PdfViewer.tsx` line with `GlobalWorkerOptions.workerSrc`

### Supabase "relation does not exist"
Schema not applied - run `schema.sql` in Supabase SQL Editor

### Docker build fails
Clear Docker cache:
```bash
docker system prune -a
docker-compose build --no-cache
```

### PWA not installing
- Must be HTTPS (or localhost)
- Check manifest.json is valid
- Service worker must register

---

## 📚 Useful Resources

- [Next.js App Router Docs](https://nextjs.org/docs/app)
- [Supabase Docs](https://supabase.com/docs)
- [PDF.js Documentation](https://mozilla.github.io/pdf.js/)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [PWA Guidelines](https://web.dev/progressive-web-apps/)

---

## 🤝 Contributing Guidelines (For Future Self)

1. **Always update types** when changing database schema
2. **Test in Docker** before committing deployment changes
3. **Update this document** when making architectural changes
4. **Write migrations** for database schema changes
5. **Keep documentation in sync** with code changes

---

## 📊 Current Stats

- **Lines of Code**: ~16,000
- **Components**: 8 main components
- **API Routes**: 6 endpoints
- **Database Tables**: 8 tables
- **Docker Images**: 1 (multi-stage)
- **Documentation Files**: 7

---

## 🎯 Next Session Priorities

When resuming development, start with:

1. **Smart Citation Filtering** (highest user value)
   - Implement text parsing in `app/api/papers/upload/route.ts`
   - Add cleaning logic to remove citations
   - Store in `reading_text` column
   - Test with sample papers

2. **Authentication UI** (required for production)
   - Add login/signup pages
   - Protect routes
   - Add user profile

3. **Tags UI** (schema exists, needs frontend)
   - Tag creation modal
   - Tag assignment interface
   - Filter implementation

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0 - MVP Complete
**Next Milestone**: Smart parsing + Auth + Tags = v1.1.0

---

## 💭 Design Philosophy

This project prioritizes:
- **User Experience**: Clean, intuitive interfaces
- **Performance**: Fast loading, responsive interactions
- **Privacy**: Self-hosted option, data ownership
- **Accessibility**: Semantic HTML, keyboard navigation
- **Maintainability**: Clear code structure, comprehensive docs

Happy coding! 🚀
