---
name: design
description: "Diseño de apps ZEA: importar screens desde Stitch, cambiar colores, ver estado. Para cualquier modificación visual de la app."
---

# Design — App Design Management

## ⚠️ REGLA DE ORO: Siempre usar experiment

**NUNCA modifiques el manifiesto directamente.** Cada cambio, por más chico que sea, debe hacerse dentro de un experiment. Esto protege contra pérdida de datos.

```
1. zea experiment create --app <app_id> --name "<desc>"
2. Modificar (import-screen, update-design, etc.)
3. zea sdui manifest <app_id> → verificar estado
4. Preview: glia open app <app_id> (usa el experiment activo)
5. Esperar aprobación humana explícita: "aprobado", "mergeá", "dale"
6. zea experiment merge --app <app_id> --name "<desc>"
   o zea experiment discard si se rechaza
```

## Requisito previo: Stitch API Key

```bash
glia config set stitch_key "AQ.Ab8..."
```

Si un comando falla con `STITCH_KEY not set`, indicarle al usuario que ejecute ese comando.

## Comandos

```bash
# Ver estado de diseño
zea design status --app <app_id>

# Importar screen desde Stitch (requiere --stitch-key)
zea design import-screen --app <app_id> --screen-id <sid> --state <name>

# Listar screens disponibles
zea design list-screens --app <app_id>

# Cambiar design system (colores, fuentes)
zea design update-design --app <app_id> --token colors.primary --value "#1a365d"
```

## Recuperar screens desde memoria

Si una app perdió sus pantallas (por upsert parcial), recuperarlas desde `~/.zea/memory/apps/<app_id>/stitch.json`:

1. Leer `~/.zea/memory/apps/<app_id>/stitch.json` con filesystem
2. Extraer `screen_mappings`: `{state_name: {stitch_id, ...}}`
3. Para cada screen, ejecutar:
   ```bash
   zea design import-screen --app <app_id> --stitch-key $STITCH_KEY \
     --screen-id <stitch_id> --state <state_name> --intent view_<state_name>
   ```
4. Opcional: restaurar design_system con `zea design update-design`

## Restaurar design system

```bash
zea design update-design --app <app_id> --token colors.primary --value "#1a365d"
zea design update-design --app <app_id> --token colors.surface --value "#ffffff"
zea design update-design --app <app_id> --token colors.text --value "#0f172a"
```

## Backup en git

Antes de cualquier modificación, exportar el manifiesto actual:

```bash
mkdir -p ~/.zea/platform/apps/<app_id>
zea app show <app_id> > ~/.zea/platform/apps/<app_id>/manifest.json
git -C ~/.zea/platform add . && git -C ~/.zea/platform commit -m "backup: <app_id> manifest"
```

Si algo falla, restaurar:

```bash
zea app register ~/.zea/platform/apps/<app_id>/manifest.json
```
