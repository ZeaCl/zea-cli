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

# 1. CLI (zea + glia)
echo "   📦 Instalando CLI..."
npm install -g github:ZeaCl/zea-agent-skill 2>/dev/null && echo "   ✅ zea + glia instalados" || echo "   ⚠️  npm install falló, probá: npm install -g github:ZeaCl/zea-agent-skill"

# 2. Agent skills (si npx skills está disponible)
if command -v npx &> /dev/null; then
  echo "   🧠 Instalando skills..."
  npx skills add ZeaCl/zea-agent-skill --yes --global 2>/dev/null && \
    echo "   ✅ Skills instaladas" || \
    echo "   ⚠️  Skills: probá manualmente con npx skills add ZeaCl/zea-agent-skill"
else
  echo "   ⚠️  npx no disponible — skills no instaladas"
fi

echo ""
echo "   ═══ Instalación completa ═══"
echo ""
echo "   Probalo:"
echo ""
echo "     glia '¿Cuántos fondos hay?'"
echo ""
echo "   Más info: https://github.com/ZeaCl/zea-agent-skill"
echo ""
