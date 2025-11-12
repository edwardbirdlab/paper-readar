# 🚀 Paper Reader - Quick Start Guide

Get up and running in 5 minutes!

---

## For Portainer Users

### 1️⃣ Prepare Environment Variables

Copy this into a text file:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Replace with your Supabase credentials from [supabase.com](https://supabase.com)

### 2️⃣ Deploy in Portainer

1. Open **Portainer** → **Stacks** → **Add stack**
2. Name: `paper-reader`
3. Upload: `docker-compose.yml`
4. Paste environment variables
5. Click **Deploy**

### 3️⃣ Access Your App

`http://YOUR-SERVER-IP:3000`

Example: `http://192.168.1.100:3000`

---

## For Docker CLI Users

### 1️⃣ Create Environment File

```bash
cd paper-reader
cp .env.example .env
nano .env  # Edit with your Supabase credentials
```

### 2️⃣ Deploy

```bash
docker-compose up -d
```

### 3️⃣ Check Status

```bash
docker-compose ps
docker-compose logs -f
```

### 4️⃣ Access Your App

`http://localhost:3000`

---

## Full Stack (Self-Hosted Supabase)

### Quick Deploy

```bash
./docker-deploy.sh
# Choose option 2 (Full Stack)
```

**Services**:
- App: `http://localhost:3000`
- Studio: `http://localhost:3001`
- API: `http://localhost:8000`

**Important**: Create storage buckets in Studio!
1. Open `http://localhost:3001`
2. Storage → Create buckets: `papers`, `voice-notes`, `tts-audio`

---

## Common Commands

| Action | Command |
|--------|---------|
| **Start** | `docker-compose up -d` |
| **Stop** | `docker-compose down` |
| **Logs** | `docker-compose logs -f` |
| **Restart** | `docker-compose restart` |
| **Update** | `docker-compose pull && docker-compose up -d` |

---

## Troubleshooting

### Container won't start
```bash
docker-compose logs paper-reader
```

### Can't upload files
- Check Supabase storage buckets exist
- Verify environment variables are correct

### Can't access from other devices
- Check firewall allows port 3000
- Use server's IP address, not localhost

---

## Install as Mobile App

### Android/iPhone
1. Open `http://YOUR-SERVER-IP:3000` in Chrome/Safari
2. Menu → "Add to Home Screen"
3. Confirm installation

---

## Next Steps

After deployment:

1. ✅ Upload your first PDF
2. ✅ Try the PDF viewer
3. ✅ Test text-to-speech
4. ✅ Record a voice note
5. ✅ Set up backups (see DOCKER_COMMANDS.md)

---

## Need Help?

- **Portainer Guide**: [PORTAINER_SETUP.md](PORTAINER_SETUP.md)
- **Full Docker Guide**: [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)
- **Command Reference**: [DOCKER_COMMANDS.md](DOCKER_COMMANDS.md)
- **Main README**: [README.md](README.md)

---

**That's it! You're ready to start reading papers! 📚**
