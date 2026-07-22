#!/bin/bash
set -euo pipefail

# ============================================================================
# zea-cli validate.sh — ephemeral validation against Thalamus + Soma
# ============================================================================
# Usage:
#   ./scripts/validate.sh              # expects ../thalamus and ../soma-sdk
#   THALAMUS_DIR=../thalamus SOMA_DIR=../soma-sdk ./scripts/validate.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
THALAMUS_DIR="${THALAMUS_DIR:-$PROJECT_DIR/../thalamus}"
SOMA_DIR="${SOMA_DIR:-$PROJECT_DIR/../soma-sdk}"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0

# ── Cleanup ────────────────────────────────────────────

cleanup() {
  echo -e "\n${CYAN}🧹 Cleaning up ephemeral containers...${NC}"
  if [ -f "$THALAMUS_DIR/docker-compose.yml" ]; then
    docker compose -f "$THALAMUS_DIR/docker-compose.yml" down -v 2>/dev/null || true
  fi
  if [ -f "$SOMA_DIR/docker-compose.test.yml" ]; then
    docker compose -f "$SOMA_DIR/docker-compose.test.yml" down -v 2>/dev/null || true
  fi
  echo -e "${CYAN}🧹 Done.${NC}"
}
trap cleanup EXIT

# ── Helpers ────────────────────────────────────────────

wait_for_health() {
  local url="$1"; local name="$2"; local max="${3:-60}"
  echo -ne "${CYAN}⏳ Waiting for ${name} (${url})...${NC}"
  for i in $(seq 1 "$max"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo -e " ${GREEN}ready (${i}s)${NC}"
      return 0
    fi
    sleep 2; echo -n "."
  done
  echo -e " ${RED}FAILED after ${max}s${NC}"
  return 1
}

assert() {
  local desc="$1"; local expected="$2"; local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo -e "  ${GREEN}✅${NC} ${desc}"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}❌${NC} ${desc}"
    echo -e "     expected to contain: ${YELLOW}${expected}${NC}"
    echo -e "     actual: ${actual}"
    FAIL=$((FAIL + 1))
  fi
}

cmd() {
  node "$PROJECT_DIR/src/index.js" "$@"
}

# ── Pre-flight checks ─────────────────────────────────

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}🧪 zea-cli Validation${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

echo -e "\n${CYAN}📋 Pre-flight${NC}"
echo "  thalamus: ${THALAMUS_DIR}"
echo "  soma:     ${SOMA_DIR}"
echo "  cli:      ${PROJECT_DIR}"

# ── 1. Start Thalamus ─────────────────────────────────

echo -e "\n${CYAN}🚀 Starting Thalamus...${NC}"
docker compose -f "$THALAMUS_DIR/docker-compose.yml" up -d postgres redis 2>&1 | tail -1
# Wait for PostgreSQL to be ready
for i in $(seq 1 30); do
  if docker compose -f "$THALAMUS_DIR/docker-compose.yml" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "  ${GREEN}PostgreSQL ready (${i}s)${NC}"
    break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { echo -e "${RED}❌ PostgreSQL failed${NC}"; exit 1; }
done

docker compose -f "$THALAMUS_DIR/docker-compose.yml" up -d thalamus 2>&1 | tail -1
wait_for_health "http://localhost:4100/api/public/health" "Thalamus" 120 || {
  echo -e "${RED}❌ Thalamus failed to start${NC}"
  docker compose -f "$THALAMUS_DIR/docker-compose.yml" logs thalamus | tail -30
  exit 1
}

# ── 2. Start Soma ─────────────────────────────────────

echo -e "\n${CYAN}🐘 Starting Soma...${NC}"
docker compose -f "$SOMA_DIR/docker-compose.test.yml" up -d 2>&1 | tail -1
wait_for_health "http://localhost:4084/health" "Soma" 90 || {
  echo -e "${RED}❌ Soma failed to start${NC}"
  docker compose -f "$SOMA_DIR/docker-compose.test.yml" logs soma | tail -30
  exit 1
}

# Run Soma migrations
docker compose -f "$SOMA_DIR/docker-compose.test.yml" exec -T soma bin/soma eval "Soma.Release.migrate" 2>/dev/null || true

# ── 3. Install CLI ────────────────────────────────────

echo -e "\n${CYAN}📦 Installing zea-cli...${NC}"
cd "$PROJECT_DIR"
npm install --silent 2>&1 | tail -1

# ── 4. Test: basic CLI ────────────────────────────────

echo -e "\n${CYAN}🧪 Test: CLI basics${NC}"

OUT=$(cmd --version 2>&1)
assert "version command works" "2.0.0" "$OUT"

OUT=$(cmd --help 2>&1)
assert "help shows name" "zea" "$OUT"

# ── 5. Test: Thalamus service ─────────────────────────

echo -e "\n${CYAN}🧪 Test: Thalamus service${NC}"

# Set config for local Thalamus
cmd config set apiUrl "http://localhost:4100" 2>/dev/null || true

# Direct login (password grant)
OUT=$(cmd thalamus auth login --email admin@zea.local --password Admin123! 2>&1 || true)
assert "login succeeds" "Successfully" "$OUT"

OUT=$(cmd thalamus health 2>&1 || true)
assert "thalamus health" "ok" "$OUT"

OUT=$(cmd thalamus org list 2>&1 || true)
assert "org list returns data" "org" "$OUT"

# ── 6. Test: Soma service ─────────────────────────────

echo -e "\n${CYAN}🧪 Test: Soma service${NC}"

OUT=$(cmd soma health 2>&1 || true)
assert "soma health" "ok" "$OUT"

# ── 7. Test: Error handling ───────────────────────────

echo -e "\n${CYAN}🧪 Test: Error handling${NC}"

OUT=$(cmd thalamus org show nonexistent 2>&1 || true)
assert "404 shows proper message" "not found" "$OUT"

OUT=$(cmd --invalid-flag 2>&1 || true)
assert "unknown flag handled" "unknown|error" "$OUT"

# ── Report ────────────────────────────────────────────

echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}📊 Results${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: ${FAIL}${NC}"
  exit 1
else
  echo -e "  ${GREEN}Failed: 0${NC}"
  echo -e "\n${GREEN}✅ All validations passed${NC}"
fi
