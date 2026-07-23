#!/bin/bash
set -euo pipefail

# ============================================================================
# zea-cli validate.sh — ephemeral validation against Thalamus + Soma
# ============================================================================
# Usage:
#   ./scripts/validate.sh              # expects ../thalamus and ../soma
#   THALAMUS_DIR=../thalamus SOMA_DIR=../soma ./scripts/validate.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
THALAMUS_DIR="${THALAMUS_DIR:-$PROJECT_DIR/../thalamus}"
SOMA_DIR="${SOMA_DIR:-$PROJECT_DIR/../soma}"

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
    # Soma build can be big — clean the image too
    docker image rm soma-soma 2>/dev/null || true
  fi
  docker network rm zea-test 2>/dev/null || true
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
  zea "$@"
}

# ── Pre-flight checks ─────────────────────────────────

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}🧪 zea-cli Validation${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

echo -e "\n${CYAN}📋 Pre-flight${NC}"
echo "  thalamus: ${THALAMUS_DIR}"
echo "  soma:     ${SOMA_DIR}"
echo "  cli:      ${PROJECT_DIR}"

# ═══ Shared network ═══════════════════════════════════

echo -e "\n${CYAN}🌐 Creating shared network...${NC}"
docker network create zea-test 2>/dev/null || true
echo -e "  ${GREEN}zea-test ready${NC}"

# ═══ 1. Thalamus ══════════════════════════════════════

echo -e "\n${CYAN}🚀 Starting Thalamus...${NC}"
docker compose -f "$THALAMUS_DIR/docker-compose.yml" up -d postgres redis 2>&1 | tail -1
docker network connect zea-test thalamus-postgres-1 2>/dev/null || true
docker network connect zea-test thalamus-redis-1 2>/dev/null || true

for i in $(seq 1 30); do
  if docker compose -f "$THALAMUS_DIR/docker-compose.yml" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "  ${GREEN}PostgreSQL ready (${i}s)${NC}"
    break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { echo -e "${RED}❌ PostgreSQL failed${NC}"; exit 1; }
done

docker compose -f "$THALAMUS_DIR/docker-compose.yml" up -d thalamus 2>&1 | tail -1
docker network connect zea-test thalamus-thalamus-1 2>/dev/null || true
wait_for_health "http://localhost:4100/api/public/health" "Thalamus" 120 || {
  echo -e "${RED}❌ Thalamus failed to start${NC}"
  docker compose -f "$THALAMUS_DIR/docker-compose.yml" logs thalamus | tail -30
  exit 1
}

# ═══ 2. Soma ══════════════════════════════════════════

echo -e "\n${CYAN}🐘 Starting Soma...${NC}"
docker compose -f "$SOMA_DIR/docker-compose.test.yml" up -d postgres 2>&1 | tail -1
docker network connect zea-test soma-postgres-1 2>/dev/null || true

for i in $(seq 1 30); do
  if docker compose -f "$SOMA_DIR/docker-compose.test.yml" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "  ${GREEN}Soma PostgreSQL ready (${i}s)${NC}"
    break
  fi
  sleep 2
  [ "$i" -eq 30 ] && { echo -e "${RED}❌ Soma PostgreSQL failed${NC}"; exit 1; }
done

docker compose -f "$SOMA_DIR/docker-compose.test.yml" up -d --build soma 2>&1 | tail -3
docker network connect zea-test soma-soma-1 2>/dev/null || true

# Run migrations
echo -e "  ${CYAN}⏳ Running Soma migrations...${NC}"
docker compose -f "$SOMA_DIR/docker-compose.test.yml" exec -T soma bin/soma eval "Soma.Release.migrate" 2>&1 | tail -1 || true

wait_for_health "http://localhost:4084/health" "Soma" 120 || {
  echo -e "${RED}❌ Soma failed to start${NC}"
  docker compose -f "$SOMA_DIR/docker-compose.test.yml" logs soma | tail -30
  exit 1
}

# ═══ 3. Verify binaries ═══════════════════════════════

echo -e "\n${CYAN}🔗 Verifying CLI binaries...${NC}"
which zea || { echo -e "${RED}❌ zea not found in PATH${NC}"; exit 1; }
which zea-thalamus || { echo -e "${RED}❌ zea-thalamus not found in PATH${NC}"; exit 1; }
which zea-soma || { echo -e "${RED}❌ zea-soma not found in PATH${NC}"; exit 1; }
echo -e "  ${GREEN}zea:           $(which zea)${NC}"
echo -e "  ${GREEN}zea-thalamus:  $(which zea-thalamus)${NC}"
echo -e "  ${GREEN}zea-soma:      $(which zea-soma)${NC}"

# ═══ 3b. Dynamic manifest smoke test ═════════════════
# Uses --zea-manifest (rich JSON) to discover and validate ALL commands.
# Safe commands (no auth, no required args) get smoke-tested against real services.

smoke_test_service() {
  local bin="$1"
  local svc="$2"

  local manifest
  manifest=$("$bin" --zea-manifest 2>/dev/null) || true

  if [ -z "$manifest" ]; then
    echo -e "  ${YELLOW}⚠️  ${svc}: --zea-manifest not implemented${NC}"
    echo -e "     → Issue: ZeaCl/${svc}#42 or zea-cli#12"
    return 0
  fi

  local total=$(echo "$manifest" | jq '.commands | length' 2>/dev/null || echo "0")
  local parsed=0
  local smoked=0
  local skipped_auth=0
  local skipped_args=0

  # Iterate over each command in the manifest
  for cmd_name in $(echo "$manifest" | jq -r '.commands | keys[]' 2>/dev/null); do
    local auth
    auth=$(echo "$manifest" | jq -r ".commands[\"$cmd_name\"].auth" 2>/dev/null)

    local has_args
    has_args=$(echo "$manifest" | jq -r ".commands[\"$cmd_name\"].arguments | length" 2>/dev/null)

    # Test 1: command parses correctly (--help exits 0)
    if timeout 5 zea "$svc" $cmd_name --help >/dev/null 2>&1; then
      parsed=$((parsed + 1))
    else
      echo -e "  ${RED}❌ ${svc} ${cmd_name} --help failed${NC}"
      FAIL=$((FAIL + 1))
    fi

    # Test 2: smoke test only safe commands (no auth, no required args)
    if [ "$auth" = "true" ]; then
      skipped_auth=$((skipped_auth + 1))
    elif [ "$has_args" -gt 0 ]; then
      skipped_args=$((skipped_args + 1))
    else
      if timeout 10 zea "$svc" $cmd_name >/dev/null 2>&1; then
        smoked=$((smoked + 1))
      else
        echo -e "  ${YELLOW}⚠️  ${svc} ${cmd_name}: smoke test failed (non-critical)${NC}"
      fi
    fi
  done

  echo -e "  ${GREEN}📊 ${svc}: ${total} commands, ${parsed} parse OK, ${smoked} smoke OK${NC}"
  echo -e "     (${skipped_auth} skipped: auth required, ${skipped_args} skipped: args required)"
  PASS=$((PASS + parsed + smoked))
}

echo -e "\n${CYAN}🧪 Dynamic manifest smoke tests${NC}"
smoke_test_service zea-thalamus thalamus
smoke_test_service zea-soma soma

# ═══ 4. Test: CLI basics ══════════════════════════════

echo -e "\n${CYAN}🧪 Test: CLI basics${NC}"

OUT=$(cmd --version 2>&1)
assert "version command works" "2.0.0" "$OUT"

OUT=$(cmd --help 2>&1)
assert "help shows name" "zea" "$OUT"

# ═══ 5. Test: Thalamus ════════════════════════════════

echo -e "\n${CYAN}🧪 Test: Thalamus service${NC}"

cmd config set apiUrl "http://localhost:4100" 2>/dev/null || true

OUT=$(cmd thalamus auth login --email admin@zea.local --password Admin123! 2>&1 || true)
assert "thalamus login succeeds" "Successfully" "$OUT"

OUT=$(cmd thalamus health 2>&1 || true)
assert "thalamus health" "ok" "$OUT"

OUT=$(cmd thalamus org list 2>&1 || true)
assert "thalamus org list returns data" "org" "$OUT"

# ═══ 6. Test: Soma ════════════════════════════════════

echo -e "\n${CYAN}🧪 Test: Soma service${NC}"

OUT=$(cmd soma health 2>&1 || true)
assert "soma health" "ok" "$OUT"

# ═══ 7. Test: Error handling ══════════════════════════

echo -e "\n${CYAN}🧪 Test: Error handling${NC}"

OUT=$(cmd thalamus org show nonexistent 2>&1 || true)
assert "404 shows proper message" "not found" "$OUT"

# ═══ Report ═══════════════════════════════════════════

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
