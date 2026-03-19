#!/usr/bin/env bash
# Spawn Protocol — Unified Run Script
# Starts the autonomous governance swarm + dashboard simultaneously
#
# Usage: ./run.sh
# Requirements: PRIVATE_KEY and VENICE_API_KEY in .env

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  SPAWN PROTOCOL — AUTONOMOUS GOVERNANCE SWARM       ║${NC}"
echo -e "${GREEN}║  Dashboard + Agent Swarm                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"

# Check env
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
  echo "Create it with PRIVATE_KEY and VENICE_API_KEY"
  exit 1
fi

source "$ENV_FILE" 2>/dev/null || true

if [ -z "$PRIVATE_KEY" ]; then
  echo -e "${RED}Error: PRIVATE_KEY not set in .env${NC}"
  exit 1
fi

if [ -z "$VENICE_API_KEY" ]; then
  echo -e "${RED}Error: VENICE_API_KEY not set in .env${NC}"
  exit 1
fi

# Install deps if needed
echo -e "\n${BLUE}[1/4] Checking dependencies...${NC}"
if [ ! -d "$ROOT/agent/node_modules" ]; then
  echo "Installing agent dependencies..."
  cd "$ROOT/agent" && npm install --silent
fi
if [ ! -d "$ROOT/dashboard/node_modules" ]; then
  echo "Installing dashboard dependencies..."
  cd "$ROOT/dashboard" && npm install --silent
fi
echo -e "${GREEN}Dependencies ready${NC}"

# Track PIDs for cleanup
PIDS=()

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Kill any child agent processes
  pkill -f "spawn-child.ts" 2>/dev/null || true
  echo -e "${GREEN}Shutdown complete${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# Start dashboard
echo -e "\n${BLUE}[2/4] Starting dashboard...${NC}"
cd "$ROOT/dashboard"
npm run dev -- -p 3000 > /dev/null 2>&1 &
PIDS+=($!)
echo -e "${GREEN}Dashboard starting at http://localhost:3000${NC}"

# Wait for dashboard
sleep 3

# Start swarm
echo -e "\n${BLUE}[3/4] Starting autonomous swarm...${NC}"
cd "$ROOT/agent"
PRIVATE_KEY="$PRIVATE_KEY" \
VENICE_API_KEY="$VENICE_API_KEY" \
BASE_SEPOLIA_RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}" \
CELO_SEPOLIA_RPC_URL="${CELO_SEPOLIA_RPC_URL:-https://celo-sepolia.drpc.org}" \
SPAWN_ENS_REGISTRY_ADDRESS="${SPAWN_ENS_REGISTRY_ADDRESS:-0x29170A43352D65329c462e6cDacc1c002419331D}" \
ERC8004_REGISTRY_ADDRESS="${ERC8004_REGISTRY_ADDRESS:-0x8004A818BFB912233c491871b3d84c89A494BD9e}" \
npx tsx src/swarm.ts &
PIDS+=($!)

echo -e "\n${GREEN}[4/4] Everything is running${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Dashboard:${NC}  http://localhost:3000"
echo -e "${GREEN}Swarm:${NC}      Running (6 agents, 2 chains)"
echo -e "${GREEN}Logs:${NC}       agent_log.json (auto-updated)"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${YELLOW}Press Ctrl+C to stop everything${NC}"
echo ""

# Wait for any child to exit
wait
