# Testing and Deployment Guide

This guide covers testing, deploying, and troubleshooting the Scientific Paper Reader application with the local PostgreSQL, MinIO, and Kokoro TTS stack.

## Prerequisites

- Docker and Docker Compose installed
- At least 8GB RAM available for Docker
- At least 10GB free disk space
- Node.js 18+ (for local development testing)

## Quick Start

### 1. Start the Docker Stack

```bash
# Start all services
docker-compose up -d

# Check that all services are running
docker-compose ps
```

Expected output - all services should be "healthy" or "running":
```
NAME                  STATUS
postgres              Up (healthy)
minio                 Up (healthy)
redis                 Up (healthy)
tts-service           Up (healthy)
tts-worker            Up
app                   Up
```

### 2. Verify Services

#### PostgreSQL
```bash
# Check PostgreSQL logs
docker-compose logs postgres

# Connect to PostgreSQL
docker-compose exec postgres psql -U paperreader -d paperreader -c "\dt"
```

Expected tables: `papers`, `paper_chunks`, `notes`, `tags`, `paper_tags`, `highlights`

#### MinIO
```bash
# Check MinIO is accessible
curl http://localhost:9000/minio/health/live

# Access MinIO Console: http://localhost:9001
# Login: minioadmin / minioadmin
```

Expected buckets: `papers`, `audio`, `voice-notes`

#### Redis
```bash
# Check Redis connection
docker-compose exec redis redis-cli ping
```

Expected: `PONG`

#### TTS Service
```bash
# Check TTS service health
curl http://localhost:8000/health

# List available voices
curl http://localhost:8000/voices
```

Expected: JSON response with health status and available voices

#### TTS Worker
```bash
# Check worker logs
docker-compose logs tts-worker

# Should see: "Worker started and waiting for jobs..."
```

#### Next.js Application
```bash
# Check application logs
docker-compose logs app

# Access application: http://localhost:3000
```

## Complete Workflow Test

### Test 1: Upload a Paper

1. Navigate to http://localhost:3000/upload
2. Upload a PDF file (or use one from `public/example-papers/`)
3. Verify success message appears
4. Note the paper ID from the response

Expected: Paper uploaded successfully, TTS processing started

### Test 2: Monitor TTS Processing

```bash
# Check TTS worker logs
docker-compose logs -f tts-worker

# You should see job processing messages like:
# "Processing TTS job for paper abc123, chunk 0"
# "Chunk audio generated: papers/abc123/chunk_0.wav"
# "Chunk abc123 completed in 5.2s"
```

Monitor the queue:
```bash
# Connect to Redis
docker-compose exec redis redis-cli

# Check queue length
> LLEN bull:tts-jobs:wait

# Check failed jobs
> LLEN bull:tts-jobs:failed
```

### Test 3: Verify Audio Generation

1. Check MinIO for generated audio files:
```bash
# List audio files for a paper
docker-compose exec minio mc ls local/audio/
```

2. Navigate to http://localhost:3000/papers/[paper-id]
3. Wait for TTS processing to complete (progress indicator should show)
4. Click the audio player controls
5. Verify audio plays correctly

Expected: Audio chunks play sequentially with proper navigation controls

### Test 4: Add Notes

1. On the paper reader page, click "Add Note"
2. Enter text or record voice note
3. Save the note
4. Verify note appears in the sidebar

Expected: Notes save correctly and display

### Test 5: Search Papers

1. Navigate to http://localhost:3000/library
2. Use the search box to search for keywords
3. Verify relevant papers appear

Expected: Full-text search returns matching papers

## Environment Variables

Create `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://paperreader:paperreader@postgres:5432/paperreader

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# TTS Service
TTS_SERVICE_URL=http://tts-service:8000

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Performance Testing

### Test TTS Generation Speed

```bash
# Time a single TTS job
time curl -X POST http://localhost:8000/generate \
  -H "Content-Type: application/json" \
  -d '{"text": "This is a test of the text to speech system.", "voice": "af_sarah"}'
```

Expected: Response in 2-10 seconds depending on text length

### Monitor Resource Usage

```bash
# Check Docker resource usage
docker stats

# Check specific service
docker stats tts-service tts-worker
```

Expected CPU and memory usage:
- TTS Service: 50-200% CPU during generation (multi-core), 2-4GB RAM
- TTS Worker: Low CPU when idle, spikes during job processing
- PostgreSQL: Low CPU, 200-500MB RAM
- MinIO: Low CPU, 200-500MB RAM

### Test Concurrent Processing

```bash
# Upload multiple papers simultaneously
# The TTS worker should process jobs sequentially
# Check queue depth:
docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait
```

## Troubleshooting

### Issue: Services won't start

**Check Docker logs:**
```bash
docker-compose logs [service-name]
```

**Common causes:**
- Port conflicts (3000, 5432, 6379, 8000, 9000, 9001 already in use)
- Insufficient RAM
- Database initialization failure

**Solution:**
```bash
docker-compose down -v  # Remove volumes
docker-compose up -d    # Restart
```

### Issue: TTS processing stuck

**Check worker status:**
```bash
docker-compose logs tts-worker
```

**Check Redis queue:**
```bash
docker-compose exec redis redis-cli
> LLEN bull:tts-jobs:wait
> LLEN bull:tts-jobs:active
> LLEN bull:tts-jobs:failed
```

**Restart worker:**
```bash
docker-compose restart tts-worker
```

### Issue: Audio not playing

**Check MinIO:**
1. Access MinIO Console: http://localhost:9001
2. Check `audio` bucket for files
3. Verify file permissions (should be public-read)

**Check browser console:**
- Open DevTools → Console
- Look for 404 errors or CORS issues

**Verify audio URLs:**
```bash
# Check paper chunks endpoint
curl http://localhost:3000/api/papers/[paper-id]/chunks
```

### Issue: Database connection errors

**Check connection string:**
```bash
# From within app container
docker-compose exec app env | grep DATABASE_URL
```

**Test connection:**
```bash
docker-compose exec postgres psql -U paperreader -d paperreader -c "SELECT version();"
```

**Reset database:**
```bash
docker-compose down -v
docker-compose up -d postgres
# Wait 10 seconds for initialization
docker-compose exec postgres psql -U paperreader -d paperreader -f /docker-entrypoint-initdb.d/schema.sql
```

### Issue: Out of memory

**Increase Docker memory:**
- Docker Desktop → Settings → Resources → Memory
- Allocate at least 8GB

**Reduce concurrent TTS jobs:**
Edit `services/tts-worker/src/index.ts`:
```typescript
const worker = new Worker('tts-jobs', processJob, {
  connection: redisConnection,
  concurrency: 1  // Reduce from default
});
```

### Issue: TTS generation too slow

**Expected performance on your hardware:**
- 144GB RAM, multi-core Xeon (no GPU)
- Kokoro-82M RTF: 0.15-0.3
- ~500 words per chunk: 30-60 seconds per chunk
- Full paper (5000 words): 5-10 minutes total

**Optimization options:**

1. **Increase ONNX threads** (edit `services/tts-service/main.py`):
```python
ONNX_NUM_THREADS = 16  # Increase based on CPU cores
```

2. **Use faster voice** (some voices are faster than others):
```python
# Test different voices for speed
curl http://localhost:8000/voices
```

3. **Reduce audio quality** (edit TTS service):
```python
sample_rate = 24000  # Reduce from 24000 to 16000
```

## Health Checks

### Automated Health Check Script

Create `check-health.sh`:

```bash
#!/bin/bash

echo "Checking service health..."

# PostgreSQL
echo -n "PostgreSQL: "
docker-compose exec -T postgres pg_isready -U paperreader && echo "✓" || echo "✗"

# MinIO
echo -n "MinIO: "
curl -sf http://localhost:9000/minio/health/live > /dev/null && echo "✓" || echo "✗"

# Redis
echo -n "Redis: "
docker-compose exec -T redis redis-cli ping > /dev/null && echo "✓" || echo "✗"

# TTS Service
echo -n "TTS Service: "
curl -sf http://localhost:8000/health > /dev/null && echo "✓" || echo "✗"

# TTS Worker
echo -n "TTS Worker: "
docker-compose ps tts-worker | grep -q "Up" && echo "✓" || echo "✗"

# App
echo -n "Next.js App: "
curl -sf http://localhost:3000 > /dev/null && echo "✓" || echo "✗"

echo "Health check complete!"
```

Run with:
```bash
chmod +x check-health.sh
./check-health.sh
```

## Production Deployment Checklist

- [ ] Change default credentials (PostgreSQL, MinIO)
- [ ] Set strong passwords in `.env`
- [ ] Enable HTTPS/SSL for MinIO
- [ ] Configure backup strategy for PostgreSQL
- [ ] Set up monitoring (Prometheus/Grafana)
- [ ] Configure log rotation
- [ ] Set resource limits in docker-compose.yml
- [ ] Test recovery procedures
- [ ] Document backup/restore process
- [ ] Configure firewall rules
- [ ] Set up automated health checks
- [ ] Configure email alerts for failures

## Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f tts-worker

# Last 100 lines
docker-compose logs --tail=100 app
```

### Database Queries

```bash
# Paper statistics
docker-compose exec postgres psql -U paperreader -d paperreader -c "
SELECT
  COUNT(*) as total_papers,
  COUNT(*) FILTER (WHERE tts_status = 'completed') as completed,
  COUNT(*) FILTER (WHERE tts_status = 'processing') as processing,
  COUNT(*) FILTER (WHERE tts_status = 'failed') as failed
FROM papers;"

# Chunk progress
docker-compose exec postgres psql -U paperreader -d paperreader -c "
SELECT
  paper_id,
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE tts_status = 'completed') as completed_chunks
FROM paper_chunks
GROUP BY paper_id;"
```

### Redis Queue Monitoring

```bash
# Queue stats
docker-compose exec redis redis-cli
> INFO stats
> LLEN bull:tts-jobs:wait
> LLEN bull:tts-jobs:active
> LLEN bull:tts-jobs:completed
> LLEN bull:tts-jobs:failed
```

## Backup and Restore

### Backup PostgreSQL

```bash
# Create backup
docker-compose exec postgres pg_dump -U paperreader paperreader > backup-$(date +%Y%m%d).sql

# Restore backup
docker-compose exec -T postgres psql -U paperreader -d paperreader < backup-20240101.sql
```

### Backup MinIO

```bash
# Using MinIO client
docker-compose exec minio mc mirror local/papers /backup/papers
docker-compose exec minio mc mirror local/audio /backup/audio
docker-compose exec minio mc mirror local/voice-notes /backup/voice-notes
```

## Performance Optimization

### Database Indexes

The schema includes optimized indexes. To verify:
```bash
docker-compose exec postgres psql -U paperreader -d paperreader -c "\di"
```

### MinIO Performance

For better performance with many small files:
- Use erasure coding for larger deployments
- Configure bucket lifecycle policies
- Enable caching

### TTS Worker Scaling

To process papers faster, scale workers:
```bash
docker-compose up -d --scale tts-worker=3
```

Note: Ensure your CPU can handle multiple concurrent TTS generations.

## Development Testing

### Local Development Mode

```bash
# Install dependencies
npm install

# Run dev server (without Docker)
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Build production
npm run build
```

### Test Database Migrations

```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U paperreader -d paperreader

# Run schema
\i database/schema.sql

# Verify tables
\dt
```

## Common Workflows

### Adding a New Voice

1. Check available Kokoro voices in `services/tts-service/models/`
2. Update `AVAILABLE_VOICES` in `services/tts-service/main.py`
3. Restart TTS service: `docker-compose restart tts-service`
4. Test: `curl http://localhost:8000/voices`

### Cleaning Up Failed Jobs

```bash
# Remove failed jobs from queue
docker-compose exec redis redis-cli
> DEL bull:tts-jobs:failed

# Reset paper TTS status
docker-compose exec postgres psql -U paperreader -d paperreader -c "
UPDATE papers SET tts_status = 'pending' WHERE tts_status = 'failed';
UPDATE paper_chunks SET tts_status = 'pending' WHERE tts_status = 'failed';"
```

### Reprocessing Paper Audio

```bash
# Delete existing audio
docker-compose exec minio mc rm --recursive local/audio/[paper-id]/

# Reset database
docker-compose exec postgres psql -U paperreader -d paperreader -c "
UPDATE papers SET tts_status = 'pending' WHERE id = '[paper-id]';
UPDATE paper_chunks SET tts_status = 'pending', audio_file_path = NULL WHERE paper_id = '[paper-id]';"

# Recreate TTS jobs (requires custom script or API call)
```

## Support and Debugging

### Enable Debug Logging

Edit `docker-compose.yml` and add:
```yaml
services:
  tts-worker:
    environment:
      - LOG_LEVEL=debug
```

### Access Container Shells

```bash
# Access app container
docker-compose exec app sh

# Access TTS service
docker-compose exec tts-service sh

# Access PostgreSQL
docker-compose exec postgres bash
```

### Check Network Connectivity

```bash
# From app container, test connections
docker-compose exec app sh
$ ping postgres
$ ping minio
$ ping redis
$ ping tts-service
$ wget -O- http://tts-service:8000/health
```

---

## Next Steps

After successful deployment:
1. Upload example papers from `public/example-papers/`
2. Monitor TTS processing completion
3. Test audio playback
4. Add notes and highlights
5. Test search functionality
6. Review logs for any errors
7. Set up automated backups
8. Configure monitoring alerts

For issues not covered here, check:
- Docker logs: `docker-compose logs [service]`
- Application logs in the browser console
- DEVELOPER_NOTES.md for architecture details
- GitHub issues: [repository-url]
