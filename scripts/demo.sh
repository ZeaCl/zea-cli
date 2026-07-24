#!/bin/bash
# ============================================================================
# demo.sh — ZEA Platform: crea tu app con agentes IA en 2 minutos
# ============================================================================
# Corre contra producción (auth.zea.cl, soma.zea.cl).
# No requiere API keys — usa el demo agent pre-configurado.
#
# Uso:
#   npm install -g @zea.cl/cli @zea.cl/thalamus @zea/soma-cli
#   zea thalamus login --device   # (solo la primera vez)
#   ./scripts/demo.sh
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  🚀 ZEA Platform — Crea tu app en 2 min ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
}

step() {
  echo ""
  echo -e "${BOLD}${CYAN}📝 $1${NC}"
}

check()  { echo -e "  ${GREEN}✅${NC} $1"; }
info()  { echo -e "  ${CYAN}ℹ️${NC}  $1"; }
warn()  { echo -e "  ${YELLOW}⚠️${NC}  $1"; }

fail() {
  echo -e "  ${RED}❌${NC} $1"
  exit 1
}

# ── 0. Pre-flight ──────────────────────────────────────

banner

for cmd in zea zea-thalamus zea-soma; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd no encontrado. Instálalo con npm install -g @zea.cl/cli @zea.cl/thalamus @zea/soma-cli"
done

if ! zea thalamus whoami &>/dev/null 2>&1; then
  echo ""
  echo -e "  ${YELLOW}Primero inicia sesión:${NC}"
  echo ""
  echo "    zea thalamus login --device"
  echo ""
  exit 0
fi

USER_NAME=$(zea thalamus whoami 2>/dev/null | grep -oP '\(.*?\)' | tr -d '()' || echo "dev")
check "Autenticado como: $USER_NAME"

# ── 1. Crear organización ──────────────────────────────

step "1/5  Creando tu organización"

SUFFIX=$(date +%s | tail -c 5)
ORG_NAME="mi-app-${SUFFIX}"

zea thalamus org create \
  --name "$ORG_NAME" \
  --email "$(zea thalamus whoami 2>/dev/null | grep -oP '[\w.+-]+@[\w.-]+')" \
  --plan free 2>&1 | tail -1

check "Organización '$ORG_NAME' creada"

# ── 2. Compartir con un miembro ────────────────────────

step "2/5  Invitando a tu equipo"

info "En producción, invita miembros con:"
echo "    zea thalamus org member add $ORG_NAME --email colega@empresa.com --role member"
info "(saltamos este paso — es una demo)"

# ── 3. Registrar app OAuth2 ────────────────────────────

step "3/5  Registrando tu aplicación web"

CLIENT_OUTPUT=$(zea thalamus client create \
  --name "mi-app-web-${SUFFIX}" \
  --type confidential \
  --redirect-uris "http://localhost:3000/callback,https://miapp.com/callback" \
  --grants "authorization_code,refresh_token" \
  --scopes "openid,profile,email" 2>&1)

check "OAuth2 client registrado"

CLIENT_ID=$(echo "$CLIENT_OUTPUT" | grep -oP 'client_id[:\s]+\K[\w-]+' || echo "N/A")
CLIENT_SECRET=$(echo "$CLIENT_OUTPUT" | grep -oP 'client_secret[:\s]+\K[\w-]+' || echo "N/A")

echo ""
echo -e "  ${BOLD}Guarda esto en tu .env:${NC}"
echo ""
echo "  ZEA_CLIENT_ID=$CLIENT_ID"
echo "  ZEA_CLIENT_SECRET=$CLIENT_SECRET"
echo "  ZEA_REDIRECT_URI=http://localhost:3000/callback"

# ── 4. Agentes IA ──────────────────────────────────────

step "4/5  Probando agentes de Soma"

echo "  Agentes disponibles:"
zea soma agent list 2>&1 | head -10

echo ""
echo -e "  ${YELLOW}💬 Preguntando a un agente público...${NC}"
echo ""

zea soma chat full-stack-dev \
  -p "¿Qué es ZEA Platform? Responde en 1-2 frases." 2>&1 || {
  warn "Chat no disponible (puede requerir API key configurada en la org)"
}

# ── 5. Health + estado ─────────────────────────────────

step "5/5  Verificando servicios"

echo "  Thalamus:"
zea thalamus health 2>&1 | head -3

echo ""
echo "  Soma:"
zea soma health 2>&1 | head -3

# ── Resultado ─────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ ¡Demo completa!                      ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Org:       ${ORG_NAME}                  ${NC}"
echo -e "${GREEN}║  Client ID: ${CLIENT_ID}                 ${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Siguientes pasos:                       ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  1. Copiá las credenciales a tu .env     ║${NC}"
echo -e "${GREEN}║  2. npm install @zea.cl/soma-sdk          ║${NC}"
echo -e "${GREEN}║  3. <GliaChat agentId='full-stack-dev' /> ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Docs: https://docs.zea.cl               ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
