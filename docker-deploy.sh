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

# MinIO Configuration
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD

# Application Configuration
NODE_ENV=$NODE_ENV

# TTS Worker Configuration
WORKER_CONCURRENCY=2
CPU_CORES=8
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
echo "Access your services at:"
echo "  - Paper Reader App:  http://localhost:3001"
echo "  - MinIO Console:     http://localhost:3004"
echo "  - PostgreSQL:        localhost:3002"
echo "  - Redis:             localhost:3005"
echo "  - TTS Service:       http://localhost:3006/health"
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
echo "📚 For more details, see DOCKER_DEPLOYMENT.md"
echo ""
