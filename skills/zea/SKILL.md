---
name: zea
description: "ZEA Platform — Skills públicas para agentes: design, venture, sdui, doctor."
---

# ZEA Platform — Agent Skill

Skills **públicas** disponibles para cualquier agente de código.

> Skills de infraestructura (ops, agent, workflow, sensor) son internas de ZEA y no se exponen.

## 🧱 Lego Pieces

| Domain | CLI | Skill | Descripción |
|--------|-----|-------|-------------|
| App | `zea app` | app/SKILL.md | Crear, registrar, modificar apps |
| Design | `zea design` | design/SKILL.md | Importar screens Stitch, cambiar colores |
| Venture | `zea venture` | venture/SKILL.md | Fondos, capital calls, investors |
| SDUI | `zea sdui` | sdui/SKILL.md | Manifiestos, estados, intents |
| Doctor | `zea doctor` | doctor/SKILL.md | Diagnóstico 7 capas |

## Comandos esenciales

### Design
```bash
zea design list-screens --app <app_id>
zea design import-screen --app <app_id> --screen-id <sid> --state <name>
zea design status --app <app_id>
```

### Venture
```bash
zea venture fund list
zea venture fund create --name "X" --hard-cap 5000000 --currency USD
zea venture fund show <id>
zea venture capital-call list
zea venture capital-call create --fund <id> --amount 1000000 --due-date 2026-12-31
zea venture investor list
zea venture dashboard
```

### SDUI
```bash
zea sdui manifest <app_id>
zea sdui screens <app_id>
zea sdui start <app_id>
zea sdui dispatch <session_id> <action>
```

### Doctor
```bash
zea doctor check            # Diagnóstico completo
zea doctor check --fix      # Diagnóstico + reparación
```

## Autenticación
```bash
zea auth login              # OAuth2 interactivo
zea org list                # Organizaciones disponibles
zea org switch <id>         # Cambiar org activa
```
