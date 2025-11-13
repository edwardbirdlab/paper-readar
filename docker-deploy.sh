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
echo "This may take a few minutes on first run..."
echo ""

# Use docker-compose or docker compose depending on what's available
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

$COMPOSE_CMD up -d --build

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 15

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
