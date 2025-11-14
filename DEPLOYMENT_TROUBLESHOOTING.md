# Deployment Troubleshooting Guide

This guide helps diagnose and fix common deployment issues with the Scientific Paper Reader stack.

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Issues](#common-issues)
   - [DATABASE_URL Undefined](#database_url-undefined)
   - [PDF Upload Failures](#pdf-upload-failures)
   - [TTS Service Not Working](#tts-service-not-working)
   - [Database Connection Errors](#database-connection-errors)
   - [MinIO/Storage Issues](#miniostorage-issues)
3. [Service-Specific Debugging](#service-specific-debugging)
4. [Environment Configuration](#environment-configuration)
5. [Recovery Procedures](#recovery-procedures)

---

## Quick Diagnostics

### Check All Services Status

```bash
docker-compose ps
```

All services should show `Up` status. If any show `Exit` or `Restarting`, investigate those first.

### Run Verification Tests

The deployment script includes automatic verification. To run manually:

```bash
# Database connection
docker-compose exec app node -e "
  const {Pool} = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://paper_reader:changeme@postgres:5432/paper_reader'
  });
  pool.query('SELECT NOW()')
    .then(r => console.log('✓ Database connected:', r.rows[0].now))
    .catch(e => console.error('✗ Database error:', e.message));
"

# TTS service
curl -s http://localhost:3006/health | jq

# MinIO
curl -s http://localhost:3003/minio/health/live

# Redis
docker-compose exec redis redis-cli PING
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app
docker-compose logs -f tts-service
docker-compose logs -f tts-worker
docker-compose logs -f postgres
```

---

## Common Issues

### DATABASE_URL Undefined

**Symptom:**
- PDF uploads fail
- Error: `Cannot read properties of undefined (reading 'searchParams')`
- App logs show database connection errors

**Cause:**
The `DATABASE_URL` environment variable is not set, causing the PostgreSQL client to fail initialization.

**Solution:**

#### Option 1: Automatic Fix (Recommended)
Simply re-run the deployment script - it now automatically sets `DATABASE_URL`:

```bash
./docker-deploy.sh
```

The script will:
- Update existing `.env` file with `DATABASE_URL`
- Use the same `POSTGRES_PASSWORD` already configured
- Rebuild services with the new configuration

#### Option 2: Manual Fix
If you prefer to fix manually:

1. **Edit `.env` file:**
   ```bash
   nano .env
   ```

2. **Add `DATABASE_URL` line** (use your actual `POSTGRES_PASSWORD`):
   ```env
   # After POSTGRES_PASSWORD line, add:
   DATABASE_URL=postgresql://paper_reader:YOUR_PASSWORD_HERE@postgres:5432/paper_reader
   ```

3. **Rebuild services:**
   ```bash
   docker-compose up -d --build app tts-worker
   ```

4. **Verify fix:**
   ```bash
   docker-compose exec app node -e "console.log(process.env.DATABASE_URL)"
   ```

   Should output: `postgresql://paper_reader:PASSWORD@postgres:5432/paper_reader`

#### Option 3: No .env File (Use Code Fallbacks)
If you don't have a `.env` file or prefer not to use one:

The code now includes fallback values, so it will work without `DATABASE_URL` set. However, it will use default credentials (`changeme` password), which is fine for local development but not recommended for production.

**Files with fallbacks:**
- `lib/db/client.ts` - Main app database client
- `services/tts-worker/src/index.ts` - TTS worker database client

Both default to: `postgresql://paper_reader:changeme@postgres:5432/paper_reader`

---

### PDF Upload Failures

**Symptom:**
- Upload button spins indefinitely
- Network tab shows 500 error
- App logs show database or storage errors

**Diagnosis:**

1. **Check if DATABASE_URL issue:**
   ```bash
   docker-compose logs app | grep -i "database\|connection\|searchParams"
   ```

   If you see `searchParams` errors → See [DATABASE_URL Undefined](#database_url-undefined)

2. **Check MinIO connectivity:**
   ```bash
   curl -s http://localhost:3003/minio/health/live
   docker-compose logs minio
   ```

3. **Check disk space:**
   ```bash
   df -h
   docker system df
   ```

**Solutions:**

- **DATABASE_URL issue**: Follow steps in [DATABASE_URL Undefined](#database_url-undefined)
- **MinIO not running**: `docker-compose restart minio`
- **Disk full**: Clean up old images/volumes with `docker system prune -a`
- **Bucket missing**: Buckets are auto-created, but verify with:
  ```bash
  docker-compose exec minio mc ls local/
  ```
  Should show `papers` and `audio` buckets.

---

### TTS Service Not Working

**Symptom:**
- TTS processing stuck at 0%
- TTS worker logs show connection errors
- Health check fails: `http://localhost:3006/health`

**Common Causes:**

#### 1. Model Files Still Downloading
**Check:**
```bash
docker-compose logs -f tts-service | grep -i download
```

**Look for:**
```
Downloading model file from https://github.com/... (~310 MB)
Downloading voices file from https://github.com/... (~27 MB)
```

**Wait Time:** 1-3 minutes on typical connections. The service won't respond until download completes.

**Solution:** Be patient. Monitor logs until you see:
```
✓ Model file downloaded: 310.x MB in XX.Xs
✓ Voices file downloaded: 27.x MB in XX.Xs
Model loaded successfully
```

#### 2. Model Load Failed
**Check:**
```bash
docker-compose logs tts-service | grep -i error
```

**Solutions:**
```bash
# Remove bad model files and restart
docker-compose exec tts-service rm -rf /app/models/*
docker-compose restart tts-service

# Watch it re-download
docker-compose logs -f tts-service
```

#### 3. Container Crashed
**Check:**
```bash
docker-compose ps tts-service
```

If status is `Exit` or `Restarting`:
```bash
# View crash logs
docker-compose logs tts-service

# Restart with fresh build
docker-compose up -d --build tts-service
```

---

### Database Connection Errors

**Symptom:**
- App can't connect to PostgreSQL
- Errors like `ECONNREFUSED`, `password authentication failed`, or `database does not exist`

**Diagnosis:**

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# Check if database exists
docker-compose exec postgres psql -U paper_reader -l

# Test connection
docker-compose exec postgres psql -U paper_reader -d paper_reader -c "SELECT NOW();"
```

**Solutions:**

#### Connection Refused
```bash
# Restart PostgreSQL
docker-compose restart postgres

# Wait for it to be ready
docker-compose exec postgres pg_isready -U paper_reader
```

#### Password Authentication Failed
Your `.env` file `POSTGRES_PASSWORD` doesn't match what's in the database.

**Fix:**
```bash
# Option 1: Reset database with new password
docker-compose down
docker volume rm paper-reader_postgres_data
./docker-deploy.sh

# Option 2: Update .env to match existing database password
# Edit .env and set POSTGRES_PASSWORD to the correct value
nano .env
docker-compose up -d --build app tts-worker
```

#### Database Does Not Exist
Schema initialization failed.

**Fix:**
```bash
# Manually initialize schema
docker-compose exec postgres psql -U paper_reader -d paper_reader -f /docker-entrypoint-initdb.d/01-schema.sql

# Verify tables exist
docker-compose exec postgres psql -U paper_reader -d paper_reader -c "\dt"
```

---

### MinIO/Storage Issues

**Symptom:**
- PDF uploads fail with storage errors
- Audio generation succeeds but playback fails
- Console shows "Access Denied" errors

**Diagnosis:**

```bash
# Check MinIO health
curl http://localhost:3003/minio/health/live

# List buckets
docker-compose exec minio mc ls local/

# Check logs
docker-compose logs minio
```

**Solutions:**

#### MinIO Not Accessible
```bash
# Restart MinIO
docker-compose restart minio

# Recreate with fresh volumes
docker-compose down
docker volume rm paper-reader_minio_data
docker-compose up -d minio
```

#### Buckets Missing
MinIO should auto-create `papers` and `audio` buckets. If missing:

```bash
# Create manually
docker-compose exec minio mc mb local/papers
docker-compose exec minio mc mb local/audio

# Set public read access
docker-compose exec minio mc anonymous set download local/papers
docker-compose exec minio mc anonymous set download local/audio
```

#### Access Denied Errors
Check credentials in `.env`:
```env
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<your-password>
```

These must match what's configured in `docker-compose.yml`.

---

## Service-Specific Debugging

### App Container

**Common Issues:**
- Next.js build errors
- Module not found
- Port conflicts

**Debug Steps:**

```bash
# View detailed logs
docker-compose logs -f app

# Rebuild from scratch
docker-compose up -d --build --force-recreate app

# Access container shell
docker-compose exec app sh
# Then inside container:
npm run build  # Test build
node -v        # Check Node version
ls -la         # Check files
```

### TTS Worker

**Common Issues:**
- Jobs stuck in queue
- Worker not processing
- Connection errors

**Debug Steps:**

```bash
# Check worker logs
docker-compose logs -f tts-worker

# Check queue status
docker-compose exec redis redis-cli LLEN bull:tts-jobs:wait
docker-compose exec redis redis-cli LLEN bull:tts-jobs:active
docker-compose exec redis redis-cli LLEN bull:tts-jobs:failed

# Restart worker
docker-compose restart tts-worker

# Scale workers for faster processing
docker-compose up -d --scale tts-worker=3
```

### PostgreSQL

**Backup and Restore:**

```bash
# Backup database
docker-compose exec postgres pg_dump -U paper_reader paper_reader > backup.sql

# Restore database
cat backup.sql | docker-compose exec -T postgres psql -U paper_reader paper_reader

# Connect to database
docker-compose exec postgres psql -U paper_reader -d paper_reader
```

**Reset Database:**

```bash
# WARNING: This deletes all data!
docker-compose down
docker volume rm paper-reader_postgres_data
./docker-deploy.sh
```

---

## Environment Configuration

### Required Environment Variables

Create `.env` file with these required variables:

```env
# Database (REQUIRED - now auto-generated by docker-deploy.sh)
POSTGRES_PASSWORD=<secure-random-password>
DATABASE_URL=postgresql://paper_reader:${POSTGRES_PASSWORD}@postgres:5432/paper_reader

# MinIO (REQUIRED)
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=<secure-random-password>

# Application
NODE_ENV=production

# TTS Configuration (OPTIONAL - these are defaults)
WORKER_CONCURRENCY=2
CPU_CORES=8
DEFAULT_VOICE=af_sarah
```

### Optional Variables

```env
# Override default ports (if you have conflicts)
# Note: These would require docker-compose.yml changes too

# MinIO public endpoint (for remote access)
MINIO_PUBLIC_ENDPOINT=your-server-ip:3003

# Redis
REDIS_URL=redis://redis:6379

# TTS Service
TTS_SERVICE_URL=http://tts-service:8000
```

### Checking Current Configuration

```bash
# View environment variables in a container
docker-compose exec app env | grep DATABASE
docker-compose exec app env | grep MINIO
docker-compose exec tts-worker env | grep DATABASE
```

---

## Recovery Procedures

### Full Reset (Nuclear Option)

**WARNING:** This deletes ALL data (papers, audio, database, etc.)

```bash
# Stop all services
docker-compose down

# Remove all volumes
docker volume rm paper-reader_postgres_data
docker volume rm paper-reader_minio_data
docker volume rm paper-reader_redis_data
docker volume rm paper-reader_tts_models

# Remove .env file
rm .env .env.bak

# Fresh deployment
./docker-deploy.sh
```

### Soft Reset (Keep Data)

```bash
# Rebuild services without removing data
docker-compose down
docker-compose build --no-cache
docker-compose up -d --force-recreate
```

### Reset Only TTS Service

```bash
# Remove model files and rebuild
docker-compose down tts-service
docker volume rm paper-reader_tts_models
docker-compose up -d --build tts-service
```

### Clear Failed Jobs

```bash
# Clear all failed TTS jobs
docker-compose exec redis redis-cli DEL bull:tts-jobs:failed

# Clear entire queue (resets all jobs)
docker-compose exec redis redis-cli FLUSHALL
```

---

## Getting Help

### Gather Debug Information

Before reporting issues, collect this information:

```bash
# Service status
docker-compose ps > debug-info.txt

# Logs from all services
docker-compose logs --tail=100 >> debug-info.txt

# Environment check
docker-compose exec app env | grep -v PASSWORD >> debug-info.txt

# Resource usage
docker stats --no-stream >> debug-info.txt
```

### Check Configuration Files

```bash
# Verify docker-compose.yml is correct
docker-compose config

# Check .env file (redact passwords before sharing)
cat .env
```

### Useful Diagnostics

```bash
# Docker version
docker version
docker-compose version

# System resources
df -h        # Disk space
free -h      # Memory
top          # CPU usage

# Network connectivity
curl -I http://localhost:3001
curl -I http://localhost:3006/health
```

---

## Additional Resources

- **Main Documentation:** `README.md`
- **Docker Deployment:** `DOCKER_DEPLOYMENT.md`
- **TTS v2 Migration:** `TTS_V2_MIGRATION_GUIDE.md`
- **Development Guide:** `CLAUDE.md`

---

## Common Error Messages Reference

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| `Cannot read properties of undefined (reading 'searchParams')` | DATABASE_URL not set | See [DATABASE_URL Undefined](#database_url-undefined) |
| `ECONNREFUSED postgres:5432` | Database not running | `docker-compose restart postgres` |
| `password authentication failed` | Wrong POSTGRES_PASSWORD | Update `.env` or reset database |
| `Model file not found` | TTS models not downloaded | Wait for download or check TTS logs |
| `bucket does not exist` | MinIO buckets not created | See [MinIO/Storage Issues](#miniostorage-issues) |
| `ETIMEDOUT` | Service not responding | Check service is running with `docker-compose ps` |
| `port is already allocated` | Port conflict | Change ports in `docker-compose.yml` |

---

**Last Updated:** 2025-01-14 (Post TTS v2 Migration)
