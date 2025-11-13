# Quick Setup Guide for Portainer

This is a simplified guide for deploying the Paper Reader app using Portainer.

## 🚀 Quick Deployment (5 minutes)

### Step 1: Prepare Your Environment File

Copy this template and fill in your secure passwords:

```env
# Copy this entire block into Portainer's Environment Variables section

# Database Configuration
POSTGRES_PASSWORD=your_secure_password_here

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=your_minio_password_here

# Application Configuration
NODE_ENV=production

# TTS Worker Configuration
WORKER_CONCURRENCY=2
CPU_CORES=8
```

**Generate secure passwords:**
```bash
# On your server, generate random passwords:
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 24  # For MINIO_ROOT_PASSWORD
```

### Step 2: Deploy via Portainer

1. **Open Portainer** → Go to your local environment
2. **Click "Stacks"** → Click "Add stack"
3. **Name it**: `paper-reader`
4. **Build method**: Choose "Upload"
5. **Upload file**: Select `docker-compose.yml` from this project
6. **Environment variables**: Click "Add an environment variable" and paste the template above, or use "Advanced mode" and paste all variables at once
7. **Click "Deploy the stack"**

### Step 3: Wait for Deployment

- Portainer will pull the images and build the container
- This takes 2-5 minutes on first deploy
- Watch the progress in the Portainer UI

### Step 4: Access Your App

Once deployed, access the services at:
- **Paper Reader App**: `http://YOUR-SERVER-IP:3001`
- **MinIO Console**: `http://YOUR-SERVER-IP:3004` (for storage management)

Example: If your server IP is `192.168.1.100`:
- App: `http://192.168.1.100:3001`
- MinIO: `http://192.168.1.100:3004`

**Port Reference:**
- 3001: App
- 3002: PostgreSQL
- 3003: MinIO API
- 3004: MinIO Console
- 3005: Redis
- 3006: TTS Service

---

## ✅ Verification Checklist

After deployment, verify everything works:

- [ ] Navigate to `http://YOUR-SERVER-IP:3001` - you see the home page
- [ ] Check all containers are running in Portainer (6 containers)
- [ ] Open MinIO Console at `http://YOUR-SERVER-IP:3004`
- [ ] Verify `papers` and `audio` buckets exist in MinIO
- [ ] Click "Upload Paper" in the app - upload page loads
- [ ] Try uploading a small PDF
- [ ] Check TTS worker logs for processing activity
- [ ] Check container logs in Portainer (no errors)

---

## 🔧 Managing Your Stack

### View Logs
1. Go to **Stacks** → **paper-reader**
2. Click the container name
3. Click **Logs**

### Restart the App
1. Go to **Stacks** → **paper-reader**
2. Click the container name
3. Click **Restart**

### Update the App
1. Go to **Stacks** → **paper-reader**
2. Click **Editor**
3. Make your changes
4. Click **Update the stack**
5. Check "Re-pull image and redeploy"

### Stop the App
1. Go to **Stacks** → **paper-reader**
2. Click **Stop this stack**

### Remove the App
1. Go to **Stacks** → **paper-reader**
2. Click **Delete this stack**
3. Confirm deletion

---

## 🌐 Accessing from Other Devices

### On Your Local Network

From any device on the same network:
- **App URL**: `http://YOUR-SERVER-IP:3001`
- **MinIO Console**: `http://YOUR-SERVER-IP:3004`
- Example: `http://192.168.1.100:3001`

### Find Your Server IP

On your server, run:
```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

Or on Windows:
```bash
ipconfig
```

---

## 📱 Install as PWA

Once the app is running:

### On Android (Chrome)
1. Open `http://YOUR-SERVER-IP:3001`
2. Tap menu (three dots)
3. Tap "Add to Home screen"
4. Confirm installation

### On iPhone (Safari)
1. Open `http://YOUR-SERVER-IP:3001`
2. Tap Share button
3. Tap "Add to Home Screen"
4. Confirm installation

### On Desktop (Chrome/Edge)
1. Open `http://YOUR-SERVER-IP:3001`
2. Look for install icon in address bar
3. Click "Install"

---

## 🐛 Common Issues

### Container won't start

**Check logs**:
1. Portainer → Stacks → paper-reader
2. Click container name → Logs

**Common causes**:
- Missing environment variables
- Ports 3001-3006 already in use
- Insufficient RAM or disk space
- Database connection errors

### Can't upload files

**Check**:
- MinIO container is running (check Portainer)
- MinIO buckets (`papers`, `audio`) were created
- Check MinIO console at `http://YOUR-SERVER-IP:3004`
- Check app logs for upload errors

### TTS not processing

**Check**:
- TTS worker container is running
- TTS service container is running
- Check worker logs for errors
- Verify Redis is running
- Check queue status in Redis

### App is slow

**Possible causes**:
- Server has limited resources (CPU/RAM)
- TTS processing using CPU
- Large PDF files

**Solutions**:
- Allocate more RAM (recommended: 4GB+)
- Increase `CPU_CORES` in environment variables
- Scale TTS workers for parallel processing
- Optimize PDF file sizes

---

## 🔒 Security Tips

### For Local Network Only
- Keep default settings
- Use firewall to block external access to ports
- No HTTPS needed

### For Internet Access
- Use reverse proxy (Nginx Proxy Manager, Traefik)
- Enable HTTPS with Let's Encrypt
- Use strong PostgreSQL and MinIO passwords
- Enable rate limiting
- Restrict access to internal ports (3002-3006)

---

## 📊 Resource Usage

Typical resource usage (all 6 containers):
- **RAM**: ~2-3 GB (idle), ~4-6 GB (active TTS processing)
- **CPU**: ~10% idle, ~80-100% when generating TTS audio
- **Disk**: ~2 GB (images) + 10GB+ (PDFs + audio files)

### System Requirements
**Minimum**:
- **RAM**: 4 GB total (2GB available for containers)
- **CPU**: 2 cores
- **Disk**: 20 GB available

**Recommended**:
- **RAM**: 8 GB+ total (4GB+ available)
- **CPU**: 4-8+ cores (better TTS performance)
- **Disk**: 50 GB+ available

**Optimal Performance**:
- **RAM**: 16 GB+ total
- **CPU**: 8-16 cores (for fast parallel TTS)
- **Disk**: 100 GB+ SSD

---

## 🆘 Need Help?

1. **Check logs** in Portainer (Stacks → paper-reader → container → Logs)
2. **Review** DOCKER_DEPLOYMENT.md for detailed troubleshooting
3. **Verify** all 6 containers are running
4. **Check** MinIO Console for bucket access
5. **Ensure** all environment variables are set correctly
6. **Monitor** TTS worker logs for processing status

---

## 🎯 Next Steps

After successful deployment:

1. **Upload a test PDF** (start with a small 10-page paper)
2. **Monitor TTS processing** in worker logs
3. **Try the PDF viewer** in "Read" tab
4. **Listen to generated audio** in "Listen" tab (wait for processing to complete)
5. **Add notes** using text or voice notes
6. **Access MinIO console** to verify storage
7. **Set up automatic backups** (see DOCKER_DEPLOYMENT.md)

Enjoy your fully self-hosted paper reader! 📚🎧
