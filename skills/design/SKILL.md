---
name: design
description: "Diseño de apps ZEA: importar screens desde Stitch, cambiar colores, ver estado. Para cualquier modificación visual de la app."
---

# Design — App Design Management

## Requisito previo: Stitch API Key

Para importar screens desde Stitch, el usuario necesita configurar su API key **una vez**:

```bash
glia config set stitch_key "AQ.Ab8..."
```

Si un comando falla con `STITCH_KEY not set`, indicarle al usuario que ejecute ese comando.

Si el usuario ya tiene la key configurada vía `glia config`, los comandos la usarán automáticamente (el agente la leerá de `~/.config/zea/config.json` y la pasará como `--stitch-key`).

## Comandos
```bash
# Ver estado de diseño
zea design status --app <app_id>

# Importar screen desde Stitch
zea design import-screen --app <app_id> --screen-id <sid> --state <name>

# Listar screens disponibles
zea design list-screens --app <app_id>

# Cambiar design system (colores, fuentes)
zea design update-design --app <app_id> --token <token> --value <json>
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
