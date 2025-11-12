#!/bin/bash

# Scientific Paper Reader - Docker Deployment Script
# This script helps you deploy the app quickly

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

# Deployment options
echo "Choose deployment option:"
echo "1) Simple (App + Cloud Supabase) - Recommended"
echo "2) Full Stack (App + Local Supabase)"
echo ""
read -p "Enter option (1 or 2): " OPTION

if [ "$OPTION" == "1" ]; then
    echo ""
    echo "📋 Simple Deployment Selected"
    echo ""
    echo "Before proceeding, make sure you have:"
    echo "  1. Created a Supabase project at supabase.com"
    echo "  2. Run the database schema (supabase/schema.sql)"
    echo "  3. Created storage buckets (papers, voice-notes, tts-audio)"
    echo ""
    read -p "Have you completed these steps? (y/n): " READY

    if [ "$READY" != "y" ]; then
        echo "Please complete the setup steps first. See DOCKER_DEPLOYMENT.md for details."
        exit 0
    fi

    # Check if .env exists
    if [ ! -f .env ]; then
        echo ""
        echo "Creating .env file..."
        read -p "Enter your Supabase URL: " SUPABASE_URL
        read -p "Enter your Supabase Anon Key: " SUPABASE_KEY

        cat > .env << EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_KEY
NEXT_PUBLIC_TTS_API_URL=http://localhost:8000/api/tts
TTS_API_KEY=
EOF
        echo "✅ .env file created"
    fi

    echo ""
    echo "🚀 Building and starting containers..."
    docker-compose up -d --build

    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "Access your app at: http://localhost:3000"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"

elif [ "$OPTION" == "2" ]; then
    echo ""
    echo "📋 Full Stack Deployment Selected"
    echo ""

    # Check if .env exists
    if [ ! -f .env ]; then
        echo "Generating secure credentials..."

        # Generate secure passwords
        POSTGRES_PASSWORD=$(openssl rand -base64 32)
        JWT_SECRET=$(openssl rand -base64 48)

        echo ""
        echo "Creating .env file with generated credentials..."
        cp .env.docker .env

        # Replace placeholders
        sed -i.bak "s/your-super-secret-password/$POSTGRES_PASSWORD/g" .env
        sed -i.bak "s/your-super-secret-jwt-token-with-at-least-32-characters-long/$JWT_SECRET/g" .env

        # Update URLs
        read -p "Enter your server IP (or press Enter for localhost): " SERVER_IP
        SERVER_IP=${SERVER_IP:-localhost}

        sed -i.bak "s/localhost/$SERVER_IP/g" .env

        rm .env.bak

        echo "✅ .env file created with secure credentials"
    fi

    echo ""
    echo "🚀 Building and starting full stack..."
    echo "This may take a few minutes..."

    docker-compose -f docker-compose.full-stack.yml up -d --build

    echo ""
    echo "⏳ Waiting for services to be healthy..."
    sleep 10

    echo ""
    echo "📊 Initializing database schema..."
    docker exec paper-reader-db psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/schema.sql || echo "Note: Schema may already be initialized"

    echo ""
    echo "✅ Full stack deployment complete!"
    echo ""
    echo "Access your apps at:"
    echo "  - Paper Reader: http://$SERVER_IP:3000"
    echo "  - Supabase Studio: http://$SERVER_IP:3001"
    echo "  - Supabase API: http://$SERVER_IP:8000"
    echo ""
    echo "⚠️  IMPORTANT: Create storage buckets in Supabase Studio:"
    echo "  1. Open http://$SERVER_IP:3001"
    echo "  2. Go to Storage → Create bucket"
    echo "  3. Create: papers, voice-notes, tts-audio"
    echo "  4. Apply storage policies from supabase/README.md"
    echo ""
    echo "To view logs: docker-compose -f docker-compose.full-stack.yml logs -f"
    echo "To stop: docker-compose -f docker-compose.full-stack.yml down"

else
    echo "Invalid option. Please run the script again."
    exit 1
fi

echo ""
echo "📚 For more details, see DOCKER_DEPLOYMENT.md"
