---
name: zea
description: "ZEA Platform — CLI, API Gateway y skills para agentes de código. Usar este skill como punto de entrada a toda la plataforma. Multi-dominio: Venture Capital, Psicopedagogía, Deportes, etc."
---

# ZEA Platform — Agent Skill (Umbrella)

Skill principal de ZEA Platform. Documenta todos los skills, CLI commands, API Gateway, y arquitectura multi-dominio.

## 🧱 Skills disponibles (17)

| Skill | CLI | Descripción |
|---|---|---|
| **zea-agent** | `zea orchestrate` | **Entry point para agentes externos** — orquesta tareas complejas delegando a expertos |
| app | `zea app` | Gestión de apps: registrar, ver manifiesto, listar |
| design | `zea design` | Diseño: importar screens Stitch, cambiar colores |
| venture | `zea venture` | Venture: fondos, investors, capital calls, data |
| sdui | `zea sdui` | Server-Driven UI: manifiestos, estados, intents |
| doctor | `zea doctor` | Diagnóstico: health check de 7 capas |
| agent | `zea agent` | Gestión de agentes Glia (legacy) |
| workflow | `zea workflow` | Cerebelum Workflows: Human-in-the-Loop |
| sensor | `zea sensor` | Captura de datos: audio, WhatsApp, feedback |
| screen-functionalizer | `zea screen` | Pipeline: analizar → functionalizar → validar pantallas Stitch |
| db-dev | `zea db` | Desarrollo DB: schema, migraciones, RLS |
| api-dev | `zea venture api` | Desarrollo API: endpoints, controllers, routers |
| coach | — | Coach socrático: preguntas cuando el agente se traba |
| xlsx | — | Lectura/escritura de Excel con pandas + openpyxl |
| xlsx-import | `zea venture data import` | Pipeline: Excel → mapear → validar → importar |
| orchestrate | `zea orchestrate` | Orquestador: planificar + delegar a expertos |
| maintenance | `zea diagnose` / `zea verify` | Mantenimiento: diagnóstico, fixes, REML |

## 🏗️ Arquitectura

ZEA Platform tiene 7 expertos especializados:
- **db-expert**: SQL, RLS, migraciones
- **api-expert**: Endpoints HTTP, controllers
- **screen-expert**: Stitch → SDUI, data-zea-bind, functionalize
- **infra-expert**: Diagnóstico, fixes, deploys
- **builder-expert**: Crear nuevos comandos CLI
- **data-import-expert**: Excel/CSV → DB
- **orquestador**: Planifica y delega a los expertos (hub-and-spoke)

## 🚀 Comandos esenciales

### Orquestar (EL MÁS IMPORTANTE)
```bash
zea orchestrate "Creá un fondo Tech VC de $50M" --domain venture
zea orchestrate "El dashboard no muestra KPIs"
zea orchestrate "Importá este Excel a la plataforma"
```

### API Gateway (para integración programática)
```bash
zea server start                         # API en :4000 + WebSocket en :4091
curl POST /v1/orchestrate -d '{"message":"...","domain":"venture"}'
```

### Pantallas
```bash
zea screen functionalize --app my_app --screen dashboard --llm
zea screen gap-detect --app my_app --llm
zea design import-screen --app my_app --stitch-key $STITCH_KEY --screen-id X --state Y
```

### Datos
```bash
zea venture data import --file datos.xlsx --yes
zea venture fund list
zea db diff && zea db push --yes
```

### Diagnóstico
```bash
zea diagnose --json
zea verify --app my_app --json
zea validate --app my_app --screen dashboard --visual
zea qa status
```

## 🌐 Multi-dominio

ZEA soporta múltiples dominios de negocio. Cada dominio tiene su propio schema de DB, APIs, y pantallas:

```bash
zea orchestrate --domain venture "..."   # Venture Capital
zea orchestrate --domain psycho "..."    # Psicopedagogía
zea orchestrate --domain sports "..."    # Deportes
```

Los dominios se definen en `domains/{name}/manifest.json`.

## 📋 Protocolo de respuesta

Los expertos responden con formato estructurado:
- ✅ [COMPLETADO] → éxito con evidencia concreta
- ❌ [FALLÓ] → error que necesita diagnóstico
- ⚠️ [PARCIAL] → completado con observaciones

Si un comando falla, el orquestador automáticamente delega a infra-expert para diagnóstico y fix.

## 🤖 Para agentes de IA externos

Si sos un agente externo (Claude, Copilot, Cursor) y querés usar ZEA:
1. Instalá el skill: `npx skills add ZeaCl/zea-agent-skill --skill zea-agent`
2. Usá `zea orchestrate` para tareas complejas
3. Usá `zea server start` para exponer la API
4. Consultá `skills/zea-agent/SKILL.md` para la guía completa
