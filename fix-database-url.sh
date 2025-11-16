#!/bin/bash

# Fix DATABASE_URL in existing .env file by URL-encoding the password
# This fixes the "Cannot read properties of undefined (reading 'searchParams')" error

set -e

echo "🔧 Fixing DATABASE_URL in .env file..."
echo ""

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    exit 1
fi

# Check if jq is available (needed for URL encoding)
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq is not installed. Please install jq first:"
    echo "   sudo apt-get install jq"
    exit 1
fi

# Extract POSTGRES_PASSWORD from .env
if ! grep -q "^POSTGRES_PASSWORD=" .env; then
    echo "❌ Error: POSTGRES_PASSWORD not found in .env file"
    exit 1
fi

POSTGRES_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env | cut -d'=' -f2-)

echo "📝 Current password: $POSTGRES_PASSWORD"
echo ""

# URL-encode the password
POSTGRES_PASSWORD_ENCODED=$(printf %s "$POSTGRES_PASSWORD" | jq -sRr @uri)

echo "🔐 URL-encoded password: $POSTGRES_PASSWORD_ENCODED"
echo ""

# Backup .env file
cp .env .env.backup.$(date +%s)
echo "💾 Backed up .env to .env.backup.$(date +%s)"

# Update DATABASE_URL
if grep -q "^DATABASE_URL=" .env; then
    # Update existing DATABASE_URL
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://paper_reader:$POSTGRES_PASSWORD_ENCODED@postgres:5432/paper_reader#" .env
    echo "✅ Updated DATABASE_URL with URL-encoded password"
else
    # Add DATABASE_URL after POSTGRES_PASSWORD line
    sed -i "/^POSTGRES_PASSWORD=/a\\
DATABASE_URL=postgresql://paper_reader:$POSTGRES_PASSWORD_ENCODED@postgres:5432/paper_reader" .env
    echo "✅ Added DATABASE_URL with URL-encoded password"
fi

echo ""
echo "✅ Done! Your .env file has been fixed."
echo ""
echo "New DATABASE_URL:"
grep "^DATABASE_URL=" .env
echo ""
echo "Next steps:"
echo "1. Restart Docker services: docker compose down && docker compose up -d"
echo "2. Monitor logs: docker compose logs -f tts-worker app"
echo ""
