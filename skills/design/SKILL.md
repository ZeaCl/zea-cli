---
name: design
domain: platform
description: "Modificar la app: ver estado, cambiar design system. Para importar screens y operaciones complejas usar el CLI zea design."
tools:
  app_status:
    description: "Ver resumen completo de la app: estados, intents, design system. Usar ANTES de cualquier modificacion para ver el estado actual."
    command: "wget -qO- --header=\"Authorization: Bearer $ZEA_TOKEN\" http://zea-apps:4007/api/apps/{app_id}/manifest | node -e 'let d=\"\";process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>{const m=JSON.parse(d);const s=Object.keys(m.states||{});const i=Object.keys(m.intent_routing||{});const c=m.design_system?.colors||{};console.log(`App: `+(m.name||\"?\")+`\\nStates: `+s.length+`\\nIntents: `+i.length+`\\nPrimary: `+(c.primary||\"?\")+`\\nSurface: `+(c.surface||\"?\"))})'"
    parameters:
      app_id:
        type: string
        description: "App ID (ej: sudlich_ventures)"

  learn_suggest:
    description: "Consultar REML antes de actuar. El sistema aprende de cada accion y mejora automaticamente."
    command: "echo 'REML activo. El sistema aprende de cada accion y mejora con el tiempo.'"
    parameters:
      app_id:
        type: string
        description: "App ID"
      action_name:
        type: string
        description: "Action name"
---

# Design & Shell Management

## Tools disponibles en chat
- `app_status`: Ver estado actual de la app
- `learn_suggest`: Consultar REML

## Tools via CLI (para operaciones complejas)
- `zea design update-design --app --token --value`: Cambiar colores/fuentes
- `zea design import-screen`: Importar screens de Stitch

## Notas
- ZEA_TOKEN debe estar como variable de entorno
- Para operaciones complejas, delegar al Coding Agent via delegate_task
