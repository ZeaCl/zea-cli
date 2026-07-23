#!/bin/bash
set -euo pipefail

# ============================================================================
# zea-cli validate.sh — CLI Core validation (router + config only)
# ============================================================================
# Service-specific E2E tests live in each service's own CI:
#   - Thalamus:  thalamus/.github/workflows/cli-e2e.yml
#   - Soma:      soma/.github/workflows/ (TBD)
# ============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0

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

echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}🧪 zea-cli Core Validation${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"

# ═══ 1. CLI basics ═══════════════════════════════════

echo -e "\n${CYAN}🧪 Test: CLI basics${NC}"

OUT=$(cmd --version 2>&1)
assert "version command works" "2.0.0" "$OUT"

OUT=$(cmd --help 2>&1)
assert "help shows name" "zea" "$OUT"

# ═══ 2. Router discovery ══════════════════════════════

echo -e "\n${CYAN}🧪 Test: Router discovery${NC}"

OUT=$(cmd --help 2>&1)
assert "help shows router description" "thin router" "$OUT"

# If external service CLIs are installed, verify they appear in help
if which zea-thalamus &>/dev/null; then
  echo -e "  ${GREEN}✅ zea-thalamus found in PATH${NC}"
  PASS=$((PASS + 1))

  # Quick smoke: verify delegation works
  OUT=$(cmd thalamus --help 2>&1 || true)
  assert "thalamus delegation works" "Identity|Commands" "$OUT"
else
  echo -e "  ${YELLOW}⚠️  zea-thalamus not in PATH (service E2E runs in thalamus repo)${NC}"
fi

if which zea-soma &>/dev/null; then
  echo -e "  ${GREEN}✅ zea-soma found in PATH${NC}"
  PASS=$((PASS + 1))

  OUT=$(cmd soma --help 2>&1 || true)
  assert "soma delegation works" "AgentHub|Commands" "$OUT"
else
  echo -e "  ${YELLOW}⚠️  zea-soma not in PATH (service E2E runs in soma repo)${NC}"
fi

# ═══ 3. Config commands ══════════════════════════════

echo -e "\n${CYAN}🧪 Test: Config commands${NC}"

OUT=$(cmd config path 2>&1)
assert "config path shows file" ".config" "$OUT"

OUT=$(cmd config list 2>&1)
assert "config list works" "Configuration|No configuration" "$OUT"

OUT=$(cmd config set test-key test-value 2>&1)
assert "config set works" "test-key" "$OUT"

OUT=$(cmd config get test-key 2>&1)
assert "config get works" "test-value" "$OUT"

OUT=$(cmd config unset test-key 2>&1)
assert "config unset works" "removed" "$OUT"

OUT=$(cmd config set-env prod 2>&1)
assert "config set-env prod works" "PROD" "$OUT"

OUT=$(cmd config set-env local 2>&1)
assert "config set-env local works" "LOCAL" "$OUT"

OUT=$(cmd config set-env invalid 2>&1 || true)
assert "config set-env invalid shows error" "Unknown" "$OUT"

# ═══ 4. Manifest (if available) ═══════════════════════

echo -e "\n${CYAN}🧪 Test: Manifest discovery${NC}"

for bin in zea-thalamus zea-soma; do
  if which "$bin" &>/dev/null; then
    if "$bin" --zea-manifest &>/dev/null 2>&1; then
      echo -e "  ${GREEN}✅ ${bin} --zea-manifest OK${NC}"
      PASS=$((PASS + 1))
    else
      echo -e "  ${YELLOW}⚠️  ${bin} --zea-manifest not implemented yet${NC}"
    fi
  fi
done

# ═══ Report ═══════════════════════════════════════════

echo -e "\n${CYAN}══════════════════════════════════════════${NC}"
echo -e "${CYAN}📊 Results${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}Failed: ${FAIL}${NC}"
  exit 1
else
  echo -e "  ${GREEN}Failed: 0${NC}"
  echo -e "\n${GREEN}✅ All core validations passed${NC}"
fi
