# Supabase Setup Instructions

## 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Create a new project
3. Wait for the database to be provisioned

## 2. Run the Database Schema

1. Open the SQL Editor in your Supabase dashboard
2. Copy the contents of `schema.sql`
3. Paste and run the SQL to create all tables and policies

## 3. Configure Storage Buckets

In the Supabase Storage section, create three buckets:

### Bucket: `papers`
- **Purpose**: Store PDF files
- **Public**: No
- **File size limit**: 50 MB (adjust as needed)
- **Allowed MIME types**: `application/pdf`

#### Storage Policies for `papers` bucket:
```sql
-- SELECT: Users can read their own files
CREATE POLICY "Users can view their own papers"
ON storage.objects FOR SELECT
USING (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- INSERT: Users can upload files
CREATE POLICY "Users can upload papers"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- UPDATE: Users can update their own files
CREATE POLICY "Users can update their own papers"
ON storage.objects FOR UPDATE
USING (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1]);

-- DELETE: Users can delete their own files
CREATE POLICY "Users can delete their own papers"
ON storage.objects FOR DELETE
USING (bucket_id = 'papers' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Bucket: `voice-notes`
- **Purpose**: Store voice note recordings
- **Public**: No
- **File size limit**: 10 MB
- **Allowed MIME types**: `audio/webm`, `audio/mp4`, `audio/wav`

#### Storage Policies for `voice-notes` bucket:
```sql
-- Similar policies as papers bucket, but for voice-notes
CREATE POLICY "Users can view their own voice notes"
ON storage.objects FOR SELECT
USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload voice notes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own voice notes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own voice notes"
ON storage.objects FOR DELETE
USING (bucket_id = 'voice-notes' AND auth.uid()::text = (storage.foldername(name))[1]);
```

### Bucket: `tts-audio`
- **Purpose**: Store pre-processed TTS audio files
- **Public**: No
- **File size limit**: 100 MB (papers can have large audio files)
- **Allowed MIME types**: `audio/mpeg`, `audio/mp3`, `audio/wav`

#### Storage Policies for `tts-audio` bucket:
```sql
-- Similar policies as papers bucket, but for tts-audio
CREATE POLICY "Users can view their own TTS audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'tts-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can upload TTS audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tts-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own TTS audio"
ON storage.objects FOR UPDATE
USING (bucket_id = 'tts-audio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own TTS audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'tts-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## 4. Get Your API Credentials

1. Go to Project Settings > API
2. Copy your project URL and anon/public key
3. Create a `.env.local` file in the project root:

```bash
cp .env.example .env.local
```

4. Fill in your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

## 5. Enable Email Authentication (Optional)

1. Go to Authentication > Providers
2. Enable Email provider
3. Configure email templates if desired

## 6. Test the Connection

Run the development server and verify the Supabase connection:

```bash
npm run dev
```

The app should now be able to connect to Supabase!

## Database Schema Overview

The database includes the following main tables:

- **papers**: Store paper metadata and extracted text
- **tags**: Organize papers with custom tags
- **paper_tags**: Many-to-many relationship for tags
- **highlights**: Text selections in papers
- **notes**: Text and voice notes (with position tracking)
- **audio_sessions**: Track TTS playback sessions
- **reading_history**: Track reading progress and time spent

All tables have Row Level Security (RLS) enabled to ensure users can only access their own data.
