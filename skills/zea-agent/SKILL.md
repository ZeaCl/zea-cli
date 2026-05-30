---
name: zea-agent
description: "ZEA Platform Agent Interface — CLI y API para construir, gestionar y operar aplicaciones de negocio. Usar este skill cuando un usuario pida crear/modificar fondos de inversión, gestionar inversores, importar datos desde Excel, functionalizar pantallas Stitch, diagnosticar la plataforma, crear aplicaciones de negocio, o cualquier tarea de Venture Capital, Private Equity, Psicopedagogía, Deportes, u otros dominios de negocio. También usar cuando se mencione 'ZEA', 'fondos', 'inversores', 'capital calls', 'Stitch', 'SDUI', 'dashboard de GP', 'compromisos', 'distribuciones', o 'importar Excel'."
---

# ZEA Agent Interface

Skill para agentes de IA externos que necesitan interactuar con ZEA Platform.

## ¿Qué es ZEA?
ZEA Platform es una plataforma agent-first para construir aplicaciones de negocio multi-dominio. Usa 7 expertos especializados (db, api, screen, infra, builder, data-import, orchestrator) con system prompts predefinidos y un protocolo de delegación hub-and-spoke.

## Instalación

```bash
npm install -g github:ZeaCl/zea-agent-skill
zea server start &     # API Gateway en :4000
```

## Comando principal: orchestrate

El 90% de las tareas se resuelven con UN comando:

```bash
zea orchestrate "descripción de lo que el cliente necesita" --domain venture
```

El orquestador:
1. Analiza la solicitud
2. Genera un plan con pasos concretos
3. Delega cada paso al experto correspondiente
4. Si un paso falla → delega a infra-expert → reintenta
5. Devuelve resultado con evidencia concreta

### Modos de uso

```bash
# Con --dry-run: solo planifica (seguro, no modifica nada)
zea orchestrate "Creá un fondo Tech VC de $50M" --domain venture --dry-run

# Sin flag: ejecuta real (crea, modifica, importa)
zea orchestrate "Creá un fondo Tech VC de $50M" --domain venture

# Con --ws: emite eventos en tiempo real vía WebSocket
zea orchestrate "Importá este Excel" --ws
```

### Dominios disponibles

```bash
zea orchestrate --domain venture "..."    # Venture Capital / Private Equity
zea orchestrate --domain psycho "..."     # Psicopedagogía
zea orchestrate --domain sports "..."     # Deportes
```

El dominio se selecciona automáticamente según el contexto del usuario (login vía Thalamus).

## API Gateway

Para integración programática (desde otro servicio, un frontend, o un SDK):

```bash
# Iniciar el gateway
zea server start
# → API REST en http://localhost:4000
# → WebSocket en ws://localhost:4091

# Llamar al orquestador via API
curl -X POST http://localhost:4000/v1/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message":"Listá los fondos registrados","domain":"venture"}'

# Health check
curl http://localhost:4000/health
```

## Comandos por área

### Pantallas Stitch
```bash
# Importar pantalla de Stitch
zea design import-screen --app sudlich_ventures --stitch-key $STITCH_KEY --screen-id X --state dashboard --intent view_dashboard

# Functionalizar (inyectar data-zea-bind + crear intents)
zea screen functionalize --app sudlich_ventures --screen dashboard --llm

# Detectar componentes sin API
zea screen gap-detect --app sudlich_ventures --llm

# Validación visual
zea validate --app sudlich_ventures --screen dashboard --visual --browser
zea validate --app sudlich_ventures --screen dashboard --visual --llm
```

### Datos (Excel → DB)
```bash
# Analizar estructura de Excel
zea screen analyze-file --file datos.xlsx --llm

# Importar a la DB
zea venture data import --file datos.xlsx --yes

# Ver datos importados
zea venture fund list
zea venture investor list
```

### Base de datos
```bash
zea db diff                    # Ver diferencias schema vs DB
zea db push --yes              # Aplicar schema
zea db migrations new --name X # Crear migración
zea venture data add-table --name X --fields '[{...}]'  # Nueva tabla + RLS
```

### APIs
```bash
zea venture api add-endpoint --method GET --path /gp/X --handler list_X
zea venture api add-endpoint --method POST --path /gp/X --handler create_X
```

### Diagnóstico y verificación
```bash
zea diagnose --json            # Diagnóstico completo
zea verify --app X --json      # Verificar APIs + bindings
zea verify --app X --llm       # Verificación con reporte LLM
zea qa status                  # Progreso del plan de pruebas
zea qa report                  # Reporte detallado
```

### Mejora iterativa
```bash
zea improve --skill screen-functionalizer --test F2 --dry-run
zea improve --skill screen-functionalizer --test F2 --max-iterations 3
```

### Expert sessions
```bash
zea session create --expert db     # Crear sesión de DB expert
zea session create --expert api    # Crear sesión de API expert
zea session list                   # Listar sesiones activas
```

### Branching (GitFlow)
```bash
zea branch create --name feat-X --yes
zea branch diff --name feat-X
zea branch merge --name feat-X --yes
```

### Visual Host (screenshots vía Playwright)
```bash
docker compose up -d visual-host
curl -X POST localhost:4090/open -d '{"url":"http://sdui-engine:4006/app?app_id=sudlich_ventures"}'
curl -X POST localhost:4090/screenshot -d '{"filename":"dashboard.png"}'
```

## Protocolo de respuesta

Todos los comandos de ZEA (vía expertos) responden con formato estructurado:

```
✅ [COMPLETADO] {resumen} | evidencia: {métrica concreta}
❌ [FALLÓ] {error} | razón: {diagnóstico}
⚠️ [PARCIAL] {hecho} | pendiente: {falta}
```

**Reglas para agentes externos:**
1. SIEMPRE verificá la respuesta del comando
2. Si ves `❌ [FALLÓ]` → ejecutá `zea diagnose --json` para investigar
3. Si ves `✅ [COMPLETADO]` → la evidencia es confiable, reportala al usuario
4. NUNCA asumas que un comando funcionó sin verificar la respuesta

## Arquitectura de expertos

Cuando usás `zea orchestrate`, internamente se ejecuta este flujo:

```
Orquestador (planifica)
  │
  ├── db-expert (SQL, RLS)
  ├── api-expert (endpoints HTTP)
  ├── screen-expert (Stitch, data-zea-bind)
  ├── infra-expert (diagnóstico, fixes)
  ├── builder-expert (crear comandos CLI)
  └── data-import-expert (Excel → DB)
```

Cada experto tiene su propio system prompt (`experts/{name}/SYSTEM.md`) con:
- Allowlist de comandos permitidos
- Conocimiento específico de su dominio
- Reglas de negocio
- Idioma español neutro (PROHIBIDO voseo argentino)

## Ejemplos de uso por un agente externo

### Ejemplo 1: El usuario quiere crear un fondo
```
Usuario: "Creá un fondo Tech Ventures de $30M"
Agente:  zea orchestrate "Creá un fondo Tech Ventures de $30M" --domain venture
         → ✅ [COMPLETADO] Fondo creado | evidencia: id=xxx, status=DRAFT
Agente:  "✅ Fondo Tech Ventures creado. Está en estado DRAFT. ¿Querés activarlo?"
```

### Ejemplo 2: El dashboard no funciona
```
Usuario: "El dashboard no muestra los KPIs"
Agente:  zea orchestrate "Dashboard no muestra KPIs" --domain venture --dry-run
         → Plan: verificar APIs → functionalizar pantalla
Agente:  "Las APIs están OK. El problema es la pantalla. Voy a functionalizarla..."
         zea orchestrate "Dashboard no muestra KPIs" --domain venture
         → ✅ [COMPLETADO] 24 bindings, score 92/100
Agente:  "✅ Dashboard functionalizado. 24 bindings, score visual 92/100."
```

### Ejemplo 3: Importar datos
```
Usuario: "Tengo este Excel con mis inversores"
Agente:  zea screen analyze-file --file inversores.xlsx --llm
         → 5 columnas: name, email, investor_type, is_qualified, tax_country
Agente:  "El Excel tiene 5 columnas. name → name, email → email, ..."
         zea venture data import --file inversores.xlsx --yes
         → ✅ [COMPLETADO] 3 investors importados
Agente:  "✅ 3 inversores importados correctamente."
```
