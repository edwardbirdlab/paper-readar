# Two-Stage LLM Text Processing - Ready to Deploy!

**Date:** 2025-01-15
**Status:** ✅ **IMPLEMENTATION COMPLETE**
**Next Step:** Deploy to dev server

---

## 🎉 Summary

All implementation work is complete! The two-stage LLM text processing system is ready for deployment. Here's what was built:

### Core Services (New)
- ✅ **text-processing** - FastAPI service with Phi-3-mini-128k + Phi-3-medium-128k
- ✅ **text-processing-worker** - BullMQ worker for async job processing

### Integration Changes
- ✅ **docker-compose.yml** - Added new services, removed old text-cleanup
- ✅ **Upload route** - Now async (queues job instead of waiting)
- ✅ **Queue client** - Added text-processing-jobs queue
- ✅ **Database migration** - Adds processing_stage and related fields

### Documentation
- ✅ **CURRENT_WORK.md** - Complete implementation plan
- ✅ **IMPLEMENTATION_PROGRESS.md** - Detailed progress and checklist
- ✅ **Test script** - Validates service structure without loading models

---

## 📦 What Changed

### Files Created (11 new files)

**Services:**
1. `services/text-processing/main.py` (470 lines)
2. `services/text-processing/prompts.py` (181 lines)
3. `services/text-processing/requirements.txt`
4. `services/text-processing/Dockerfile`
5. `services/text-processing/test_service.py` (272 lines)
6. `services/text-processing-worker/src/index.ts` (450 lines)
7. `services/text-processing-worker/package.json`
8. `services/text-processing-worker/tsconfig.json`
9. `services/text-processing-worker/Dockerfile`

**Database:**
10. `database/migrations/002_add_text_processing.sql`

**Documentation:**
11. `IMPLEMENTATION_PROGRESS.md`
12. `READY_TO_DEPLOY.md` (this file)

### Files Modified (3 files)

1. **docker-compose.yml**
   - Added: text-processing service (port 3009)
   - Added: text-processing-worker service
   - Removed: text-cleanup service (old)
   - Updated: app dependencies and environment variables
   - Added: phi3_models_v2 volume
   - Added: migration mount for postgres

2. **app/api/papers/upload/route.ts**
   - Removed: Synchronous text cleanup call (38 lines)
   - Added: Async text processing job queueing (10 lines)
   - Changed: Paper status from tts_status to processing_stage
   - Changed: Response message indicates 2-3 hour processing time

3. **lib/queue/client.ts**
   - Added: textProcessingQueue definition
   - Added: TextProcessingJobData interface
   - Added: addTextProcessingJob() function
   - Updated: closeQueues() to include new queue

---

## 🚀 Deployment Steps

### Step 1: Apply Database Migration

```bash
# Option A: Via Docker (fresh database)
docker-compose down
docker-compose up -d postgres
# Migration will auto-apply on startup

# Option B: Manual apply (existing database)
docker-compose exec postgres psql -U paper_reader -d paper_reader -f /docker-entrypoint-initdb.d/02-text-processing.sql
```

### Step 2: Build New Services

```bash
# Build text-processing service
docker-compose build text-processing

# Build text-processing-worker
docker-compose build text-processing-worker

# Rebuild app (uses updated queue client)
docker-compose build app
```

### Step 3: Start Services

```bash
# Start text-processing service (models will load - takes 5-10 min)
docker-compose up -d text-processing

# Monitor model loading
docker-compose logs -f text-processing

# Wait for: "✓ Both models loaded successfully (~38GB total RAM)"

# Start worker
docker-compose up -d text-processing-worker

# Restart app with new code
docker-compose up -d app
```

### Step 4: Remove Old Service

```bash
# Stop and remove old text-cleanup service
docker-compose rm -f text-cleanup

# Clean up old volume (optional)
docker volume rm paper-reader_phi3_models
```

### Step 5: Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Check text-processing health
curl http://localhost:3009/health

# Should return:
# {
#   "status": "healthy",
#   "stage1_loaded": true,
#   "stage2_loaded": true,
#   "stage1_model": "microsoft/Phi-3-mini-128k-instruct",
#   "stage2_model": "microsoft/Phi-3-medium-128k-instruct",
#   "device": "cpu"
# }

# Check queue is ready
docker-compose exec redis redis-cli KEYS 'bull:text-processing-jobs:*'
```

---

## 🧪 Testing

### Test Upload Flow

1. **Upload a test paper** (10 pages recommended for first test)
   ```bash
   # Via UI at http://localhost:3001
   # Or via API:
   curl -X POST http://localhost:3001/api/papers/upload \
     -F "file=@/path/to/paper.pdf"
   ```

2. **Monitor processing**
   ```bash
   # Watch worker logs
   docker-compose logs -f text-processing-worker

   # Check queue depth
   docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:wait

   # Check paper status in database
   docker-compose exec postgres psql -U paper_reader -d paper_reader \
     -c "SELECT id, title, processing_stage, text_processing_error FROM papers ORDER BY upload_date DESC LIMIT 1;"
   ```

3. **Expected timeline**
   - Upload completes: Immediately
   - Stage 1 (cleanup): 30-60 minutes
   - Stage 2 (reorganization): 60-90 minutes
   - Chunking & TTS queueing: 5-10 seconds
   - Paper status: text_processing → text_completed → tts_processing

### Verify Output Quality

1. **Check chunks created**
   ```bash
   docker-compose exec postgres psql -U paper_reader -d paper_reader \
     -c "SELECT chunk_index, section_title, word_count FROM paper_chunks WHERE paper_id = 'PAPER_ID' ORDER BY chunk_index;"
   ```

2. **Verify section markers**
   - Chunks should have section_title filled
   - Sections should be in order: Abstract, Introduction, Methods, Results, Discussion

3. **Check TTS jobs queued**
   ```bash
   docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait
   ```

---

## 📊 Monitoring Commands

### Resource Usage

```bash
# Monitor RAM usage (should be ~40GB for text-processing)
docker stats text-processing

# Check disk usage
docker system df -v
```

### Queue Health

```bash
# Text processing queue
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:wait
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:active
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:failed

# TTS queue
docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait
docker-compose exec redis redis-cli LLEN bull:tts-jobs:active
```

### Database Queries

```bash
# Papers by processing stage
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT processing_stage, COUNT(*) FROM papers GROUP BY processing_stage;"

# Recent papers with timing
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT title, processing_stage,
      EXTRACT(EPOCH FROM (text_processing_completed_at - text_processing_started_at))/60 as processing_minutes
      FROM papers WHERE text_processing_started_at IS NOT NULL
      ORDER BY upload_date DESC LIMIT 10;"

# Failed papers
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT id, title, text_processing_error FROM papers WHERE processing_stage = 'failed';"
```

---

## 🔧 Troubleshooting

### Models Won't Load

**Symptom:** text-processing service fails to start or times out

**Solutions:**
1. Check RAM available: `free -h` (need ~40GB free)
2. Increase Docker memory limit in Docker Desktop settings
3. Check logs: `docker-compose logs text-processing | tail -100`
4. If download is slow, wait longer (7GB + 14GB = ~21GB to download)

### Worker Not Processing Jobs

**Symptom:** Jobs stuck in queue, worker logs show no activity

**Solutions:**
1. Check worker is running: `docker-compose ps text-processing-worker`
2. Check worker logs: `docker-compose logs -f text-processing-worker`
3. Verify text-processing service is healthy: `curl http://localhost:3009/health`
4. Restart worker: `docker-compose restart text-processing-worker`

### Processing Takes Too Long

**Expected:** 2-3 hours for 20-page paper
**If longer:**
1. Check CPU cores set: `docker-compose exec text-processing printenv CPU_CORES`
2. Monitor CPU usage: `docker stats text-processing`
3. Check if models are using CPU properly (not swapping to disk)

### Papers Stuck in `text_processing`

**Symptom:** Paper never completes, no error

**Solutions:**
1. Check if job failed: `docker-compose exec redis redis-cli HGET bull:text-processing-jobs:text-PAPER_ID failedReason`
2. Check worker logs for errors
3. Manually retry:
   ```sql
   UPDATE papers
   SET processing_stage = 'extracting',
       text_processing_error = NULL
   WHERE id = 'PAPER_ID';
   ```
4. Re-queue job via API (upload again)

---

## ✅ Success Criteria

After deployment, verify:

- [ ] text-processing service healthy (both models loaded)
- [ ] text-processing-worker running
- [ ] Can upload a test paper successfully
- [ ] Paper goes through stages: text_processing → text_completed → tts_processing
- [ ] Chunks created with section_title populated
- [ ] TTS jobs queued after text processing completes
- [ ] Processing time: 2-3 hours for 20-page paper
- [ ] RAM usage: ~40GB for text-processing service
- [ ] No errors in worker logs

---

## 🎯 Next Steps After Deployment

### Short Term (This Week)
1. Process 5-10 test papers of varying lengths
2. Validate section reorganization quality
3. Monitor processing times and RAM usage
4. Tune prompts if needed (adjust temperature, improve instructions)
5. Update frontend to show processing_stage (currently shows old tts_status)

### Medium Term (Next Week)
1. Add progress indicators for text processing (optional)
2. Implement retry UI for failed papers
3. Add admin dashboard for monitoring queues
4. Document prompt tuning process

### Long Term (Future)
1. Consider GPU support for faster processing
2. Add model quantization (int4) to reduce RAM if needed
3. Implement paper pre-processing analysis (estimate processing time)
4. Add support for different paper formats/journals

---

## 📝 Notes

### Model Storage
- Models download to `/app/models` inside container
- Persisted in `phi3_models_v2` Docker volume
- First run will download ~21GB (one-time)
- Subsequent runs load from volume (~5-10 min)

### Processing Capacity
- **Current:** 1 paper at a time (worker concurrency=1)
- **Throughput:** ~8-12 papers per day (2-3 hours each)
- **Scalability:** Can add more workers if needed (would need more RAM)

### Cost Considerations
- **RAM:** ~40GB dedicated to models (always loaded)
- **CPU:** 12 cores recommended for good performance
- **Storage:** ~21GB for models + ~150MB per processed paper
- **Time:** User doesn't wait, but processing is long (2-3 hours)

### Quality Improvements vs Old System
- ✅ Full paper processed in one pass (was chunked before)
- ✅ 128k context window (was 4k)
- ✅ Two-stage approach (cleanup + reorganization)
- ✅ Section detection and reordering
- ✅ Better abbreviation expansion
- ✅ Species name handling
- ✅ Semantic chunking by sections

---

## 🆘 Support

### If Things Go Wrong

1. **Check documentation:**
   - CURRENT_WORK.md - Implementation plan
   - IMPLEMENTATION_PROGRESS.md - Detailed checklist

2. **Common issues:**
   - Models won't load → Check RAM (need 40GB+)
   - Worker stuck → Restart worker, check text-processing health
   - Processing too slow → Check CPU_CORES environment variable

3. **Rollback plan:**
   ```bash
   # If critical issues, can temporarily revert to old system:
   docker-compose stop text-processing text-processing-worker
   # Build and start old text-cleanup service
   # Revert upload route changes
   # Papers already in text_processing will need manual intervention
   ```

---

**Last Updated:** 2025-01-15 (late evening)
**Status:** ✅ Ready for deployment
**Deployed:** Not yet - awaiting server deployment

**Good luck with the deployment! 🚀**
