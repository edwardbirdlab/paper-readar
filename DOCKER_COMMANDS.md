# Docker Command Reference

Quick reference for managing your Paper Reader deployment.

## 🚀 Basic Operations

### Start the App
```bash
# Simple deployment
docker-compose up -d

# Full stack deployment
docker-compose -f docker-compose.full-stack.yml up -d
```

### Stop the App
```bash
# Simple deployment
docker-compose down

# Full stack deployment
docker-compose -f docker-compose.full-stack.yml down
```

### Restart the App
```bash
# Restart specific service
docker-compose restart paper-reader

# Restart all services
docker-compose restart
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f paper-reader

# Last 100 lines
docker-compose logs --tail=100 paper-reader
```

## 🔄 Updates & Rebuilds

### Pull Latest Images
```bash
docker-compose pull
```

### Rebuild After Code Changes
```bash
# Rebuild and restart
docker-compose up -d --build

# Force rebuild (no cache)
docker-compose build --no-cache
docker-compose up -d
```

### Update Running Container
```bash
# Stop, pull, rebuild, start
docker-compose down
docker-compose pull
docker-compose up -d --build
```

## 📊 Monitoring

### Check Container Status
```bash
docker-compose ps
```

### View Resource Usage
```bash
docker stats
```

### Check Container Health
```bash
docker inspect paper-reader | grep -A 5 Health
```

### Execute Commands in Container
```bash
# Open shell
docker exec -it paper-reader sh

# Run specific command
docker exec paper-reader ls -la
```

## 💾 Data Management

### Backup Database (Full Stack)
```bash
# Backup to file
docker exec paper-reader-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i paper-reader-db psql -U postgres postgres < backup_20240101.sql
```

### Backup Storage Files
```bash
# Create backup
docker run --rm -v paper-reader_storage-data:/data -v $(pwd):/backup alpine tar czf /backup/storage_backup.tar.gz -C /data .

# Restore backup
docker run --rm -v paper-reader_storage-data:/data -v $(pwd):/backup alpine tar xzf /backup/storage_backup.tar.gz -C /data
```

### View Docker Volumes
```bash
docker volume ls
```

### Inspect Volume
```bash
docker volume inspect paper-reader_postgres-data
docker volume inspect paper-reader_storage-data
```

## 🗑️ Cleanup

### Remove Stopped Containers
```bash
docker-compose down
```

### Remove Containers and Volumes (⚠️  Deletes Data!)
```bash
docker-compose down -v
```

### Remove All Unused Docker Data
```bash
docker system prune -a
```

### Remove Specific Volume
```bash
docker volume rm paper-reader_postgres-data
```

## 🐛 Troubleshooting

### View Container Details
```bash
docker inspect paper-reader
```

### Check Network
```bash
docker network ls
docker network inspect paper-reader_paper-reader-network
```

### Access Database
```bash
# Full stack only
docker exec -it paper-reader-db psql -U postgres
```

### Check Environment Variables
```bash
docker exec paper-reader env
```

### Test Container Networking
```bash
# From app container to database
docker exec paper-reader ping paper-reader-db

# From app container to internet
docker exec paper-reader ping google.com
```

## 📝 Logs & Debugging

### Save Logs to File
```bash
docker-compose logs > logs.txt
```

### Follow Logs from Specific Time
```bash
docker-compose logs --since 30m -f
```

### Debug Container Startup
```bash
# See what's happening during startup
docker-compose up
```

### Check Port Bindings
```bash
docker port paper-reader
```

## 🔧 Advanced Operations

### Override Environment Variables
```bash
# Temporarily override
NEXT_PUBLIC_SUPABASE_URL=http://new-url docker-compose up -d
```

### Scale Services (if supported)
```bash
docker-compose up -d --scale paper-reader=2
```

### Run One-Time Command
```bash
# Run npm command in container
docker-compose run --rm paper-reader npm run build
```

### Copy Files To/From Container
```bash
# Copy to container
docker cp local-file.txt paper-reader:/app/

# Copy from container
docker cp paper-reader:/app/file.txt ./local-file.txt
```

## 🔐 Security

### Update Base Images
```bash
# Pull latest base images
docker-compose pull

# Rebuild with latest
docker-compose build --pull
docker-compose up -d
```

### Scan for Vulnerabilities
```bash
docker scan paper-reader
```

### View Image Layers
```bash
docker history paper-reader
```

## 📊 Performance Monitoring

### Real-Time Stats
```bash
docker stats --no-stream
```

### Container CPU/Memory Limits
```bash
# In docker-compose.yml
services:
  paper-reader:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
```

## 🆘 Emergency Commands

### Force Stop All Containers
```bash
docker stop $(docker ps -q)
```

### Kill Specific Container
```bash
docker kill paper-reader
```

### Remove Everything (⚠️  Nuclear Option!)
```bash
docker-compose down -v
docker system prune -a --volumes
```

## 📦 Backup Script Example

Save this as `backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "Backing up database..."
docker exec paper-reader-db pg_dump -U postgres postgres > "$BACKUP_DIR/db_$DATE.sql"

echo "Backing up storage..."
docker run --rm -v paper-reader_storage-data:/data -v "$BACKUP_DIR":/backup alpine tar czf /backup/storage_$DATE.tar.gz -C /data .

echo "Backup completed: $DATE"
```

Then run:
```bash
chmod +x backup.sh
./backup.sh
```

## 🔄 Auto-Update with Watchtower

Add Watchtower to check for updates:

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 86400 --cleanup
```

This checks daily and auto-updates containers.

---

## Quick Reference Card

| Task | Command |
|------|---------|
| Start | `docker-compose up -d` |
| Stop | `docker-compose down` |
| Logs | `docker-compose logs -f` |
| Restart | `docker-compose restart` |
| Update | `docker-compose up -d --build` |
| Status | `docker-compose ps` |
| Stats | `docker stats` |
| Shell | `docker exec -it paper-reader sh` |
| Backup DB | `docker exec paper-reader-db pg_dump -U postgres postgres > backup.sql` |
