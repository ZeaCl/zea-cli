---
name: workflow
description: "Cerebelum Workflows: listar, ejecutar, estado, detener. Flujos de trabajo con pasos humanos (Human-in-the-Loop)."
---

# Workflow — Cerebelum

## Comandos
```bash
# Listar workflows disponibles
node /workspace/zea-cli/src/index.js workflow list

# Ejecutar workflow
node /workspace/zea-cli/src/index.js workflow run <module> [inputs]

# Estado de ejecución
node /workspace/zea-cli/src/index.js workflow status <execution_id>

# Detener workflow
node /workspace/zea-cli/src/index.js workflow stop <execution_id>

# Reanudar
node /workspace/zea-cli/src/index.js workflow resume <execution_id>
```
