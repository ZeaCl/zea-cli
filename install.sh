#!/bin/bash
set -e

echo ""
echo "   ═══ ZEA Platform — Instalación ═══"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "   ❌ Node.js no encontrado. Instalalo desde https://nodejs.org"
  exit 1
fi

echo "   node $(node -v)"

# 1. Install CLI
echo "   📦 Instalando CLI..."
npm install -g github:ZeaCl/zea-cli 2>/dev/null && echo "   ✅ zea instalado" || echo "   ⚠️  npm install falló, probá: npm install -g github:ZeaCl/zea-cli"

# 2. Agent skills
if command -v npx &> /dev/null; then
  echo "   🧠 Instalando skills..."
  npx skills add ZeaCl/zea-agent-skill --yes --global 2>/dev/null && \
    echo "   ✅ Skills instaladas" || \
    echo "   ⚠️  Skills: probá manualmente con npx skills add ZeaCl/zea-agent-skill"
else
  echo "   ⚠️  npx no disponible — skills no instaladas"
fi

# 3. Configure API keys
echo ""
echo "   ═══ Configuración ═══"
echo ""

read -p "   DeepSeek API Key (opcional, para Glia agent): " DS_KEY
if [ -n "$DS_KEY" ]; then
  zea thalamus config set deepseek_key "$DS_KEY" 2>/dev/null && echo "   ✅ DeepSeek API Key configurada" || echo "   ⚠️  No se pudo guardar (probá: zea thalamus config set deepseek_key <key>)"
fi

read -p "   Glia URL [http://localhost:4002]: " GLIA_URL
GLIA_URL=${GLIA_URL:-http://localhost:4002}
zea thalamus config set gliaUrl "$GLIA_URL" 2>/dev/null && echo "   ✅ Glia URL: $GLIA_URL" || echo "   ⚠️  No se pudo guardar"

echo ""
echo "   ═══ Instalación completa ═══"
echo ""
echo "   Probalo:"
echo ""
echo "     zea glia chat '¿Cuántos fondos hay en Venture?'"
echo "     zea glia console"
echo "     zea doctor check glia"
echo ""
echo "   Configuración adicional:"
echo ""
echo "     zea thalamus config set deepseek_key <key>"
echo "     zea thalamus config list"
echo ""
echo "   Más info: https://github.com/ZeaCl/zea-cli"
echo "   Instalar servicios:"
echo "     npm install -g github:ZeaCl/thalamus  # zea thalamus auth|org|config|..."
echo ""
