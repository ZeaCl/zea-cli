---
name: workflow
description: "Cerebelum Workflows: listar, ejecutar, estado, detener. Flujos de trabajo con pasos humanos (Human-in-the-Loop)."
---

# Workflow — Cerebelum

## Comandos
```bash
# Listar workflows disponibles
zea workflow list

# Ejecutar workflow
zea workflow run <module> [inputs]

# Estado de ejecución
zea workflow status <execution_id>

# Detener workflow
zea workflow stop <execution_id>

# Reanudar
zea workflow resume <execution_id>
```
