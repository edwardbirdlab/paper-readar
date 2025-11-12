# Quick Setup Guide for Portainer

This is a simplified guide for deploying the Paper Reader app using Portainer.

## 🚀 Quick Deployment (5 minutes)

### Step 1: Prepare Your Environment File

Copy this template and fill in your Supabase credentials:

```env
# Copy this entire block into Portainer's Environment Variables section

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_TTS_API_URL=http://localhost:8000/api/tts
TTS_API_KEY=
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

Once deployed, access the app at:
- **Your App**: `http://YOUR-SERVER-IP:3000`

Example: If your server IP is `192.168.1.100`, go to `http://192.168.1.100:3000`

---

## ✅ Verification Checklist

After deployment, verify everything works:

- [ ] Navigate to `http://YOUR-SERVER-IP:3000`
- [ ] You see the home page
- [ ] Click "Upload Paper" - upload page loads
- [ ] Try uploading a PDF (should work if Supabase is configured)
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
- **URL**: `http://YOUR-SERVER-IP:3000`
- Example: `http://192.168.1.100:3000`

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
1. Open `http://YOUR-SERVER-IP:3000`
2. Tap menu (three dots)
3. Tap "Add to Home screen"
4. Confirm installation

### On iPhone (Safari)
1. Open `http://YOUR-SERVER-IP:3000`
2. Tap Share button
3. Tap "Add to Home Screen"
4. Confirm installation

### On Desktop (Chrome/Edge)
1. Open `http://YOUR-SERVER-IP:3000`
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
- Port 3000 already in use
- Invalid Supabase credentials

### Can't upload files

**Check**:
- Supabase storage buckets are created
- Storage policies are configured
- Network connection to Supabase

### App is slow

**Possible causes**:
- Server has limited resources
- Network latency to Supabase
- Large PDF files

**Solutions**:
- Allocate more RAM to container
- Use local Supabase (see DOCKER_DEPLOYMENT.md)
- Optimize PDF file sizes

---

## 🔒 Security Tips

### For Local Network Only
- Keep default settings
- Use firewall to block external access to ports
- No HTTPS needed

### For Internet Access
- Use reverse proxy (Nginx Proxy Manager)
- Enable HTTPS with Let's Encrypt
- Use strong Supabase passwords
- Enable rate limiting

---

## 📊 Resource Usage

Typical resource usage:
- **RAM**: ~300-500 MB
- **CPU**: Low (~5% idle, ~30% when processing PDFs)
- **Disk**: ~500 MB (app) + storage for uploaded PDFs

### Minimum Requirements
- **RAM**: 1 GB available
- **CPU**: 1 core
- **Disk**: 5 GB available

### Recommended for Full Stack
- **RAM**: 4 GB available
- **CPU**: 2+ cores
- **Disk**: 20 GB available

---

## 🆘 Need Help?

1. **Check logs** in Portainer
2. **Review** DOCKER_DEPLOYMENT.md for detailed troubleshooting
3. **Verify** your Supabase configuration
4. **Ensure** all environment variables are set correctly

---

## 🎯 Next Steps

After successful deployment:

1. **Create an account** (if using auth)
2. **Upload a test PDF**
3. **Try the PDF viewer**
4. **Test text-to-speech**
5. **Record a voice note**
6. **Set up automatic backups** (see DOCKER_DEPLOYMENT.md)

Enjoy your self-hosted paper reader! 📚
