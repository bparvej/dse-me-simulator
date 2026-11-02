#!/bin/bash
# ============================================================
# DSE-ME Simulator — Docker Deployment & Test Script (Bash)
# ============================================================

set -e

COMPOSE_FILE="docker-compose.yml"

if [ "$1" == "--standalone" ]; then
  COMPOSE_FILE="docker-compose.standalone.yml"
  echo "Operating in Standalone Mode (No external MySQL requirement)"
elif [ "$1" == "--stop" ]; then
  echo "Stopping containers..."
  docker compose -f docker-compose.standalone.yml down 2>/dev/null || true
  docker compose down
  echo "Containers stopped."
  exit 0
fi

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

echo "Building and starting DSE-ME Simulator..."
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d

echo "Container status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "============================================================"
echo "  DSE-ME Simulator is RUNNING!"
echo "============================================================"
echo "  • FIX TCP Port       : 9876 (Exposed to OMS clients)"
echo "  • Web Dashboard & UI : http://localhost:3000"
echo "  • Health Endpoint    : http://localhost:3000/health"
echo "  • FIX Session CompIDs: Sender: DSESIM | Target: OMSFIRM"
echo "============================================================"
echo ""
echo "To test FIX communication immediately, run:"
echo "  node scripts/test-fix-client.js"
echo ""

