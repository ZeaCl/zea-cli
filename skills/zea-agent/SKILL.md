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
# → API REST en https://api.zea.cl
# → WebSocket en wss://api.zea.cl/ws

# Llamar al orquestador via API
curl -X POST https://api.zea.cl/v1/orchestrate \
  -H "Content-Type: application/json" \
  -d '{"message":"Listá los fondos registrados","domain":"venture"}'

# Health check
curl https://api.zea.cl/health
```

## Comandos por área

### Pantallas Stitch
```bash
# Importar pantalla de Stitch
zea design import-screen --app my_app --stitch-key $STITCH_KEY --screen-id X --state dashboard --intent view_dashboard

# Functionalizar (inyectar data-zea-bind + crear intents)
zea screen functionalize --app my_app --screen dashboard --llm

# Detectar componentes sin API
zea screen gap-detect --app my_app --llm

# Validación visual
zea validate --app my_app --screen dashboard --visual --browser
zea validate --app my_app --screen dashboard --visual --llm
```

### Datos (Excel → DB)
```bash
# Analizar estructura de Excel (vía CLI)
zea xlsx view <file> [--sheet X] [--json]    # Ver contenido y estructura
zea screen analyze-file --file datos.xlsx --llm  # Análisis LLM de columnas

# Importar a la DB
zea venture data import --file datos.xlsx --entity funds --yes
zea venture data import --file datos.xlsx --entity investors --yes
zea venture data import --file datos.xlsx --entity commitments --yes

# Ver datos importados
zea venture fund list
zea venture investor list
zea venture capital-call list

# Crear entidades individuales
zea venture fund create --name "Growth Fund" --type VENTURE_CAPITAL --size 50000000
zea venture investor create --name "Alpha Capital" --email alpha@example.com --type INSTITUTIONAL
zea venture capital-call create --fund-id X --amount 10000000

# Verificar integridad de datos post-import
zea verify --app my_app --json
zea verify --app my_app --llm       # Reporte con explicación LLM
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
curl -X POST visual.zea.cl/open -d '{"url":"https://sdui.zea.cl/app?app_id=my_app"}'
curl -X POST visual.zea.cl/screenshot -d '{"filename":"dashboard.png"}'
```

## 📱 Formato ---ACTIONS--- (Telegram inline keyboard)

Cuando respondas a un usuario en Telegram, puedes incluir botones usando este formato al final de la respuesta:

```
Texto visible para el usuario...

---ACTIONS---
[
  {"label":"📊 Importar fondos","prompt":"zea venture data import --sheet funds --yes"},
  {"label":"💰 Importar inversores","prompt":"zea venture data import --sheet investors --yes"},
  {"label":"📋 Verificar","prompt":"zea verify --app my_app --json"}
]
```

Reglas:
- `label`: texto visible en el botón (máx 30 chars)
- `prompt`: comando CLI de ZEA que se ejecuta al tocar el botón
- Máximo 6 acciones, 2 por fila
- El bot ZEA detecta comandos CLI en el prompt y los ejecuta con `execSync` (determinista, sin LLM)
- Si el prompt NO es un comando CLI → se envía al orquestador (DeepSeek)

## 🔄 Retry Loop

Si un comando CLI falla, el bot sigue este protocolo:

```
1. Comando falla → ❌ registrado
2. infra-expert diagnostica → zea diagnose --json
3. Si es error de API → api-expert arregla
4. Si es error de DB → db-expert arregla
5. Reintentar comando original (×3 máximo)
6. Si 3 reintentos fallan → reportar al usuario con diagnóstico
```

El agente externo NO necesita implementar el retry loop. El bot ZEA lo maneja automáticamente cuando ejecuta comandos CLI vía `executeExpertStep`.

## 🛠️ Ejecución directa vs Orquestador

| Método | Cuándo usarlo | Ejemplo |
|---|---|---|
| **CLI directo** | Tarea determinista, concreta | `zea venture fund list` |
| **orchestrate** | Tarea compleja, multi-paso | `zea orchestrate "crear dominio nuevo para deportes"` |
| **executeExpertStep** | El orquestador delega a un experto | `executeExpertStep("data-import", "importar Excel")` |

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
Orquestador (planifica vía DeepSeek)
  │
  ├── db-expert (SQL, RLS, migraciones)
  ├── api-expert (endpoints HTTP)
  ├── screen-expert (Stitch, data-zea-bind)
  ├── infra-expert (diagnóstico, fixes, retry loop)
  ├── builder-expert (crear comandos CLI si faltan)
  ├── data-import-expert (Excel → DB pipeline completo)
  ├── value-proposition-expert (Customer Discovery)
  ├── open-spec-expert (Requirements → Design → Tasks)
  └── workflow-expert (crear/editar workflows)
```

Cada experto tiene su propio system prompt (`experts/{name}/SYSTEM.md`) con:
- Allowlist de comandos CLI permitidos
- Conocimiento específico de su dominio
- Reglas de negocio
- Idioma español neutro latinoamericano (PROHIBIDO voseo argentino)

### Cómo funciona executeExpertStep

```
Orquestador decide: "esto lo hace el data-import-expert"
  │
  ▼
executeExpertStep("data-import", "importar fondos del Excel X")
  │
  ├── 1. Carga experts/data-import/SYSTEM.md
  ├── 2. DeepSeek genera comando CLI exacto: zea venture data import --file X --sheet funds --yes
  ├── 3. execSync ejecuta el comando (determinista)
  ├── 4. Si falla → retry loop (infra → fix → reintentar ×3)
  └── 5. Resultado con evidencia: "✅ 3/3 fondos importados"
```

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
Agente:  zea xlsx view inversores.xlsx --json
         → {"sheets":["investors"],"investors":{"columns":["name","email","type"],"rows":5}}
Agente:  "El Excel tiene 5 inversores con name, email, type."
         zea venture data import --file inversores.xlsx --entity investors --yes
         → ✅ [COMPLETADO] 5/5 investors importados | evidencia: dashboard active_lps=17
Agente:  "✅ 5 inversores importados. Total LPs en plataforma: 17."

         // Verificar consolidación:
         zea verify --app my_app --json
         → active_lps=17, active_funds=8
Agente:  "Verificación OK: 17 LPs, 8 fondos. Todos los datos del Excel están en la DB."
```

### Ejemplo 4: Usar ---ACTIONS--- en Telegram
```
Agente responde en Telegram:
         "Encontré 5 inversores en el Excel. ¿Qué quieres hacer?"

         ---ACTIONS---
         [
           {"label":"📊 Importar fondos","prompt":"zea venture data import --sheet funds --yes"},
           {"label":"💰 Importar inversores","prompt":"zea venture data import --sheet investors --yes"},
           {"label":"📋 Verificar","prompt":"zea verify --app my_app --json"}
         ]

         → El usuario ve botones. Al tocar uno, el bot ejecuta el CLI directo.
```
