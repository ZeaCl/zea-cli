---
name: design
description: "Diseño de apps ZEA: importar screens desde Stitch, cambiar colores, ver estado. Para cualquier modificación visual de la app."
---

# Design — App Design Management

## Comandos
```bash
# Ver estado de diseño
node /workspace/zea-cli/src/index.js design status --app <app_id>

# Importar screen desde Stitch
node /workspace/zea-cli/src/index.js design import-screen --app <app_id> --screen-id <sid> --state <name>

# Listar screens disponibles
node /workspace/zea-cli/src/index.js design list-screens --app <app_id>

# Cambiar design system (colores, fuentes)
node /workspace/zea-cli/src/index.js design update-design --app <app_id> --token <token> --value <json>
```

## Flujo típico
```
1. design status → ver estado actual
2. Crear experiment (seguridad)
3. design import-screen / update-design
4. Verificar con sdui manifest
5. Preview: /app?app_id=...__exp_...
6. Esperar aprobación humana → merge
```
