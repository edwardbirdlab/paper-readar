#!/bin/bash

# TTS Pipeline Diagnostic Script
# Automatically diagnoses common issues with the Paper Reader TTS stack

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS=0
FAIL=0
WARN=0

echo -e "${BLUE}================================================"
echo "  Paper Reader TTS Stack - Diagnostic Tool"
echo "  Version 2.0.1 - November 2025"
echo -e "================================================${NC}\n"

# Helper functions
pass() {
  echo -e "${GREEN}✓${NC} $1"
  PASS=$((PASS + 1))
}

fail() {
  echo -e "${RED}✗${NC} $1"
  FAIL=$((FAIL + 1))
}

warn() {
  echo -e "${YELLOW}⚠${NC} $1"
  WARN=$((WARN + 1))
}

info() {
  echo -e "${BLUE}ℹ${NC} $1"
}

section() {
  echo -e "\n${BLUE}▶ $1${NC}"
  echo "----------------------------------------"
}

# Phase 1: Pre-requisites
section "Phase 1: Prerequisites Check"

# Check Docker
if command -v docker &> /dev/null; then
  DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
  pass "Docker installed (version $DOCKER_VERSION)"
else
  fail "Docker not installed"
  echo "   Install: curl -fsSL https://get.docker.com | sudo sh"
  exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
  COMPOSE_VERSION=$(docker compose version | grep -oP 'v\K[0-9.]+' | head -1)
  pass "Docker Compose available (version $COMPOSE_VERSION)"
else
  fail "Docker Compose not available"
  exit 1
fi

# Check Docker daemon
if docker ps &> /dev/null 2>&1; then
  pass "Docker daemon running"
else
  if sudo docker ps &> /dev/null 2>&1; then
    warn "Docker requires sudo (permission issue)"
    echo "   Fix: sudo chmod 666 /var/run/docker.sock"
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker compose"
  else
    fail "Docker daemon not running"
    echo "   Start: sudo service docker start"
    exit 1
  fi
fi

# Set docker commands
DOCKER_CMD=${DOCKER_CMD:-docker}
COMPOSE_CMD=${COMPOSE_CMD:-docker compose}

# Check .env file
if [ -f .env ]; then
  pass ".env file exists"
else
  warn ".env file missing"
  echo "   Creating from .env.example..."
  if [ -f .env.example ]; then
    cp .env.example .env
    pass "Created .env from .env.example"
  else
    fail "No .env.example found"
  fi
fi

# Check port availability
section "Phase 2: Port Availability"

PORTS=("3001:App" "3002:PostgreSQL" "3003:MinIO-API" "3004:MinIO-Console" "3005:Redis" "3006:TTS")
for port_info in "${PORTS[@]}"; do
  PORT="${port_info%%:*}"
  NAME="${port_info##*:}"

  if sudo netstat -tulpn 2>/dev/null | grep -q ":$PORT " || ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
    warn "Port $PORT ($NAME) is in use"
  else
    pass "Port $PORT ($NAME) available"
  fi
done

# Phase 3: Docker Services
section "Phase 3: Docker Services Status"

if $COMPOSE_CMD ps &> /dev/null; then
  RUNNING_SERVICES=$($COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null | wc -l)
  TOTAL_SERVICES=$($COMPOSE_CMD ps --services 2>/dev/null | wc -l)

  if [ "$RUNNING_SERVICES" -eq 0 ]; then
    warn "No services running"
    echo ""
    read -p "Would you like to start the stack now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      info "Starting Docker stack..."
      $COMPOSE_CMD up -d
      sleep 10
      RUNNING_SERVICES=$($COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null | wc -l)
    fi
  fi

  info "Services: $RUNNING_SERVICES/$TOTAL_SERVICES running"

  # Check individual services
  REQUIRED_SERVICES=("postgres" "minio" "redis" "tts-service" "tts-worker" "app")
  for service in "${REQUIRED_SERVICES[@]}"; do
    if $COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null | grep -q "^$service$"; then
      # Check if healthy
      if $COMPOSE_CMD ps --format json 2>/dev/null | jq -r ".[] | select(.Service==\"$service\") | .Health" | grep -q "healthy"; then
        pass "$service (healthy)"
      else
        warn "$service (running but not healthy)"
      fi
    else
      fail "$service (not running)"
    fi
  done
else
  warn "Docker Compose stack not started"
  echo ""
  read -p "Would you like to start it now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Starting Docker stack..."
    $COMPOSE_CMD up -d
    sleep 10
  fi
fi

# Phase 4: Database Connectivity
section "Phase 4: Database Connectivity"

if $COMPOSE_CMD exec -T postgres psql -U paper_reader -d paper_reader -c "SELECT 1" &> /dev/null; then
  pass "PostgreSQL connection successful"

  # Check schema
  AUDIO_DURATION_TYPE=$($COMPOSE_CMD exec -T postgres psql -U paper_reader -d paper_reader -tAc \
    "SELECT data_type FROM information_schema.columns WHERE table_name='paper_chunks' AND column_name='audio_duration'" 2>/dev/null)

  if [ "$AUDIO_DURATION_TYPE" = "numeric" ]; then
    pass "Database schema correct (audio_duration: NUMERIC)"
  else
    fail "Database schema incorrect (audio_duration: $AUDIO_DURATION_TYPE)"
    echo "   Expected: NUMERIC(10,2)"
    echo "   Fix: docker compose down -v && docker compose up -d"
  fi

  # Check table exists
  TABLE_COUNT=$($COMPOSE_CMD exec -T postgres psql -U paper_reader -d paper_reader -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('papers','paper_chunks')" 2>/dev/null)

  if [ "$TABLE_COUNT" -eq 2 ]; then
    pass "Required tables exist"
  else
    fail "Tables missing (found $TABLE_COUNT/2)"
  fi
else
  fail "PostgreSQL connection failed"
fi

# Phase 5: MinIO Storage
section "Phase 5: MinIO Storage"

if curl -sf http://localhost:3003/minio/health/live &> /dev/null; then
  pass "MinIO service accessible"

  # Check buckets (requires mc client in container)
  BUCKETS=$($COMPOSE_CMD exec -T minio sh -c "mc alias set myminio http://localhost:9000 \$MINIO_ROOT_USER \$MINIO_ROOT_PASSWORD &>/dev/null && mc ls myminio 2>/dev/null | awk '{print \$5}'" 2>/dev/null || echo "")

  for bucket in "papers" "audio"; do
    if echo "$BUCKETS" | grep -q "^$bucket/$"; then
      pass "Bucket '$bucket' exists"
    else
      warn "Bucket '$bucket' missing"
      echo "   Fix: docker compose up -d minio-init"
    fi
  done
else
  fail "MinIO not accessible"
fi

# Phase 6: Redis Queue
section "Phase 6: Redis Queue"

if $COMPOSE_CMD exec -T redis redis-cli PING 2>&1 | grep -q "PONG"; then
  pass "Redis connection successful"

  # Check queue stats
  WAITING=$($COMPOSE_CMD exec -T redis redis-cli LLEN "bull:tts-jobs:wait" 2>/dev/null || echo "0")
  ACTIVE=$($COMPOSE_CMD exec -T redis redis-cli LLEN "bull:tts-jobs:active" 2>/dev/null || echo "0")
  COMPLETED=$($COMPOSE_CMD exec -T redis redis-cli LLEN "bull:tts-jobs:completed" 2>/dev/null || echo "0")
  FAILED=$($COMPOSE_CMD exec -T redis redis-cli LLEN "bull:tts-jobs:failed" 2>/dev/null || echo "0")

  info "Queue: Waiting=$WAITING, Active=$ACTIVE, Completed=$COMPLETED, Failed=$FAILED"

  if [ "$FAILED" -gt 0 ]; then
    warn "$FAILED failed jobs in queue"
    echo "   Check: docker compose logs tts-worker"
  fi
else
  fail "Redis connection failed"
fi

# Phase 7: TTS Service
section "Phase 7: TTS Service"

if curl -sf http://localhost:3006/health &> /dev/null; then
  TTS_STATUS=$(curl -s http://localhost:3006/health | jq -r '.status' 2>/dev/null || echo "unknown")
  MODEL_LOADED=$(curl -s http://localhost:3006/health | jq -r '.model_loaded' 2>/dev/null || echo "false")

  if [ "$MODEL_LOADED" = "true" ]; then
    pass "TTS service healthy (model loaded)"
  else
    warn "TTS service running (model not loaded)"
    echo "   First run downloads ~900MB models - check logs"
    echo "   Monitor: docker compose logs -f tts-service"
  fi
else
  fail "TTS service not accessible"
  echo "   Check: docker compose logs tts-service"
fi

# Phase 8: TTS Worker
section "Phase 8: TTS Worker"

if $COMPOSE_CMD ps --services --filter "status=running" 2>/dev/null | grep -q "^tts-worker$"; then
  pass "TTS worker running"

  # Check worker logs for startup message
  if $COMPOSE_CMD logs tts-worker 2>/dev/null | grep -q "TTS Worker started"; then
    pass "TTS worker initialized"
  else
    warn "TTS worker may not be initialized"
    echo "   Check: docker compose logs tts-worker"
  fi
else
  fail "TTS worker not running"
fi

# Phase 9: Web Application
section "Phase 9: Web Application"

if curl -sf http://localhost:3001/api/papers &> /dev/null; then
  pass "Web app API accessible"

  # Check paper count
  PAPER_COUNT=$(curl -s http://localhost:3001/api/papers | jq '. | length' 2>/dev/null || echo "0")
  info "Papers in database: $PAPER_COUNT"
else
  fail "Web app not accessible"
  echo "   Check: docker compose logs app"
fi

# Phase 10: End-to-End Test
section "Phase 10: Quick Functionality Test"

info "Testing API endpoints..."

# Test health
if curl -sf http://localhost:3006/health &> /dev/null; then
  pass "TTS health endpoint working"
else
  fail "TTS health endpoint failed"
fi

# Test voices
if curl -sf http://localhost:3006/voices &> /dev/null; then
  VOICE_COUNT=$(curl -s http://localhost:3006/voices | jq '.voices | length' 2>/dev/null || echo "0")
  pass "TTS voices endpoint working ($VOICE_COUNT voices)"
else
  fail "TTS voices endpoint failed"
fi

# Summary
section "Diagnostic Summary"

echo ""
echo -e "${GREEN}Passed:${NC}  $PASS"
echo -e "${YELLOW}Warnings:${NC} $WARN"
echo -e "${RED}Failed:${NC}  $FAIL"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
  echo -e "${GREEN}✓ All systems operational!${NC}"
  echo ""
  echo "Ready to use:"
  echo "  • Web App:      http://localhost:3001"
  echo "  • MinIO Console: http://localhost:3004"
  echo "  • API Docs:     http://localhost:3006"
  echo ""
  echo "Upload a test PDF:"
  echo "  curl -X POST http://localhost:3001/api/papers/upload -F 'file=@test.pdf'"
elif [ $FAIL -eq 0 ]; then
  echo -e "${YELLOW}⚠ System operational with warnings${NC}"
  echo ""
  echo "Review warnings above and check:"
  echo "  • docker compose logs [service-name]"
  echo "  • TTS_DIAGNOSTICS.md for troubleshooting"
else
  echo -e "${RED}✗ System has critical issues${NC}"
  echo ""
  echo "Actions to take:"
  echo "  1. Review failed checks above"
  echo "  2. Check service logs: docker compose logs"
  echo "  3. Consult TTS_DIAGNOSTICS.md"
  echo "  4. Restart stack: docker compose down && docker compose up -d"
fi

echo ""
echo "For detailed troubleshooting, see:"
echo "  • TTS_DIAGNOSTICS.md"
echo "  • docker compose logs -f"
echo ""

exit $FAIL
