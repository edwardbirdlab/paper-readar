#!/bin/bash

# Scientific Paper Reader - Docker Deployment Script
# This script helps you deploy the self-hosted stack quickly

set -e

echo "================================"
echo "Paper Reader Docker Deployment"
echo "================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "📋 Self-Hosted Stack Deployment"
echo ""
echo "This will deploy the complete stack including:"
echo "  - PostgreSQL database"
echo "  - MinIO object storage (S3-compatible)"
echo "  - Redis job queue"
echo "  - Text processing service (Phi-3 models)"
echo "  - Text processing worker"
echo "  - Kokoro TTS service"
echo "  - TTS worker"
echo "  - Next.js app"
echo ""

# Prompt for deployment mode
echo "Choose deployment mode:"
echo "1) Development (with debugging, hot reload, verbose logging)"
echo "2) Production (optimized, minimal logging)"
echo ""
read -p "Enter option (1 or 2) [default: 1]: " MODE_OPTION
MODE_OPTION=${MODE_OPTION:-1}

if [ "$MODE_OPTION" == "1" ]; then
    NODE_ENV="development"
    echo "✅ Development mode selected"
elif [ "$MODE_OPTION" == "2" ]; then
    NODE_ENV="production"
    echo "✅ Production mode selected"
else
    echo "❌ Invalid option. Using development mode."
    NODE_ENV="development"
fi
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Generating secure credentials..."

    # Generate secure passwords
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)

    echo ""
    echo "Creating .env file with generated credentials..."

    cat > .env << EOF
# Port Mapping (External:Internal)
# App: 3001:3000
# PostgreSQL: 3002:5432
# MinIO API: 3003:9000
# MinIO Console: 3004:9001
# Redis: 3005:6379
# TTS Service: 3006:8000

# Database Configuration
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgresql://paper_reader:$POSTGRES_PASSWORD@postgres:5432/paper_reader

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD

# Application Configuration
NODE_ENV=$NODE_ENV

# TTS Worker Configuration
WORKER_CONCURRENCY=2
CPU_CORES=8

# MinIO Public Endpoint (for browser access to PDFs and audio)
# Note: This is already set in docker-compose.yml but can be overridden here
# MINIO_PUBLIC_ENDPOINT=localhost:3003
EOF

    echo "✅ .env file created with secure credentials"
    echo ""
    echo "📝 Important: Your generated passwords are:"
    echo "   PostgreSQL: $POSTGRES_PASSWORD"
    echo "   MinIO: minioadmin / $MINIO_ROOT_PASSWORD"
    echo ""
    echo "   Save these credentials securely!"
    echo ""
else
    echo "📝 .env file already exists"

    # Update NODE_ENV in existing .env file
    if grep -q "^NODE_ENV=" .env; then
        sed -i.bak "s/^NODE_ENV=.*/NODE_ENV=$NODE_ENV/" .env
        echo "✅ Updated NODE_ENV to $NODE_ENV in existing .env file"
    else
        echo "NODE_ENV=$NODE_ENV" >> .env
        echo "✅ Added NODE_ENV=$NODE_ENV to .env file"
    fi

    # Ensure DATABASE_URL is set in existing .env file
    # Extract POSTGRES_PASSWORD from .env if it exists
    if grep -q "^POSTGRES_PASSWORD=" .env; then
        POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env | cut -d'=' -f2-)

        if grep -q "^DATABASE_URL=" .env; then
            # Update existing DATABASE_URL
            sed -i.bak "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://paper_reader:$POSTGRES_PASSWORD@postgres:5432/paper_reader#" .env
            echo "✅ Updated DATABASE_URL in existing .env file"
        else
            # Add DATABASE_URL
            # Insert after POSTGRES_PASSWORD line
            sed -i.bak "/^POSTGRES_PASSWORD=/a\\
DATABASE_URL=postgresql://paper_reader:$POSTGRES_PASSWORD@postgres:5432/paper_reader" .env
            echo "✅ Added DATABASE_URL to .env file"
        fi
    else
        echo "⚠️  Warning: POSTGRES_PASSWORD not found in .env - DATABASE_URL not updated"
        echo "   Code fallback will use default credentials"
    fi

    echo ""
fi

echo "🚀 Building and starting all services..."
echo "This may take a few minutes (rebuilding from scratch)..."
echo ""

# Use docker-compose or docker compose depending on what's available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Stop and remove existing containers
echo "🛑 Stopping existing containers..."
$COMPOSE_CMD down

# Remove postgres volume to ensure fresh database initialization
echo "🗑️  Removing old database volume to reinitialize schema..."
# Try both possible volume names (in case project name varies)
VOLUME_REMOVED=false
for vol in paper-readar_postgres_data paper-reader_postgres_data; do
    if docker volume inspect $vol &>/dev/null; then
        echo "   Found volume: $vol"
        docker volume rm $vol 2>/dev/null && VOLUME_REMOVED=true && echo "   ✓ Removed $vol"
    fi
done

if [ "$VOLUME_REMOVED" = false ]; then
    echo "   ℹ️  No existing postgres volume found (this is OK for first run)"
fi

# Rebuild containers from scratch without cache
# --build: Build images before starting containers
# --force-recreate: Recreate containers even if config hasn't changed
# --no-cache: Don't use cache when building images (ensures clean build)
echo "🔨 Rebuilding all images from scratch..."
$COMPOSE_CMD build --no-cache

echo "🔄 Starting all containers..."
$COMPOSE_CMD up -d --force-recreate

echo ""
echo "⏳ Waiting for services to be healthy..."
echo "   Waiting for PostgreSQL to start..."
sleep 10

# Wait for postgres to be ready
MAX_WAIT=30
WAIT_COUNT=0
until docker compose exec -T postgres pg_isready -U paper_reader &>/dev/null || [ $WAIT_COUNT -eq $MAX_WAIT ]; do
    echo "   Still waiting for PostgreSQL... ($WAIT_COUNT/$MAX_WAIT)"
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    echo "   ⚠️  PostgreSQL took too long to start"
else
    echo "   ✓ PostgreSQL is ready"

    # Verify schema was initialized by checking if critical tables exist
    echo "   Verifying database schema..."

    # Check if schema.sql file exists and is a file (not directory)
    if [ ! -f database/schema.sql ]; then
        echo "   ❌ ERROR: database/schema.sql is missing or not a file!"
        echo "   This may indicate a Docker mount issue. Run: sudo rm -rf database/ && git pull"
        exit 1
    fi

    # Check for all critical tables
    TABLES=("papers" "paper_chunks" "tags" "paper_tags" "highlights" "notes" "audio_sessions" "reading_history")
    MISSING_TABLES=()

    # Also verify text processing migration was applied
    echo "   Verifying text processing migration..."
    if docker compose exec -T postgres psql -U paper_reader -d paper_reader -c "SELECT processing_stage FROM papers LIMIT 1" 2>/dev/null | grep -q "processing_stage"; then
        echo "   ✓ Text processing migration applied"
    else
        echo "   ℹ️  Text processing migration not yet applied (will run on first startup)"
    fi

    for table in "${TABLES[@]}"; do
        if ! docker compose exec -T postgres psql -U paper_reader -d paper_reader -c "\\dt $table" 2>/dev/null | grep -q "$table"; then
            MISSING_TABLES+=("$table")
        fi
    done

    if [ ${#MISSING_TABLES[@]} -eq 0 ]; then
        echo "   ✓ Database schema initialized successfully (all tables present)"
    else
        echo "   ⚠️  Missing tables: ${MISSING_TABLES[*]}"
        echo "   Initializing schema manually..."
        docker compose exec -T postgres psql -U paper_reader -d paper_reader -f /docker-entrypoint-initdb.d/01-schema.sql
        if [ $? -eq 0 ]; then
            echo "   ✓ Manual schema initialization successful"

            # Verify again after initialization
            STILL_MISSING=()
            for table in "${MISSING_TABLES[@]}"; do
                if ! docker compose exec -T postgres psql -U paper_reader -d paper_reader -c "\\dt $table" 2>/dev/null | grep -q "$table"; then
                    STILL_MISSING+=("$table")
                fi
            done

            if [ ${#STILL_MISSING[@]} -eq 0 ]; then
                echo "   ✓ All tables created successfully"
            else
                echo "   ❌ Failed to create tables: ${STILL_MISSING[*]}"
                exit 1
            fi
        else
            echo "   ❌ Failed to initialize schema"
            exit 1
        fi
    fi
fi

echo ""
echo "   Waiting for other services..."
sleep 5

echo ""
echo "✅ Deployment complete!"
echo ""

# Verification Section
echo "🔍 Running verification checks..."
echo ""

# Test 1: Database connectivity
echo "1️⃣  Testing database connection..."
if docker compose exec -T app node -e "
  const {Pool} = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://paper_reader:changeme@postgres:5432/paper_reader'
  });
  pool.query('SELECT NOW()')
    .then(r => {
      console.log('✓ Database connected:', r.rows[0].now);
      process.exit(0);
    })
    .catch(e => {
      console.error('✗ Database connection failed:', e.message);
      process.exit(1);
    });
" 2>/dev/null; then
    echo "   ✅ Database connection successful"
else
    echo "   ⚠️  Database connection test failed - check logs with: $COMPOSE_CMD logs app"
fi

# Test 2: Text Processing Service health
echo ""
echo "2️⃣  Testing text processing service..."
if curl -s -f http://localhost:3009/health > /dev/null 2>&1; then
    TEXT_PROC_STATUS=$(curl -s http://localhost:3009/health 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ Text processing service healthy (status: $TEXT_PROC_STATUS)"
    echo "      Note: Models load on startup - this may take 5-10 minutes on first run (~21GB download)"
else
    echo "   ⚠️  Text processing service not responding yet"
    echo "      This is normal - models are likely still loading (~5-10 minutes)"
    echo "      Check logs with: $COMPOSE_CMD logs -f text-processing"
fi

# Test 3: TTS Service health
echo ""
echo "3️⃣  Testing TTS service..."
if curl -s -f http://localhost:3006/health > /dev/null 2>&1; then
    TTS_STATUS=$(curl -s http://localhost:3006/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    echo "   ✅ TTS service healthy (status: $TTS_STATUS)"
else
    echo "   ⚠️  TTS service not responding yet - it may still be downloading models (~340MB)"
    echo "      Check logs with: $COMPOSE_CMD logs -f tts-service"
fi

# Test 4: MinIO connectivity
echo ""
echo "4️⃣  Testing MinIO storage..."
if curl -s -f http://localhost:3003/minio/health/live > /dev/null 2>&1; then
    echo "   ✅ MinIO storage accessible"
else
    echo "   ⚠️  MinIO not responding - check logs with: $COMPOSE_CMD logs minio"
fi

# Test 5: Redis connectivity
echo ""
echo "5️⃣  Testing Redis queue..."
if docker compose exec -T redis redis-cli PING 2>/dev/null | grep -q PONG; then
    TEXT_QUEUE_DEPTH=$(docker compose exec -T redis redis-cli LLEN bull:text-processing-jobs:wait 2>/dev/null || echo "0")
    TTS_QUEUE_DEPTH=$(docker compose exec -T redis redis-cli LLEN bull:tts-jobs:wait 2>/dev/null || echo "0")
    echo "   ✅ Redis queue accessible"
    echo "      Text processing queue: $TEXT_QUEUE_DEPTH jobs"
    echo "      TTS queue: $TTS_QUEUE_DEPTH jobs"
else
    echo "   ⚠️  Redis not responding - check logs with: $COMPOSE_CMD logs redis"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Access your services at:"
echo "  - Paper Reader App:      http://localhost:3001"
echo "  - MinIO Console:         http://localhost:3004"
echo "  - PostgreSQL:            localhost:3002"
echo "  - Redis:                 localhost:3005"
echo "  - TTS Service:           http://localhost:3006/health"
echo "  - Text Processing:       http://localhost:3009/health"
echo ""
echo "📦 MinIO buckets (papers, audio) are automatically created"
echo "📊 Database schema is automatically initialized"
echo ""
echo "Useful commands:"
echo "  View logs:           $COMPOSE_CMD logs -f"
echo "  View specific logs:  $COMPOSE_CMD logs -f app"
echo "  Stop services:       $COMPOSE_CMD down"
echo "  Restart:             $COMPOSE_CMD restart"
echo ""
echo "📚 For troubleshooting, see DEPLOYMENT_TROUBLESHOOTING.md"
echo ""
