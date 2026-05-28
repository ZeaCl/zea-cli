---
name: zea
description: "ZEA Platform — CLI, API y skills para agentes de código. Usar este skill como punto de entrada a toda la plataforma."
---

# ZEA Platform — Agent Skill

Skill umbrella para ZEA Platform. Documenta skills disponibles, CLI, y la API de Glia.

## 🧱 Lego Pieces (skills disponibles)

| Domain | CLI | Skill |
|--------|-----|-------|
| App | `zea app` | app/SKILL.md |
| Design | `zea design` | design/SKILL.md |
| Venture | `zea venture` | venture/SKILL.md |
| SDUI | `zea sdui` | sdui/SKILL.md |
| Doctor | `zea doctor` | doctor/SKILL.md |
| Agent | `zea agent` | agent/SKILL.md |
| Workflow | `zea workflow` | workflow/SKILL.md |
| Sensor | `zea sensor` | sensor/SKILL.md |
| Orchestrate | `zea agent plan` | orchestrate/SKILL.md |

## 🤖 Agentes

ZEA tiene dos agentes independientes. Cada uno con su propio contexto. Un agente puede delegar tareas al otro cuando lo necesita.

### Glia — Planificación y razonamiento
Para analizar, planificar, usar skills y herramientas de negocio.

```
POST /api/agent/chat
Content-Type: application/json
Authorization: Bearer <JWT>
```

**Request:**
```json
{
  "text": "Planificá cómo cambiar el color primario",
  "plan_mode": false,
  "session_id": "opcional-para-seguimiento"
}
```

**Response:** SSE stream con eventos `reasoning`, `tool`, `text`, `question`, `done`.

Glia puede delegar ejecución a opencode cuando necesita bash, CLI o modificar archivos.

### opencode — Ejecución
Para bash, CLI, ZEA CLI, modificar archivos, git.

```
POST http://opencode:4096/session
POST http://opencode:4096/session/{id}/message
GET  http://opencode:4096/session/{id}/message
```

opencode puede delegar análisis a Glia cuando necesita planificar o razonar.

### ¿Cuál usar como principal?
| Si necesitás... | Conectate a |
|---|---|
| Analizar, planificar, preguntar | **Glia** |
| Ejecutar bash, CLI, modificar archivos | **opencode** |
| Ambos | Cualquiera — delega al otro internamente |

### Agentes que se delegan entre sí

```
Usuario → Glia (principal)
  Glia analiza → decide que necesita ejecutar
  Glia → POST opencode/session → opencode ejecuta
  opencode responde → Glia interpreta → responde al usuario

Usuario → opencode (principal)
  opencode ejecuta → necesita planificar
  opencode → curl Glia/api/agent/chat → Glia planifica
  Glia responde → opencode usa el plan → ejecuta
```

### Ejemplo con Glia como principal
```bash
curl -N -X POST http://glia.zea.localhost/api/agent/chat \
  -H "Authorization: Bearer $ZEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"¿Cuántos fondos hay?","plan_mode":false}'
```

### Ejemplo con opencode como principal
```bash
# Crear sesión
curl -X POST http://opencode:4096/session -d '{"title":"chat"}'
# Enviar mensaje
curl -X POST http://opencode:4096/session/{id}/message \
  -d '{"model":{"providerID":"deepseek","modelID":"deepseek-v4-pro"},"parts":[{"type":"text","text":"¿Cuántos fondos hay?"}]}'
```

## 🔐 Autenticación

### Si NO tenés token
1. Pedile a un humano que ejecute:
```
zea auth login
zea token create --name "nombre-del-agente"
```
2. Copiá el token que aparece (solo se muestra una vez)
3. Configuralo: `export ZEA_TOKEN=<token>`

### Si YA tenés token
Usalo en el header de cada request:
```
Authorization: Bearer $ZEA_TOKEN
```

### Gestionar tokens
```bash
zea token list          # ver tokens activos
zea token revoke <id>   # revocar un token
zea org list            # organizaciones disponibles
zea org switch <id>     # cambiar org activa
```

### Ejemplo completo
```bash
# 1. Configurar token (una vez)
export ZEA_TOKEN=zea_pat_xxxxxxxxxxxxx

# 2. Usar la API de Glia
curl -N -X POST http://glia.zea.localhost/api/agent/chat \
  -H "Authorization: Bearer $ZEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"¿Cuántos fondos hay?","plan_mode":false}'
```

## 📋 Comandos CLI rápidos

### Design
```bash
zea design list-screens --app <app_id>
zea design import-screen --app <app_id> --screen-id <sid> --state <name>
```

### Venture
```bash
zea venture fund list
zea venture fund create --name "X" --hard-cap 5000000 --currency USD
zea venture capital-call list
zea venture investor list
zea venture dashboard
```

### SDUI
```bash
zea sdui manifest <app_id>
zea sdui start <app_id>
```

### App
```bash
zea app list
zea app show <app_id>
zea app register <manifest.json>
```

### Doctor
```bash
zea doctor check            # Diagnóstico completo
zea doctor check --fix      # Diagnóstico + reparación automática
```

## 🛠 Instalación

```bash
npx skills add ZeaCl/zea-agent-skill --yes --global
```
