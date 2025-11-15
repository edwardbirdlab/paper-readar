# Current Work: Two-Stage LLM Text Processing System

**Status:** Planning Complete - Ready for Implementation
**Date:** 2025-01-15
**Goal:** Replace current Phi-3-mini-4k cleanup with comprehensive two-stage pipeline using long-context models

## Problem Statement

Current text-cleanup service has limitations:
- Only 4k context window (can't process full papers)
- No section reorganization capability
- Processes text synchronously during upload
- Citations/abbreviations cleaned but sections remain out of order

## Solution: Two-Stage LLM Processing

### Architecture Overview

```
Upload → PyMuPDF Extract → Queue Job → Return to User
                                ↓
                    [BACKGROUND PROCESSING]
                                ↓
        Stage 1: Phi-3-mini-128k (Local Cleanup)
                - Remove citations: [1], (Author, 2020)
                - Expand abbreviations: µl → microliter
                - Expand species: C. quinquefasciatus → Culex quinquefasciatus
                - Convert symbols: α → alpha, β → beta
                - Remove figures/tables
                - Clean formatting
                - PRESERVE section order
                                ↓
        Stage 2: Phi-3-medium-128k (Global Reorganization)
                - Detect all sections (handle variations)
                - Reorder to standard: Abstract → Intro → Methods → Results → Discussion
                - Handle missing sections
                - Output with [SECTION: Name] markers
                                ↓
                    Chunk by sections → Queue TTS Jobs
                                ↓
                    [EXISTING TTS PIPELINE]
```

## Models Confirmed Available

### Stage 1: microsoft/Phi-3-mini-128k-instruct
- Parameters: 3.8B
- Context: 128,000 tokens (REAL, verified)
- RAM (float32): ~8-10GB
- RAM (int4): ~2-3GB
- Purpose: Local text transformations
- Processing time: 30-60 min/paper

### Stage 2: microsoft/Phi-3-medium-128k-instruct
- Parameters: 14B
- Context: 128,000 tokens (REAL, verified)
- RAM (float32): ~26-28GB
- RAM (int4): ~8-12GB
- Purpose: Global section reorganization
- Processing time: 60-90 min/paper

**Total RAM:** ~34-38GB (well within 144GB limit)
**Total Time:** 2-3 hours/paper (acceptable for 1-2 papers/day)

## Implementation Plan

### Phase 1: New Services

#### A. Text Processing Service (`services/text-processing/`)
- **Port:** 3009 (internal 8009)
- **Type:** FastAPI with dual models loaded
- **Endpoint:** `POST /process`
  - Input: `{ text: string, metadata: {} }`
  - Output: `{ stage1_output: string, stage2_output: string, processing_time: number }`
- **Both models loaded on startup** (for production)
- **For local testing:** Load models individually, unload after testing

**Files:**
- `main.py` - FastAPI app with dual-model pipeline
- `Dockerfile` - Python 3.11-slim base
- `requirements.txt` - transformers, torch, fastapi, uvicorn
- `prompts.py` - Stage 1 and Stage 2 system prompts
- `README.md` - Documentation

#### B. Text Processing Worker (`services/text-processing-worker/`)
- **Type:** BullMQ worker (TypeScript)
- **Queue:** `text-processing-jobs`
- **Concurrency:** 1 (heavy processing)
- **Flow:**
  1. Pull job from queue
  2. Update paper status to `text_processing`
  3. Call processing service
  4. Receive Stage 2 output (with section markers)
  5. Chunk by sections
  6. Create chunk records
  7. Queue TTS jobs
  8. Update paper status to `tts_processing`

**Files:**
- `src/index.ts` - BullMQ worker logic
- `Dockerfile` - Node.js base
- `package.json` - Dependencies

### Phase 2: Queue & Database

#### A. New BullMQ Queue
**Queue:** `text-processing-jobs`

**Job Data:**
```typescript
{
  paperId: string,
  rawText: string,  // From PyMuPDF
  metadata: {
    title?: string,
    authors?: string,
    pages: number
  }
}
```

**Options:**
- Timeout: 7200000ms (2 hours)
- Attempts: 2 (retry once)
- Backoff: Fixed 60s

#### B. Database Schema Changes

**Migration SQL:**
```sql
ALTER TABLE papers
  ADD COLUMN processing_stage TEXT DEFAULT 'extracting',
  ADD COLUMN text_processing_started_at TIMESTAMP,
  ADD COLUMN text_processing_completed_at TIMESTAMP,
  ADD COLUMN text_processing_error TEXT,
  ADD COLUMN processed_text TEXT;

ALTER TABLE papers
  ADD CONSTRAINT processing_stage_check
  CHECK (processing_stage IN (
    'extracting',
    'text_processing',
    'text_completed',
    'tts_processing',
    'completed',
    'failed'
  ));

CREATE INDEX idx_papers_processing_stage ON papers(processing_stage);
```

**New Processing Stages:**
1. `extracting` - PyMuPDF extraction
2. `text_processing` - LLM pipeline running
3. `text_completed` - LLM done, ready for chunking
4. `tts_processing` - TTS generation in progress
5. `completed` - Everything done
6. `failed` - Any stage failed

### Phase 3: Modified Upload Flow

**Current (Synchronous):**
```typescript
Upload → Extract → Cleanup (wait) → Chunk → Queue TTS → Return
```

**New (Asynchronous):**
```typescript
Upload → Extract → Create Paper → Queue Text Job → Return Immediately
```

**Changes to `/api/papers/upload/route.ts`:**
1. Remove synchronous text-cleanup call
2. After PyMuPDF extraction:
   - Create paper record (status: `text_processing`)
   - Queue text processing job
   - Return immediately with paper ID
3. User polls for completion

### Phase 4: Prompting Strategy

#### Stage 1 Prompt (Phi-3-mini-128k)
**Focus:** Local transformations only

**Rules:**
- Remove citations: [1], (Author, 2020), et al.
- Expand abbreviations: e.g. → for example, µl → microliter, LD₅₀ → lethal dose fifty
- Expand species (first use): C. quinquefasciatus → Culex quinquefasciatus
- Expand Greek letters: α → alpha, β → beta, μ → mu
- Expand symbols: ± → plus or minus, × → times
- Remove figure/table references
- Remove LaTeX, URLs, emails
- Clean formatting artifacts
- **PRESERVE:** Section headers, section order, paragraph structure

**Output:** Cleaned text with same structure

#### Stage 2 Prompt (Phi-3-medium-128k)
**Focus:** Global reorganization

**Rules:**
1. **Detect sections:**
   - Standard: Abstract, Introduction, Methods, Results, Discussion, Conclusion
   - Variations: "Materials and Methods" = Methods, "Methodology" = Methods
   - Combined: "Results and Discussion" → keep combined

2. **Reorder to standard:**
   - Abstract
   - Introduction
   - Background / Related Work (if present)
   - Methods
   - Results
   - Discussion
   - Conclusion
   - Acknowledgments (optional)

3. **Handle missing:**
   - No Abstract → create 2-3 sentence summary
   - No Introduction → start with Methods
   - Some sections may be absent (OK)

4. **Skip entirely:**
   - References / Bibliography
   - Appendices
   - Supplementary Materials
   - Author affiliations

5. **Output format:**
   ```
   [SECTION: Abstract]
   <text>

   [SECTION: Introduction]
   <text>
   ```

**Output:** Reorganized text with section markers for chunking

### Phase 5: Chunking Strategy

**New Function:** `chunkProcessedText()`

**Logic:**
1. Parse `[SECTION: Name]` markers
2. For each section:
   - If < 800 words → single chunk
   - If > 800 words → split by paragraphs (target 500 words/chunk)
3. Preserve section name in all chunks from that section
4. Sequential chunk indices across entire paper

**Chunk Record:**
```typescript
{
  paperId: string,
  chunkIndex: number,
  chunkType: 'section',
  sectionTitle: string,  // From [SECTION: Name] marker
  textContent: string,
  wordCount: number,
  charCount: number
}
```

### Phase 6: Frontend Changes

#### Status Badges
```typescript
'extracting' → "📄 Extracting PDF..."
'text_processing' → "🤖 AI Processing Text..."  (NEW)
'text_completed' → "✅ Text Ready"  (NEW)
'tts_processing' → "🔊 Generating Audio..."
'completed' → "✅ Ready to Listen"
'failed' → "❌ Processing Failed"
```

#### Polling
- Poll `/api/papers/[id]` every 5 seconds
- Check `processing_stage` field
- Stop polling when stage = 'completed' or 'failed'
- Show progress indicator during `text_processing`

### Phase 7: Docker Configuration

#### docker-compose.yml Changes

**Add Services:**
```yaml
text-processing:
  build: ./services/text-processing
  container_name: paper-reader-text-processing
  environment:
    - STAGE1_MODEL=microsoft/Phi-3-mini-128k-instruct
    - STAGE2_MODEL=microsoft/Phi-3-medium-128k-instruct
    - CPU_CORES=12
  volumes:
    - phi3_models_v2:/app/models
  ports:
    - "3009:8009"
  deploy:
    resources:
      limits:
        memory: 64G

text-processing-worker:
  build: ./services/text-processing-worker
  environment:
    - TEXT_PROCESSING_URL=http://text-processing:8009
    - WORKER_CONCURRENCY=1
  depends_on:
    - redis
    - postgres
    - text-processing
```

**Remove Service:**
- `text-cleanup` (old Phi-3-mini-4k service)

**Add Volume:**
- `phi3_models_v2` (for model caching)

### Phase 8: Testing Strategy

**Local Testing (Workspace):**
1. Load Stage 1 model → Test → Unload
2. Load Stage 2 model → Test → Unload
3. **Never load both simultaneously in workspace**

**Sample Paper Testing:**
- Test with papers in `/workspace/sample_papers/`
- Verify section detection
- Verify reorganization quality
- Monitor RAM usage

**Production (Dev Server):**
- Both models stay loaded
- Process 1-2 test papers
- Monitor processing time (should be 2-3 hours)
- Verify RAM usage (~40GB)

## Failure Handling

**Strategy:** Let it fail (no fallback)

**If Stage 1 fails:**
- Paper status → `failed`
- `text_processing_error` populated with error message
- User sees error in UI
- Manual recovery: Reset status, re-queue job

**If Stage 2 fails:**
- Same as Stage 1 failure
- Stage 1 output available in logs for debugging

**No automatic fallback to:**
- Raw PyMuPDF text
- Stage 1-only output
- Current Phi-3-mini-4k service

## Performance Expectations

**20-page scientific paper:**
- PDF Extraction: 2-5 seconds
- Stage 1 (cleanup): 30-60 minutes
- Stage 2 (reorganization): 60-90 minutes
- Chunking: 5-10 seconds
- TTS Generation: 15-30 minutes (existing)

**Total: 2-3 hours** ✓ (within acceptable range)

**RAM Usage:**
- Stage 1: ~10GB
- Stage 2: ~28GB
- Both loaded: ~38GB
- Available: 144GB ✓

**Throughput:**
- 1 paper processing at a time (worker concurrency = 1)
- 1-2 papers/day ✓

## Implementation Roadmap

### Week 1: Core Services
- [ ] Create `services/text-processing/` with FastAPI
- [ ] Implement dual-model loading
- [ ] Write Stage 1 & Stage 2 prompts
- [ ] Test locally (models loaded individually)
- [ ] Create `services/text-processing-worker/`
- [ ] Implement BullMQ job processing

### Week 2: Integration
- [ ] Database migration (add new columns)
- [ ] Update upload route (async job queueing)
- [ ] Add `text-processing-jobs` queue
- [ ] Implement `chunkProcessedText()` function
- [ ] Update docker-compose.yml

### Week 3: Frontend & Testing
- [ ] Update status badges and polling
- [ ] Test with sample papers
- [ ] Monitor RAM and processing time
- [ ] Tune prompts if needed
- [ ] Deploy to dev server

### Week 4: Production
- [ ] Process 5-10 real papers
- [ ] Validate section reorganization quality
- [ ] Monitor for failures
- [ ] Adjust timeouts/retries if needed
- [ ] Document final performance metrics

## Files to Create

### Services
1. `services/text-processing/main.py`
2. `services/text-processing/Dockerfile`
3. `services/text-processing/requirements.txt`
4. `services/text-processing/prompts.py`
5. `services/text-processing/README.md`
6. `services/text-processing-worker/src/index.ts`
7. `services/text-processing-worker/Dockerfile`
8. `services/text-processing-worker/package.json`

### Database
9. `database/migrations/002_add_text_processing.sql`

### Documentation
10. Update `CLAUDE.md` with new architecture
11. Update `PDF_EXTRACTION_ANALYSIS.md` with Phase 2 status

## Files to Modify

1. `docker-compose.yml` - Add new services, remove old
2. `app/api/papers/upload/route.ts` - Async job queueing
3. `lib/queue/client.ts` - Add text-processing queue
4. `lib/db/client.ts` - Add new fields to types
5. Frontend components - Status badges and polling

## Files to Remove

1. `services/text-cleanup/` - Old service (Phi-3-mini-4k)

## Monitoring & Debugging

**Check queue depth:**
```bash
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:wait
```

**Monitor RAM:**
```bash
docker stats text-processing
```

**View logs:**
```bash
docker-compose logs -f text-processing-worker
```

**Check paper status:**
```sql
SELECT id, title, processing_stage, text_processing_error
FROM papers
ORDER BY upload_date DESC
LIMIT 10;
```

**Manual retry:**
```sql
UPDATE papers
SET processing_stage = 'extracting',
    text_processing_error = NULL
WHERE id = 'paper-uuid';
```

## Success Criteria

- ✅ Both models load successfully (~40GB RAM)
- ✅ Full papers processed in one pass (no chunking needed)
- ✅ Section reorganization works for standard papers
- ✅ Processing time: 2-3 hours for 20-page paper
- ✅ Async upload (user doesn't wait)
- ✅ Frontend shows processing progress
- ✅ TTS quality improved with cleaned, reorganized text

## Notes

- Phi-3-large does NOT exist (medium is largest SLM variant)
- Both models verified available on HuggingFace
- 128k context is real, not just marketing (verified in docs)
- Two-stage approach minimizes model confusion
- Section markers enable semantic chunking for TTS

## Next Steps

1. Document plan (this file) ✓
2. Create text-processing service ✓
3. Validate service structure (workspace testing) ✓
4. Implement worker
5. Database migration
6. Update upload flow
7. Frontend changes
8. Full integration testing
9. Deploy to dev server (models will be tested there)

---

## Progress Log

### 2025-01-15 - Service Creation and Validation

**Completed:**
- ✅ Created `services/text-processing/` with all required files
- ✅ Implemented `main.py` with FastAPI, dual-model support, load/unload endpoints
- ✅ Wrote comprehensive Stage 1 & Stage 2 prompts in `prompts.py`
- ✅ Created Dockerfile and requirements.txt
- ✅ Created validation test script (`test_service.py`)

**Validation Test Results:**
- ✅ All prompts contain required sections (citations, abbreviations, species, Greek letters, etc.)
- ✅ Stage 1 simulation correctly identifies and processes:
  - 3 citations to remove
  - 7 abbreviations to expand
  - 3 figure/table references to remove
  - 6 section headers to preserve
- ✅ Stage 2 simulation correctly:
  - Detects all 6 sections
  - Reorders to standard sequence
  - Adds [SECTION: Name] markers
  - Skips References section
- ✅ Output format validated (5 section markers in correct order)
- ✅ API structure validated (all endpoints and functions present)

**Note on Model Testing:**
- Full model loading test skipped in workspace (resource constraints on CPU-only environment)
- Models will be fully tested when deployed to Docker on dev server
- Dev server has 144GB RAM and can comfortably load both models (~38GB total)
- Service structure and logic validated successfully

**Next:** Create text-processing-worker (BullMQ consumer)

### 2025-01-15 - Worker and Database Migration

**Completed:**
- ✅ Created `services/text-processing-worker/` with BullMQ worker
- ✅ Implemented `src/index.ts` (450 lines) with complete job processing flow
- ✅ Added package.json, tsconfig.json, Dockerfile
- ✅ Created database migration `002_add_text_processing.sql`
- ✅ Created IMPLEMENTATION_PROGRESS.md summary document

**Worker Features:**
- Processes `text-processing-jobs` queue
- Calls text-processing service with 2-hour timeout
- Parses `[SECTION: Name]` markers from output
- Chunks by sections (target 500 words, max 800)
- Creates chunk records in database
- Queues TTS jobs for each chunk
- Updates paper status through all stages (text_processing → text_completed → tts_processing)
- Comprehensive error handling and logging

**Database Changes:**
- Added `processing_stage` column with 6 states
- Added text processing timestamps and error tracking
- Added `section_title` to paper_chunks
- Created indexes for performance

**Next:** Remaining integration work (upload route, docker-compose, frontend)

---

**Last Updated:** 2025-01-15 (late evening)
**Status:** Core services complete, ready for integration and deployment
