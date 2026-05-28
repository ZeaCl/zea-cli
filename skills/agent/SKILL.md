---
name: agent
description: "Gestión de agentes Glia: crear, listar, asignar skills, detener."
---

# Agent — Glia Agent Management

## Comandos
```bash
# Listar agentes activos
node /workspace/zea-cli/src/index.js agent list

# Crear agente
node /workspace/zea-cli/src/index.js agent create <name> --mission <mission>

# Asignar skill
node /workspace/zea-cli/src/index.js agent assign <name> --skill <skill>

# Detener agente
node /workspace/zea-cli/src/index.js agent stop <name>

# Planificar (orquestador)
node /workspace/zea-cli/src/index.js agent plan --app <app_id> --request "<text>"

# Ejecutar plan
node /workspace/zea-cli/src/index.js agent execute --app <app_id> --name <experiment> --auto

# Escanear + mejorar
node /workspace/zea-cli/src/index.js agent scan --app <app_id>
node /workspace/zea-cli/src/index.js agent improve --app <app_id> --auto
```
