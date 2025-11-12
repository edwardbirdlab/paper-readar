# Docker Deployment Guide for Home Lab / Portainer

This guide will help you deploy the Scientific Paper Reader app on your home lab server using Docker and Portainer.

## 📦 Deployment Options

You have two deployment options:

1. **Simple Deployment** - App only, using cloud Supabase (recommended for beginners)
2. **Full Stack Deployment** - App + Local Supabase instance (complete self-hosted)

---

## Option 1: Simple Deployment (App + Cloud Supabase)

### Prerequisites
- Docker and Docker Compose installed
- Portainer running
- Supabase cloud account (free tier available at [supabase.com](https://supabase.com))

### Step 1: Set Up Cloud Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. In the SQL Editor, run the schema from `supabase/schema.sql`
4. Create storage buckets (Settings → Storage):
   - `papers` (for PDF files)
   - `voice-notes` (for audio recordings)
   - `tts-audio` (for pre-processed TTS)
5. Configure storage policies as described in `supabase/README.md`
6. Get your credentials from Settings → API:
   - Project URL
   - Anon/public key

### Step 2: Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Supabase Configuration (from your cloud project)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# TTS Service (optional)
NEXT_PUBLIC_TTS_API_URL=http://localhost:8000/api/tts
TTS_API_KEY=
```

### Step 3: Deploy with Portainer

#### Method A: Using Portainer UI

1. Open Portainer
2. Go to **Stacks** → **Add stack**
3. Name it: `paper-reader`
4. Choose **Upload** and select `docker-compose.yml`
5. In **Environment variables**, paste your `.env` content
6. Click **Deploy the stack**

#### Method B: Using Portainer Git Deploy

1. Open Portainer
2. Go to **Stacks** → **Add stack**
3. Name it: `paper-reader`
4. Choose **Repository**
5. Enter your repository URL
6. Set compose file path: `docker-compose.yml`
7. Add environment variables
8. Click **Deploy the stack**

### Step 4: Access Your App

- App: `http://your-server-ip:3000`

---

## Option 2: Full Stack Deployment (App + Local Supabase)

### Prerequisites
- Docker and Docker Compose installed
- Portainer running
- At least 4GB RAM available
- 10GB+ disk space

### Step 1: Generate Secure Keys

Generate secure passwords and JWT secrets:

```bash
# Generate a secure password
openssl rand -base64 32

# Generate JWT secret (at least 32 characters)
openssl rand -base64 48
```

### Step 2: Configure Environment Variables

Copy the template:

```bash
cp .env.docker .env
```

Edit `.env` and replace these values:

```bash
# IMPORTANT: Change these!
POSTGRES_PASSWORD=your-generated-password-here
JWT_SECRET=your-generated-jwt-secret-here-at-least-32-chars

# Generate your own keys at https://supabase.com/docs/guides/hosting/overview#api-keys
# Or keep the demo keys for local development (NOT FOR PRODUCTION)
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Update these to match your server
API_EXTERNAL_URL=http://your-server-ip:8000
SITE_URL=http://your-server-ip:3000
```

### Step 3: Deploy Full Stack with Portainer

1. Open Portainer
2. Go to **Stacks** → **Add stack**
3. Name it: `paper-reader-full`
4. Choose **Upload** and select `docker-compose.full-stack.yml`
5. In **Environment variables**, paste your `.env` content
6. Click **Deploy the stack**

### Step 4: Initialize Database

After the stack is deployed:

1. Wait for all containers to be healthy (~30 seconds)
2. Run the database schema:

```bash
docker exec paper-reader-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/schema.sql
```

Or via Portainer:
1. Go to **Containers** → **paper-reader-db**
2. Click **Console** → **Connect**
3. Run: `psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/schema.sql`

### Step 5: Create Storage Buckets

1. Open Supabase Studio: `http://your-server-ip:3001`
2. Go to **Storage**
3. Create three buckets:
   - `papers` (Public: No, File size limit: 50MB)
   - `voice-notes` (Public: No, File size limit: 10MB)
   - `tts-audio` (Public: No, File size limit: 100MB)
4. Apply storage policies from `supabase/README.md`

### Step 6: Access Your Apps

- **Paper Reader App**: `http://your-server-ip:3000`
- **Supabase Studio**: `http://your-server-ip:3001` (Database UI)
- **Supabase API**: `http://your-server-ip:8000`

---

## 🔧 Configuration & Management

### Port Mappings

#### Simple Deployment
- `3000` - Paper Reader App

#### Full Stack Deployment
- `3000` - Paper Reader App
- `3001` - Supabase Studio (Database UI)
- `5432` - PostgreSQL Database
- `8000` - Supabase API Gateway (Kong)
- `8443` - Supabase API Gateway (Kong HTTPS)

### Persistent Data

All data is stored in Docker volumes:

- `postgres-data` - Database data
- `storage-data` - Uploaded files (PDFs, voice notes)

To backup your data:

```bash
# Backup database
docker exec paper-reader-db pg_dump -U postgres postgres > backup.sql

# Backup storage
docker cp paper-reader-storage:/var/lib/storage ./storage-backup
```

### Updating the App

#### Via Portainer:
1. Go to **Stacks** → **paper-reader**
2. Click **Editor**
3. Click **Update the stack**

#### Via CLI:
```bash
cd /path/to/paper-reader
docker-compose down
docker-compose pull
docker-compose up -d
```

Or with full stack:
```bash
docker-compose -f docker-compose.full-stack.yml down
docker-compose -f docker-compose.full-stack.yml pull
docker-compose -f docker-compose.full-stack.yml up -d
```

---

## 🌐 Setting Up Reverse Proxy (Optional)

If you want to access your app via a domain name (e.g., `papers.yourdomain.local`), you can set up a reverse proxy.

### Option A: Nginx Proxy Manager (Recommended for Home Lab)

1. Install Nginx Proxy Manager via Portainer
2. Add a proxy host:
   - Domain: `papers.yourdomain.local`
   - Scheme: `http`
   - Forward Hostname/IP: `paper-reader` (or `paper-reader-app` for full stack)
   - Forward Port: `3000`
   - Enable Websockets Support

### Option B: Traefik Labels

Add these labels to the `paper-reader` service in `docker-compose.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.paper-reader.rule=Host(`papers.yourdomain.local`)"
  - "traefik.http.services.paper-reader.loadbalancer.server.port=3000"
```

---

## 🐛 Troubleshooting

### Container won't start

Check logs in Portainer:
1. Go to **Containers**
2. Click on the failing container
3. Click **Logs**

Or via CLI:
```bash
docker logs paper-reader
docker logs paper-reader-db
```

### Database connection issues

1. Ensure PostgreSQL is healthy:
```bash
docker exec paper-reader-db pg_isready -U postgres
```

2. Check if schema was applied:
```bash
docker exec paper-reader-db psql -U postgres -d postgres -c "\dt"
```

### Storage bucket errors

1. Verify buckets exist in Supabase Studio
2. Check storage policies are applied
3. Verify file permissions in storage container:
```bash
docker exec paper-reader-storage ls -la /var/lib/storage
```

### App can't connect to Supabase

1. Check environment variables:
```bash
docker exec paper-reader env | grep SUPABASE
```

2. Verify Supabase API is accessible:
```bash
curl http://localhost:8000/rest/v1/
```

---

## 📊 Monitoring & Maintenance

### View Resource Usage

In Portainer:
1. Go to **Containers**
2. Click on a container
3. View **Stats** tab

Via CLI:
```bash
docker stats
```

### Backup Strategy

Create a backup script:

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup database
docker exec paper-reader-db pg_dump -U postgres postgres > "$BACKUP_DIR/db_$DATE.sql"

# Backup storage
docker run --rm -v paper-reader_storage-data:/data -v "$BACKUP_DIR":/backup alpine tar czf /backup/storage_$DATE.tar.gz -C /data .

echo "Backup completed: $DATE"
```

Run this script daily with cron.

---

## 🔒 Security Considerations

### For Local Network Use:
- Default credentials are fine for local-only access
- Use firewall rules to prevent external access to ports

### For Internet-Facing Deployment:
- Generate strong, unique passwords and JWT secrets
- Use HTTPS (via reverse proxy with Let's Encrypt)
- Enable Supabase Auth email verification
- Regularly update Docker images
- Implement rate limiting on the reverse proxy

---

## 🚀 Performance Optimization

### For Low-End Hardware:
- Use simple deployment (cloud Supabase)
- Reduce allocated resources in docker-compose

### For High Performance:
- Use full stack deployment
- Increase database shared_buffers in PostgreSQL
- Add Redis for caching (future enhancement)

---

## 📝 Next Steps

After deployment:

1. Create your first user account
2. Upload a test PDF
3. Test TTS functionality
4. Record a voice note
5. Set up automatic backups

Enjoy your self-hosted scientific paper reader! 📚
