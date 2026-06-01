---
name: app
description: "Crear y gestionar apps en ZEA Platform: registrar, ver manifiesto, listar apps, experiments."
---

# App — App Management

Una app ZEA se define por su **manifest** (JSON). Contiene estados (pantallas), intents (navegación), design system (colores) y shell (sidebar, chat).

## Requisito previo: autenticación

Antes de usar cualquier comando, autenticate **una vez**:

```bash
zea auth login
```

Esto abre el navegador, hacés login OAuth2 contra Thalamus, y el JWT se guarda en `~/.config/zea/config.json`. Todos los comandos `zea app` lo usan automáticamente.

Si un comando devuelve `401 Unauthorized`, el token expiró. Volvé a ejecutar `zea auth login`.

## Comandos

```bash
# Listar apps registradas
zea app list

# Ver manifiesto completo de una app
zea app show <app_id>

# Registrar app desde archivo JSON/YAML
zea app register <manifest.json>
```

## Estructura del manifest

```json
{
  "app_id": "mi_app",
  "name": "Mi App",
  "domain_auth": "venture",
  "status": "active",
  "version": "1.0.0",
  "states": {
    "dashboard": { "type": "Container", "children": [] },
    "form": { "type": "Container", "children": [] }
  },
  "intent_routing": {
    "back_to_dashboard": { "type": "state_transition", "target_state": "dashboard" }
  },
  "design_system": {
    "colors": { "primary": "#1d4ed8", "surface": "#ffffff" }
  },
  "shell": {
    "sidebar": {
      "header": { "title": "App", "subtitle": "" },
      "items": [
        { "label": "Dashboard", "icon": "dashboard", "action": "back_to_dashboard" }
      ]
    },
    "chat": {
      "header": { "title": "Asistente", "subtitle": "" },
      "input": { "placeholder": "Preguntale al Asistente..." }
    }
  }
}
```

## Flujo para modificar una app

```
1. EXPLORAR: zea sdui manifest <app_id> — ver estado actual
2. EXPERIMENT: zea experiment create --app <app_id> --name <nombre>
   → Crea un clone seguro: <app_id>__exp_<nombre>
3. MODIFICAR: zea app register <manifest.json> — subir cambios al experimento
   (el CLI detecta el experimento activo y actualiza el clone, no el padre)
4. PREVIEW: la URL de preview es:
   https://apps.zea.cl/app?app_id=<app_id>__exp_<nombre>
5. ESPERAR: no mergear hasta aprobación humana explícita
6. MERGE: zea experiment merge --app <app_id> --name <nombre>
   (solo si el humano dice "aprobado", "mergeá", "dale")
7. DESCARTAR: zea experiment discard (si el humano dice "no")
```

## Experiments

```bash
# Crear experimento (branch seguro)
zea experiment create --app <app_id> --name <nombre>

# Listar experiments de una app
zea experiment list --app <app_id>

# Merge a producción
zea experiment merge --app <app_id> --name <nombre>

# Descartar experimento
zea experiment discard --app <app_id> --name <nombre>
```

## Error recovery

Si un comando falla:

1. **401 Unauthorized** → el token JWT expiró. Ejecutá `zea auth login`.
2. **Connection refused** → el servicio zea_apps no está corriendo. Verificá con `zea doctor check api`.
3. **422 Unprocessable** → el manifest tiene errores de validación. Revisá el JSON contra la estructura documentada arriba.
4. **500 Internal Error** → error del servidor. Ejecutá `zea doctor run` para diagnosticar.

Si el error persiste, reportá al usuario:
- Qué comando falló
- El código de error HTTP
- El mensaje de error exacto

## Ver la app

Cuando el usuario pida "ver la app", "mostrame la app":

### 1. Descubrir qué apps existen
```bash
zea app list
```
- Si hay solo una → usarla automáticamente
- Si hay varias → mostrar la lista y preguntar cuál

### 2. Verificar salud
```bash
zea doctor check api
```

### 3. Abrir la app en el navegador

Si el usuario lo pide, ejecutar:

```bash
glia open app <app_id>
```

Este comando abre el navegador local del usuario automáticamente.

URL si el usuario quiere abrir manualmente:
```
https://apps.zea.cl/app?app_id=<app_id>
```

## API REST (uso avanzado)

Para integración programática sin CLI:

```bash
# Listar apps
curl https://apps.zea.cl/api/apps \
  -H "Authorization: Bearer $ZEA_TOKEN"

# Obtener manifiesto
curl https://apps.zea.cl/api/apps/<app_id>/manifest \
  -H "Authorization: Bearer $ZEA_TOKEN"

# Registrar/actualizar app
curl -X POST https://apps.zea.cl/api/apps \
  -H "Authorization: Bearer $ZEA_TOKEN" \
  -H "Content-Type: application/json" \
  -d @manifest.json
```

## MCP Server

zea_apps expone un servidor MCP (Model Context Protocol) para agentes:

```bash
cd zea_apps && mix zea_apps.mcp
```

Tools disponibles: `validate_app`, `register_app`, `list_apps`, `get_app_details`, `discover_domain_skills`.
