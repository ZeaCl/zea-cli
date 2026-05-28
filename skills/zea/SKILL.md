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

## 🤖 Glia Agent API

Para interactuar con el asistente IA de ZEA Platform.

```
POST /api/agent/chat
Content-Type: application/json
Authorization: Bearer <JWT>
```

### Request
```json
{
  "text": "¿Cuántos fondos hay?",
  "plan_mode": false,
  "session_id": "opcional-para-seguimiento"
}
```

### Response: SSE stream
```
event: reasoning
data: {"text":"El usuario pregunta por fondos..."}

event: text
data: {"text":"Hay 13 fondos activos. El último..."}

event: done
data: {}
```

### Eventos
| Evento | Significado |
|--------|-------------|
| `reasoning` | Pensamiento interno del agente |
| `tool` | Ejecutando herramienta |
| `text` | Respuesta final al usuario |
| `question` | Pregunta al usuario (espera respuesta) |
| `error` | Error con código y mensaje |
| `done` | Fin del stream |

### Ejemplo
```bash
curl -N -X POST http://glia.zea.localhost/api/agent/chat \
  -H "Authorization: Bearer $ZEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"¿Cuántos fondos hay?","plan_mode":false}'
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
