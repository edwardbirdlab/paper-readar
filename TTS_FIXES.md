# TTS Pipeline Bug Fixes - November 2025

## Summary of Issues Fixed

This document describes the critical bugs that were preventing the TTS pipeline from working correctly and the fixes that were applied.

## Critical Bugs Fixed

### Bug #1: Storage Client Promise Issue ✅ FIXED
**Commit:** 0b7ce17

**Problem:**
- `storage.audio.getUrl()` was declared as `async` but returned a synchronous result
- Called without `await` in `/app/api/papers/[id]/chunks/route.ts` line 38
- Returned Promise objects instead of URL strings to frontend
- Audio playback completely broken

**Symptoms:**
- Frontend shows `[object Promise]` instead of audio URLs
- API returns `audioUrl: {}` instead of string URLs
- No audio can be played

**Root Cause:**
```typescript
// BEFORE (BROKEN):
export const audio = {
  async getUrl(fileName: string): Promise<string> {
    return getPublicUrl(BUCKETS.AUDIO, fileName);  // Synchronous function
  }
}

// Used as:
audioUrl: chunk.audio_file_path
  ? storage.audio.getUrl(chunk.audio_file_path)  // NOT awaited!
  : null
```

**Fix Applied:**
```typescript
// AFTER (FIXED):
export const audio = {
  getUrl(fileName: string): string {  // Now synchronous
    return getPublicUrl(BUCKETS.AUDIO, fileName);
  }
}

// Used as:
audioUrl: chunk.audio_file_path
  ? storage.audio.getUrl(chunk.audio_file_path)  // Works correctly
  : null
```

**Files Changed:**
- `/lib/storage/client.ts` - Made `audio.getUrl()` and `papers.getUrl()` synchronous
- `/app/api/papers/[id]/route.ts` - Removed unnecessary `await`

---

### Bug #2: Database Type Mismatch ✅ FIXED
**Commit:** 3412cfd, 50e1c40

**Problem:**
- Database schema defined `audio_duration` as `INTEGER`
- TTS service returns duration as `float` (e.g., 3.45 seconds)
- Decimal precision lost through truncation
- Inaccurate duration display

**Symptoms:**
- Audio duration 3.7 seconds stored as 3 seconds
- Timeline/progress calculations incorrect
- Loss of precision for all audio files

**Root Cause:**
```sql
-- BEFORE (BROKEN):
audio_duration INTEGER,  -- Truncates decimals

-- TTS service returns:
{
  "duration": 3.7,  // Float with decimals
  ...
}

-- PostgreSQL converts: 3.7 → 3 (precision lost)
```

**Fix Applied:**
```sql
-- AFTER (FIXED):
audio_duration NUMERIC(10, 2),  -- Preserves decimal precision

-- Now stores: 3.7 → 3.70 (preserved)
```

**Files Changed:**
- `/database/schema.sql` - Changed column type to NUMERIC(10, 2)
- `/database/migrations/001_fix_audio_duration_type.sql` - Migration for existing databases
- `/app/api/papers/[id]/chunks/route.ts` - Removed unnecessary parseFloat()

---

### Improvement #1: Enhanced Error Handling ✅ DONE
**Commit:** ec3a12a

**Problem:**
- Generic error messages made debugging difficult
- No timeout handling for TTS service calls
- No validation of TTS service responses
- No health check at worker startup

**Improvements Made:**

1. **Added Timeouts:**
   - TTS generation: 2 minute timeout
   - Audio download: 30 second timeout

2. **Response Validation:**
   ```typescript
   // Validate TTS service response
   if (!ttsResponse.data || !ttsResponse.data.audio_path) {
     throw new Error('Invalid TTS service response: missing audio_path');
   }

   // Validate downloaded audio
   if (!audioResponse.data || audioResponse.data.byteLength === 0) {
     throw new Error('Downloaded audio file is empty');
   }
   ```

3. **Error Categorization:**
   - TTS Service Unavailable (ECONNREFUSED)
   - Timeout errors
   - TTS Service errors (with HTTP status codes)
   - Storage errors (MinIO)

4. **TTS Health Check:**
   ```typescript
   // Check TTS service at startup
   const healthCheck = await axios.get(`${config.tts.serviceUrl}/health`);
   logger.info(`TTS service connected successfully. Status: ${healthCheck.data.status}`);
   ```

5. **Enhanced Logging:**
   - File sizes logged for uploads
   - Duration and sample rate logged for generated audio
   - Detailed error context in logs

**Files Changed:**
- `/services/tts-worker/src/index.ts` - All error handling improvements

---

## Verification Tests

### Test 1: Audio URL Generation
```bash
# Upload a paper
PAPER_ID=$(curl -X POST http://localhost:3001/api/papers/upload \
  -F "file=@test.pdf" | jq -r '.id')

# Wait for first chunk to complete
sleep 60

# Check audio URLs
curl http://localhost:3001/api/papers/$PAPER_ID/chunks | \
  jq '.chunks[0].audioUrl'

# Expected: "http://localhost:3003/audio/{paperId}/0.wav"
# NOT: {} or [object Promise]
```

### Test 2: Audio Duration Precision
```bash
# Check database directly
docker compose exec postgres psql -U paper_reader -d paper_reader -c \
  "SELECT chunk_index, audio_duration FROM paper_chunks WHERE paper_id='$PAPER_ID' LIMIT 5;"

# Expected: Decimal values like 3.45, 12.78, etc.
# NOT: Integer values like 3, 12, etc.
```

### Test 3: Error Messages
```bash
# Stop TTS service to trigger error
docker compose stop tts-service

# Upload paper (will fail)
curl -X POST http://localhost:3001/api/papers/upload -F "file=@test.pdf"

# Check error message in database
docker compose exec postgres psql -U paper_reader -d paper_reader -c \
  "SELECT tts_error FROM papers ORDER BY created_at DESC LIMIT 1;"

# Expected: "[TTS Service Unavailable] Cannot connect to TTS service at http://tts-service:8000"
# NOT: Generic "Error" or empty
```

---

## Migration Instructions

### For New Deployments
Simply use the updated `database/schema.sql`. All fixes are included.

### For Existing Deployments

1. **Stop the stack:**
   ```bash
   docker compose down
   ```

2. **Pull latest code:**
   ```bash
   git pull origin main
   ```

3. **Apply database migration:**
   ```bash
   docker compose up -d postgres
   docker compose exec postgres psql -U paper_reader -d paper_reader \
     -f /docker-entrypoint-initdb.d/migrations/001_fix_audio_duration_type.sql
   ```

4. **Rebuild and restart:**
   ```bash
   docker compose up -d --build
   ```

5. **Verify fixes:**
   Follow the verification tests above.

---

## Before & After Comparison

### Audio URL Response
```json
// BEFORE (BROKEN):
{
  "chunks": [
    {
      "chunkIndex": 0,
      "audioUrl": {},  // Promise object
      "audioDuration": 3  // Lost precision
    }
  ]
}

// AFTER (FIXED):
{
  "chunks": [
    {
      "chunkIndex": 0,
      "audioUrl": "http://localhost:3003/audio/abc-123/0.wav",  // Valid URL
      "audioDuration": 3.45  // Preserved precision
    }
  ]
}
```

### Error Messages
```
// BEFORE (GENERIC):
Error: Request failed with status code 500

// AFTER (CATEGORIZED):
[TTS Service Error] TTS service returned 500: Internal server error - Kokoro model not loaded
```

---

## Known Limitations & Future Improvements

### Current Limitations
1. No retry mechanism for partially failed papers
2. No progress tracking during TTS generation
3. Cannot change voice per paper (fixed to af_sarah)
4. No way to regenerate single chunks

### Planned Improvements
1. Add retry button for failed chunks in UI
2. Real-time progress via WebSocket
3. Voice selection in upload form
4. Chunk-level regeneration API

---

## Troubleshooting

### Issue: Audio URLs still showing as Promise objects

**Cause:** Old built code cached

**Solution:**
```bash
docker compose down
docker compose up -d --build app
```

---

### Issue: Audio duration still showing as integers

**Cause:** Migration not applied

**Solution:**
```bash
docker compose exec postgres psql -U paper_reader -d paper_reader -c \
  "ALTER TABLE paper_chunks ALTER COLUMN audio_duration TYPE NUMERIC(10, 2);"
```

---

### Issue: TTS worker not processing jobs

**Cause:** TTS service not ready

**Solution:**
```bash
# Check TTS service logs
docker compose logs tts-service | tail -50

# Look for "Kokoro model loaded successfully"
# First startup downloads ~2GB models (5-10 minutes)

# Check worker can connect
docker compose logs tts-worker | grep "TTS service connected"
```

---

## Commit History

| Commit | Description | Impact |
|--------|-------------|--------|
| 0b7ce17 | Fix: Make storage getUrl() synchronous | ✅ Audio URLs work |
| 3412cfd | Fix: Change audio_duration to NUMERIC | ✅ Precision preserved |
| 50e1c40 | Add: Database migration script | 🔧 Existing DBs supported |
| ec3a12a | Improve: Enhanced error handling | 📊 Better debugging |

---

## Summary

All critical bugs have been fixed:
- ✅ Audio URLs generate correctly (no more Promise objects)
- ✅ Audio duration precision preserved
- ✅ Better error messages and debugging
- ✅ TTS service health monitoring

The TTS pipeline should now work end-to-end. Follow the verification tests to confirm.
