# Deployment Quick Reference

**Status:** ✅ Ready to Deploy | **Date:** 2025-01-15

## Pre-Deployment Checklist

- [ ] Read READY_TO_DEPLOY.md (full deployment guide)
- [ ] Verify dev server has 40GB+ RAM available
- [ ] Backup database (recommended)
- [ ] Ensure Docker has sufficient memory limit (64GB+)

## 5-Step Deployment

```bash
# Step 1: Apply database migration (auto-applies on postgres startup)
docker-compose down
docker-compose up -d postgres

# Step 2: Build new services
docker-compose build text-processing text-processing-worker app

# Step 3: Start text-processing (models will load - takes 5-10 min)
docker-compose up -d text-processing

# Monitor model loading:
docker-compose logs -f text-processing
# Wait for: "✓ Both models loaded successfully (~38GB total RAM)"

# Step 4: Start worker and app
docker-compose up -d text-processing-worker app

# Step 5: Verify deployment
curl http://localhost:3009/health
# Should return: {"status": "healthy", "stage1_loaded": true, "stage2_loaded": true}
```

## Quick Health Checks

```bash
# All services running?
docker-compose ps

# Text-processing healthy?
curl http://localhost:3009/health

# Worker processing jobs?
docker-compose logs -f text-processing-worker | tail -20

# Queue empty or has jobs?
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:wait

# RAM usage (~40GB expected)?
docker stats text-processing --no-stream
```

## Test Upload

```bash
# Via UI: http://localhost:3001
# Upload a 10-page test paper

# Monitor processing:
docker-compose logs -f text-processing-worker

# Check paper status:
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT id, title, processing_stage FROM papers ORDER BY upload_date DESC LIMIT 1;"

# Expected stages:
# text_processing (2-3 hours) → text_completed → tts_processing → completed
```

## Troubleshooting

**Models won't load:**
```bash
# Check RAM:
free -h
# Need 40GB+ free

# Check logs:
docker-compose logs text-processing | tail -100

# Increase Docker memory limit in Docker Desktop settings
```

**Worker not processing:**
```bash
# Check worker running:
docker-compose ps text-processing-worker

# Restart worker:
docker-compose restart text-processing-worker

# Check service healthy:
curl http://localhost:3009/health
```

**Papers stuck in text_processing:**
```bash
# Check failed jobs:
docker-compose exec redis redis-cli LLEN bull:text-processing-jobs:failed

# View worker errors:
docker-compose logs text-processing-worker | grep -i error

# Check database for errors:
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT id, title, text_processing_error FROM papers WHERE processing_stage = 'failed';"
```

## Expected Performance

- **Model loading:** 5-10 minutes (one-time per restart)
- **Stage 1 processing:** 30-60 minutes per paper
- **Stage 2 processing:** 60-90 minutes per paper
- **Total time:** 2-3 hours for 20-page paper
- **RAM usage:** ~38GB (text-processing service)
- **Throughput:** 8-12 papers per day (1 at a time)

## Success Criteria

After deployment, verify:

- [ ] text-processing service shows both models loaded
- [ ] text-processing-worker is running
- [ ] Can upload test paper successfully
- [ ] Paper progresses through stages: text_processing → text_completed → tts_processing
- [ ] Chunks created with section_title populated
- [ ] TTS jobs queued after text processing
- [ ] Processing time ~2-3 hours for 20-page paper
- [ ] RAM usage ~40GB for text-processing
- [ ] No errors in logs

## Rollback Plan

If critical issues occur:

```bash
# Stop new services:
docker-compose stop text-processing text-processing-worker

# Revert docker-compose.yml changes (git revert)
# Revert upload route changes (git revert)
# Restart old services:
docker-compose up -d

# Note: Papers in text_processing stage will need manual intervention
```

## Key Files

- **READY_TO_DEPLOY.md** - Full deployment guide with troubleshooting
- **IMPLEMENTATION_COMPLETE.md** - Complete implementation summary
- **CURRENT_WORK.md** - Architecture and design decisions
- **IMPLEMENTATION_PROGRESS.md** - Detailed implementation progress

## Support Commands

```bash
# View all queues:
docker-compose exec redis redis-cli KEYS 'bull:*'

# Papers by stage:
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT processing_stage, COUNT(*) FROM papers GROUP BY processing_stage;"

# Recent processing times:
docker-compose exec postgres psql -U paper_reader -d paper_reader \
  -c "SELECT title,
      EXTRACT(EPOCH FROM (text_processing_completed_at - text_processing_started_at))/60 as minutes
      FROM papers
      WHERE text_processing_started_at IS NOT NULL
      ORDER BY upload_date DESC LIMIT 10;"

# Restart everything:
docker-compose restart text-processing text-processing-worker app
```

## Port Reference

- **3001** - Next.js App (frontend + API)
- **3002** - PostgreSQL
- **3003** - MinIO API
- **3004** - MinIO Console
- **3005** - Redis
- **3006** - TTS Service
- **3009** - Text Processing Service (NEW)

---

**For complete details, see READY_TO_DEPLOY.md**

Last Updated: 2025-01-15
