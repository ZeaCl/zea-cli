---
name: agent
description: "Gestión de agentes Glia: crear, listar, asignar skills, detener."
---

# Agent — Glia Agent Management

## Comandos
```bash
# Listar agentes activos
zea agent list

# Crear agente
zea agent create <name> --mission <mission>

# Asignar skill
zea agent assign <name> --skill <skill>

# Detener agente
zea agent stop <name>

# Planificar (orquestador)
zea agent plan --app <app_id> --request "<text>"

# Ejecutar plan
zea agent execute --app <app_id> --name <experiment> --auto

# Escanear + mejorar
zea agent scan --app <app_id>
zea agent improve --app <app_id> --auto
```
