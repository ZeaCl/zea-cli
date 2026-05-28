---
name: sensor
description: "Captura y procesamiento de datos: transcribir audio (WhatsApp), analizar conversaciones, clasificar feedback, enviar reportes."
---

# Sensor — Data Capture & Processing

## Comandos
```bash
# Transcribir audio
node /workspace/zea-cli/src/index.js sensor transcribe <files...> --app <app_id>

# Listar eventos
node /workspace/zea-cli/src/index.js sensor events --app <app_id> [--source whatsapp] [--status pending]

# Ver estado de evento
node /workspace/zea-cli/src/index.js sensor status <event_id> --app <app_id>

# Analizar evento
node /workspace/zea-cli/src/index.js sensor analyze <event_id> --app <app_id>

# Escuchar y procesar automáticamente
node /workspace/zea-cli/src/index.js sensor listen --app <app_id> [--auto-process]

# Generar reporte
node /workspace/zea-cli/src/index.js sensor report <event_id> --app <app_id>
```
