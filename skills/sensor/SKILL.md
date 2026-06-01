---
name: sensor
description: "Captura y procesamiento de datos: transcribir audio (WhatsApp), analizar conversaciones, clasificar feedback, enviar reportes."
---

# Sensor — Data Capture & Processing

## Comandos
```bash
# Transcribir audio
zea sensor transcribe <files...> --app <app_id>

# Listar eventos
zea sensor events --app <app_id> [--source whatsapp] [--status pending]

# Ver estado de evento
zea sensor status <event_id> --app <app_id>

# Analizar evento
zea sensor analyze <event_id> --app <app_id>

# Escuchar y procesar automáticamente
zea sensor listen --app <app_id> [--auto-process]

# Generar reporte
zea sensor report <event_id> --app <app_id>
```
