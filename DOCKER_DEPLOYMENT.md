# Docker Deployment Guide for Home Lab / Portainer

This guide will help you deploy the Scientific Paper Reader app on your home lab server using Docker and Portainer.

## 📦 Overview

The complete self-hosted stack includes:
- **PostgreSQL** - Database for papers, chunks, and notes
- **MinIO** - S3-compatible object storage for PDFs and audio
- **Redis** - Job queue backend
- **Kokoro TTS Service** - High-quality CPU-optimized TTS
- **TTS Worker** - Background processor for generating audio
- **Next.js App** - Web application frontend and API

**No external dependencies required** - everything runs on your hardware.

## 📍 Port Mapping

All services use sequential ports starting from 3001:
- **App**: http://localhost:3001
- **PostgreSQL**: localhost:3002
- **MinIO API**: http://localhost:3003
- **MinIO Console**: http://localhost:3004 (admin interface)
- **Redis**: localhost:3005
- **TTS Service**: http://localhost:3006/health

---

## 🚀 Quick Start Deployment

### Prerequisites
- Docker and Docker Compose installed
- ~4GB RAM available
- ~20GB disk space for images and data
- Multi-core CPU (recommended for TTS performance)

### Step 1: Clone the Repository

```bash
git clone https://github.com/edwardbirdlab/paper-reader.git
cd paper-reader
```

### Step 2: Configure Environment

The deployment script will generate secure credentials automatically, or you can create `.env` manually:

```bash
cp .env.example .env
```

Edit `.env` and set your passwords:

```env
# Port Mapping (External:Internal)
# App: 3001:3000
# PostgreSQL: 3002:5432
# MinIO API: 3003:9000
# MinIO Console: 3004:9001
# Redis: 3005:6379
# TTS Service: 3006:8000

# Database Configuration
POSTGRES_PASSWORD=your_secure_password_here

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_minio_password_here

# Application Configuration
NODE_ENV=production

# TTS Worker Configuration
WORKER_CONCURRENCY=2  # Parallel TTS jobs (set to CPU cores / 2)
CPU_CORES=8           # ONNX thread count (set to your CPU core count)
```

### Step 3: Deploy

**Option A: Using the deployment script (recommended)**

```bash
chmod +x docker-deploy.sh
./docker-deploy.sh
```

This will:
- Generate secure credentials
- Start all services
- Initialize database schema
- Create MinIO buckets
- Display access URLs

**Option B: Manual deployment**

```bash
docker-compose up -d --build
```

### Step 4: Verify Deployment

Check that all services are running:

```bash
docker-compose ps
```

You should see 6 containers running:
- `paper-reader-app`
- `paper-reader-postgres`
- `paper-reader-minio`
- `paper-reader-redis`
- `paper-reader-tts-service`
- `paper-reader-tts-worker`

### Step 5: Access the App

Open your browser to:
- **Paper Reader**: http://localhost:3001
- **MinIO Console**: http://localhost:3004

MinIO credentials are in your `.env` file (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`)

---

## 🎛️ Portainer Deployment

### Method 1: Stack Deployment (Recommended)

1. Open Portainer UI
2. Go to **Stacks** → **Add stack**
3. Name it: `paper-reader`
4. Upload the `docker-compose.yml` file or paste its contents
5. Go to **Environment variables** tab
6. Add your environment variables (or upload `.env` file)
7. Click **Deploy the stack**

### Method 2: Repository Deployment

1. Go to **Stacks** → **Add stack**
2. Select **Git Repository**
3. Repository URL: `https://github.com/edwardbirdlab/paper-reader`
4. Reference: `main`
5. Compose path: `docker-compose.yml`
6. Add environment variables
7. Click **Deploy the stack**

### Monitoring in Portainer

After deployment, you can:
- **View logs**: Click on stack → Select container → Logs
- **Monitor resources**: Dashboard shows CPU/RAM usage
- **Restart services**: Click on container → Restart
- **Scale workers**: Increase `tts-worker` replicas for faster processing

---

## 🔧 Configuration

### Adjusting TTS Performance

For better performance, tune these settings in `.env`:

```env
# If you have a powerful CPU (16+ cores)
WORKER_CONCURRENCY=4
CPU_CORES=16

# If you have a modest CPU (4-8 cores)
WORKER_CONCURRENCY=2
CPU_CORES=8
```

Then restart the services:
```bash
docker-compose restart tts-worker tts-service
```

### Scaling TTS Workers

To process multiple papers simultaneously:

```bash
docker-compose up -d --scale tts-worker=3
```

This creates 3 worker instances, each processing 2 chunks in parallel (default concurrency).

---

## 💾 Data Management

### Database Backup

```bash
# Create backup
docker exec paper-reader-postgres pg_dump -U paper_reader paper_reader > backup_$(date +%Y%m%d).sql

# Restore backup
cat backup_20240101.sql | docker exec -i paper-reader-postgres psql -U paper_reader paper_reader
```

### MinIO Backup

MinIO data is stored in Docker volume `minio_data`. To backup:

```bash
# Export volume
docker run --rm -v paper-reader_minio_data:/data -v $(pwd):/backup alpine tar czf /backup/minio_backup.tar.gz /data
```

### Complete Backup

```bash
# Stop services
docker-compose down

# Backup volumes
docker run --rm -v paper-reader_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data
docker run --rm -v paper-reader_minio_data:/data -v $(pwd):/backup alpine tar czf /backup/minio_backup.tar.gz /data
docker run --rm -v paper-reader_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis_backup.tar.gz /data

# Restart services
docker-compose up -d
```

---

## 🐛 Troubleshooting

### Services Won't Start

Check logs:
```bash
docker-compose logs -f
```

Common issues:
- **Port conflicts**: Ports 3001-3006 must be available
- **Insufficient RAM**: Need at least 4GB available
- **Permissions**: Ensure Docker has access to mount volumes

### TTS Not Processing

Check worker logs:
```bash
docker-compose logs -f tts-worker
```

Check TTS service:
```bash
docker-compose logs -f tts-service
curl http://localhost:3006/health
```

Check queue:
```bash
docker exec -it paper-reader-redis redis-cli
> KEYS bull:tts-jobs:*
> LLEN bull:tts-jobs:wait
```

### Audio Not Playing

1. Check MinIO is accessible:
   - Open http://localhost:3004
   - Login with credentials from `.env`
   - Verify `audio` bucket exists and has files

2. Check browser console for errors

3. Verify MinIO public access:
```bash
docker exec paper-reader-minio mc anonymous list myminio/audio
```

### Database Connection Errors

Check PostgreSQL is running:
```bash
docker-compose ps postgres
```

Test connection:
```bash
docker exec paper-reader-app node -e "const {Pool}=require('pg'); new Pool({connectionString:process.env.DATABASE_URL}).query('SELECT NOW()').then(r=>console.log(r.rows))"
```

---

## 🔄 Updates

### Updating the App

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Updating a Specific Service

```bash
docker-compose up -d --build app
docker-compose up -d --build tts-worker
```

---

## 📊 Monitoring

### View All Logs

```bash
docker-compose logs -f
```

### View Specific Service

```bash
docker-compose logs -f tts-worker
```

### Check Resource Usage

```bash
docker stats
```

### Check TTS Processing Status

```bash
# Check queue length
docker exec paper-reader-redis redis-cli LLEN bull:tts-jobs:wait

# Check completed jobs
docker exec paper-reader-redis redis-cli LLEN bull:tts-jobs:completed

# Check failed jobs
docker exec paper-reader-redis redis-cli LLEN bull:tts-jobs:failed
```

---

## 🌐 Remote Access

### Using Reverse Proxy (Nginx/Traefik)

Add labels to `docker-compose.yml` for your reverse proxy. Example for Traefik:

```yaml
app:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.paper-reader.rule=Host(`papers.yourdomain.com`)"
    - "traefik.http.services.paper-reader.loadbalancer.server.port=3000"
```

### Direct Port Mapping

Change the port mapping in `docker-compose.yml`:

```yaml
app:
  ports:
    - "3001:3000"  # Change 3001 to any available port
```

---

## 🔐 Security Considerations

1. **Change default passwords** in `.env`
2. **Use strong passwords** for PostgreSQL and MinIO
3. **Restrict access** to ports 3002-3006 (only expose 3001 publicly if needed)
4. **Enable HTTPS** when exposing to internet
5. **Regular backups** of database and MinIO volumes
6. **Update regularly** to get security patches

---

## 📚 Additional Resources

- **Full command reference**: See [DOCKER_COMMANDS.md](DOCKER_COMMANDS.md)
- **Developer notes**: See [DEVELOPER_NOTES.md](DEVELOPER_NOTES.md)
- **Portainer setup**: See [PORTAINER_SETUP.md](PORTAINER_SETUP.md)
- **Architecture details**: See [CLAUDE.md](CLAUDE.md)

---

## 💡 Tips

- **First upload**: TTS processing may take 15-30 minutes for a typical paper
- **Monitor progress**: Check worker logs to see processing status
- **Optimize for your hardware**: Adjust `CPU_CORES` and `WORKER_CONCURRENCY`
- **Storage planning**: Typical paper = 5MB PDF + 150MB audio
- **MinIO console**: Useful for verifying uploads and checking storage usage

---

**Last Updated**: 2025-11-13
**Version**: 2.0.0 - Local Stack with Kokoro TTS
**Architecture**: Fully self-hosted, CPU-optimized, production-ready
