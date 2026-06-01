---
name: sdui
description: "Server-Driven UI: ver manifiestos, estados, intents. Conectar sesiones SDUI."
---

# SDUI — Server-Driven UI

## Comandos
```bash
# Ver manifiesto de una app
zea sdui manifest sudlich_ventures
zea sdui manifest <app_id>

# Start session
zea sdui start <app_id>

# Dispatch intent
zea sdui dispatch <session_id> <action>
```

## APIs internas
```bash
# Manifest
curl http://zea-apps:4007/api/apps/<app_id>/manifest -H "Authorization: Bearer $ZEA_TOKEN"

# Sessions
curl -X POST http://sdui-engine:4006/api/sessions -H "Authorization: Bearer $ZEA_TOKEN" \
  -H "Content-Type: application/json" -d '{"app_id":"sudlich_ventures","token":"$ZEA_TOKEN"}'
```
