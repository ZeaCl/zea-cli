---
name: app
description: "Crear y gestionar apps en ZEA Platform: registrar, ver manifiesto, listar apps, experiments."
---

# App — App Management

Una app ZEA se define por su **manifest** (JSON). Contiene estados (pantallas), intents (navegación), design system (colores) y shell (sidebar, chat).

## Comandos

```bash
# Listar apps registradas
zea app list

# Ver manifiesto completo
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

## Error recovery

⚠️ CRÍTICO: Si algo falla, NO investigues por tu cuenta.
NO busques código fuente. NO pruebes otros comandos. NO uses docker, ps, o bash.
Derivar a maintenance es tu ÚNICA opción.

Si cualquier operación falla (HTTP 500, error, etc.):

### 1. PARÁ inmediatamente
No sigas intentando. No explores. No improvisar.

### 2. DERIVÁ a maintenance agent
Creá una sesión en opencode-maintenance:4097 con este prompt exacto:
```
Issue: "app list failed with: {error_message}". 
Skill: maintenance.
App: sudlich_ventures.
Acción: follow maintenance protocol — diagnose, fix, verify.
```

### 3. ESPERÁ respuesta
El maintenance agent responde con el resultado del fix.
Si maintenance reporta "fixed" → reintentá la operación original.
Si maintenance reporta "failed" → informá al usuario.

### 4. Si maintenance no está disponible
Ejecutá `zea doctor run` y reportá los resultados al usuario.

## Ver la app

Cuando el usuario pida "ver la app", "mostrame la app", "abrir la app", seguí este flujo:

### 1. Saber qué app usar
```bash
# Listar apps disponibles
zea app list
```
- Si hay solo una → usarla automáticamente
- Si hay varias → mostrar la lista y preguntar: "¿Cuál app querés ver?"
- La app actualmente activa es `sudlich_ventures`

### 2. Verificar que la app funciona
```bash
zea doctor run
```

### 3. Si el doctor falla
- Reportá qué capa falló (api, auth, venture, skills, etc.)
- Si el fallo es crítico: revisar logs del servicio con `docker logs`
- Si no se puede reparar: explicar al usuario qué servicio no responde

### 4. Si todo OK
Mostrar la URL:
```
http://sudlich.zea.localhost/
```

⚠️  NUNCA uses estas URLs internas (son para Docker, no para el usuario):
  ❌ http://localhost:4006/app?app_id=...
  ❌ http://sdui-engine:4006/...
  ❌ http://localhost:4006/...

La URL pública SIEMPRE es: http://sudlich.zea.localhost/

### 5. Instrucciones para el usuario
- Abrí la URL en tu navegador
- Login: `c@zea.cl` / `demo1234`
- Vas a ver el Dashboard con sidebar, KPI cards y chat del asistente

## Ver preview de experiment

Cuando el usuario pida "ver el experimento X":
```bash
# 1. Verificar que existe
zea experiment list --app <app_id>

# 2. URL de preview
http://sudlich.zea.localhost/app?app_id=<app_id>__exp_<nombre>

# 3. IMPORTANTE: no mergear hasta aprobación humana explícita
```
