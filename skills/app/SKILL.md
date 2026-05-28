---
name: app
description: "Crear y gestionar apps en ZEA Platform: registrar, ver manifiesto, listar apps, experiments."
---

# App — App Management

Una app ZEA se define por su **manifest** (JSON). Contiene estados (pantallas), intents (navegación), design system (colores) y shell (sidebar, chat).

## Comandos

```bash
# Listar apps registradas
node /workspace/zea-cli/src/index.js app list

# Ver manifiesto completo
node /workspace/zea-cli/src/index.js app show <app_id>

# Registrar app desde archivo JSON/YAML
node /workspace/zea-cli/src/index.js app register <manifest.json>
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
    "dashboard": { "type": "Container", "children": [...] },
    "form": { "type": "Container", "children": [...] }
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
   → Crea un clone de la app: <app_id>__exp_<nombre>
3. MODIFICAR: PUT /api/apps/<app_id>/experiments/<nombre>
   Body: { "manifest": { ...manifest modificado... } }
4. PREVIEW: /app?app_id=<app_id>__exp_<nombre>
5. ESPERAR: no mergear hasta aprobación humana explícita
6. MERGE: zea experiment merge --app <app_id> --name <nombre>
   (solo si el humano dice "aprobado", "mergeá", "dale")
7. DESCARTAR: zea experiment discard (si el humano dice "no")
```

## Manifest canónico

Cada app debe tener su manifest guardado como archivo:

```
~/.zea/platform/apps/<app_id>/manifest.json
```

Este archivo es el **source of truth**. Si la DB se pierde, se registra de nuevo con:
```bash
zea app register ~/.zea/platform/apps/<app_id>/manifest.json
```
