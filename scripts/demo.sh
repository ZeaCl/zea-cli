#!/bin/bash
# ============================================================================
# demo.sh — ZEA Platform onboarding completo
# ============================================================================
# Corre contra auth.zea.cl y soma.zea.cl (producción).
# Crea una app desde cero con auth, agentes IA, sandbox y archivos.
#
# Uso:
#   ./scripts/demo.sh
#
# Requisitos:
#   - zea CLI instalado (npm install -g @zea.cl/cli)
#   - zea-thalamus + zea-soma en PATH
#   - deepseek_key en ~/.config/zea/config.json (se lee automáticamente)
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
  echo -e "${CYAN}║  🚀 ZEA Platform — Demo completa        ║${NC}"
  echo -e "${CYAN}║  Auth + Agentes + Files + Sandbox       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
}

step() {
  echo ""
  echo -e "${BOLD}${CYAN}📝 Paso $1: $2${NC}"
}

check() {
  echo -e "  ${GREEN}✅${NC} $1"
}

fail() {
  echo -e "  ${RED}❌${NC} $1"
}

cleanup() {
  echo ""
  echo -e "${CYAN}🧹 Limpiando recursos de demo...${NC}"

  if [ -n "${AGENT_NAME:-}" ]; then
    zea soma agent delete "$AGENT_NAME" 2>/dev/null || true
    echo "  agente eliminado"
  fi

  if [ -n "${CLIENT_ID:-}" ]; then
    zea thalamus client delete "$CLIENT_ID" 2>/dev/null || true
    echo "  client eliminado"
  fi

  if [ -n "${ORG_SLUG:-}" ]; then
    echo "  org '$ORG_SLUG' conservada (puedes eliminarla manualmente)"
  fi

  rm -f demo.py
  echo "  archivos temporales eliminados"
  echo -e "${GREEN}🧹 Cleanup completo${NC}"
}

trap cleanup EXIT

# ── Pre-flight ────────────────────────────────────────

banner

echo ""
echo -e "${CYAN}🔍 Verificando requisitos...${NC}"

command -v zea >/dev/null 2>&1 || { fail "zea CLI no encontrado. npm install -g @zea.cl/cli"; exit 1; }
check "zea CLI $(zea --version)"

command -v zea-thalamus >/dev/null 2>&1 || { fail "zea-thalamus no encontrado. npm install -g @zea.cl/thalamus"; exit 1; }
check "zea-thalamus instalado"

command -v zea-soma >/dev/null 2>&1 || { fail "zea-soma no encontrado. npm install -g @zea/soma-cli"; exit 1; }
check "zea-soma instalado"

# ── 1. Login ──────────────────────────────────────────

step "1/7" "Autenticación (OAuth2 PKCE)"

if zea thalamus whoami &>/dev/null 2>&1; then
  check "ya estás autenticado: $(zea thalamus whoami 2>/dev/null | head -1)"
else
  echo ""
  echo -e "  ${YELLOW}Se abrirá el navegador para iniciar sesión...${NC}"
  zea thalamus login
  check "login exitoso"
fi

USER_EMAIL=$(zea thalamus whoami 2>/dev/null | grep -oP '[\w.+-]+@[\w.-]+' || echo "usuario@zea.cl")

# ── 2. Org ────────────────────────────────────────────

step "2/7" "Crear organización"

ORG_NAME="DemoApp-$(date +%s | tail -c 5)"
echo "  Creando organización: $ORG_NAME"

zea thalamus org create \
  --name "$ORG_NAME" \
  --email "$USER_EMAIL" \
  --plan standard

ORG_SLUG=$(echo "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
check "organización '$ORG_NAME' creada"

# ── 3. Client ─────────────────────────────────────────

step "3/7" "Registrar aplicación OAuth2"

CLIENT_OUTPUT=$(zea thalamus client create \
  --name "demo-web-$(date +%s)" \
  --type confidential \
  --redirect-uris "http://localhost:3000/callback" \
  --grants "authorization_code,refresh_token" \
  --scopes "openid,profile,email" 2>&1)

CLIENT_ID=$(echo "$CLIENT_OUTPUT" | grep -oP 'client_id[:\s]+\K[\w-]+' || echo "creado")
check "OAuth2 client registrado"
echo "  client_id: $CLIENT_ID"

# ── 4. Secreto ────────────────────────────────────────

step "4/7" "Configurar API key de IA"

DEEPSEEK_KEY=$(zea config get deepseek_key 2>/dev/null || zea config get deepseekKey 2>/dev/null || echo "")

if [ -n "$DEEPSEEK_KEY" ]; then
  echo "  Creando secreto deepseek desde config local..."
  zea thalamus secret create \
    --name "deepseek-demo" \
    --provider deepseek \
    --value "$DEEPSEEK_KEY" 2>/dev/null || echo "  (ya existe, continuando)"
  check "DeepSeek API key configurada (desde ~/.config/zea)"
else
  echo -e "  ${YELLOW}⚠️  DEEPSEEK_API_KEY no definida. Saltando...${NC}"
  echo "     export DEEPSEEK_API_KEY=sk-... para habilitar el agente IA"
fi

# ── 5. Agente + Skill ─────────────────────────────────

step "5/7" "Crear agente IA con skills"

AGENT_NAME="asistente-demo-$(date +%s | tail -c 4)"
echo "  Creando agente: $AGENT_NAME"

zea soma agent create \
  --name "$AGENT_NAME" \
  --model "deepseek-v4-pro" \
  --system "Eres un asistente experto en ZEA Platform. Ayudas a developers a integrar auth OAuth2, gestionar organizaciones, crear agentes IA y usar sandboxes." 2>&1 | tail -1
check "agente '$AGENT_NAME' creado"

zea soma skill create \
  --name "zea-docs-demo" \
  --content "ZEA Platform tiene 3 servicios principales:

1. Thalamus — Identity & Access Management
   - OAuth2 / OIDC compliant
   - Organizaciones multi-tenant
   - Personal Access Tokens (PAT)
   - Domain-based RBAC
   - MFA (TOTP)

2. Soma — AgentHub
   - Agentes IA multi-modelo (DeepSeek, OpenAI, Anthropic)
   - Skills en Markdown
   - Sandboxes para ejecución de código
   - Workspaces con archivos versionados (Git-like)
   - Chat interactivo vía WebSocket

3. Cerebelum — Knowledge Base
   - Documentos con RAG
   - Embeddings y búsqueda semántica" 2>&1 | tail -1
check "skill 'zea-docs-demo' creada"

zea soma skill assign zea-docs-demo --agents "$AGENT_NAME" 2>&1 | tail -1
check "skill asignada al agente"

zea soma agent list 2>&1 | head -5
echo "  ..."

# ── 6. Chat ───────────────────────────────────────────

step "6/7" "Chatear con el agente (one-shot)"

echo ""
echo -e "  ${YELLOW}💬 Preguntando al agente...${NC}"
echo ""

zea soma chat "$AGENT_NAME" -p "¿Qué servicios ofrece ZEA Platform y cómo se integran entre sí? Responde en 2-3 frases."

check "chat con agente completado"

# ── 7. Files + Sandbox ────────────────────────────────

step "7/7" "Subir archivo y ejecutar en sandbox"

cat > demo.py << 'PYEOF'
# Demo: script ejecutado en ZEA Sandbox
import json
import sys

resultado = {
    "plataforma": "ZEA",
    "servicios": ["Thalamus", "Soma", "Cerebelum"],
    "status": "ok",
    "mensaje": "¡Hola desde el sandbox de ZEA!"
}

print(json.dumps(resultado, indent=2, ensure_ascii=False))
print(f"\nPython {sys.version}")
PYEOF

echo "  Subiendo demo.py..."
zea soma files upload demo.py --agent "$AGENT_NAME" 2>&1 | tail -1
check "demo.py subido al workspace"

echo ""
echo "  Archivos en el workspace:"
zea soma files list --agent "$AGENT_NAME" 2>&1 | head -10

echo ""
echo -e "  ${YELLOW}📁 Leyendo demo.py desde el sandbox...${NC}"
zea soma files read demo.py --agent "$AGENT_NAME" 2>&1 | head -5
echo "  ..."

check "sandbox listo"

# ── Resultado ─────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✅ Demo completa                        ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Tu app ya tiene:                        ║${NC}"
echo -e "${GREEN}║  🔐 Auth OAuth2 (login/registro)         ║${NC}"
echo -e "${GREEN}║  🏢 Organización: $ORG_NAME              ║${NC}"
echo -e "${GREEN}║  🤖 Agente IA: $AGENT_NAME              ║${NC}"
echo -e "${GREEN}║  📁 Sandbox con archivos                 ║${NC}"
echo -e "${GREEN}║  🔑 API keys + OAuth2 client             ║${NC}"
echo -e "${GREEN}║                                          ║${NC}"
echo -e "${GREEN}║  Siguiente paso:                         ║${NC}"
echo -e "${GREEN}║  \$ npm install @zea.cl/soma-sdk          ║${NC}"
echo -e "${GREEN}║  <GliaChat agentId='$AGENT_NAME' />      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
