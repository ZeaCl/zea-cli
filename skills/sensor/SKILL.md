---
name: sensor
domain: platform
description: "Capturar y procesar datos multimodales: transcribir audio, analizar conversaciones de WhatsApp, clasificar feedback de usuarios, y enviar reportes. Usar para: transcribe, transcription, audio, voz, WhatsApp, Kapso, analyze, sensor, reportar."
tools:
  transcribe_audio:
    description: "Transcribir archivos de audio a texto usando MLX Whisper. Usar cuando el usuario envía un audio o pide transcribir."
    command: "node /app/zea-agent-skill/src/index.js sensor transcribe {files} --app {app_id}"
    parameters:
      files:
        type: string
        description: "Audio files to transcribe (space-separated)"
      app_id:
        type: string
        description: "App ID for tracking"

  list_events:
    description: "Listar eventos del sensor (WhatsApp, audio, etc.) con filtros."
    command: "node /app/zea-agent-skill/src/index.js sensor events --app {app_id} --source {source} --status {status} --limit {limit}"
    parameters:
      app_id:
        type: string
        description: "App ID"
      source:
        type: string
        description: "Source type (whatsapp, audio, image)"
      status:
        type: string
        description: "Status filter (ingested, processing, completed, failed)"
      limit:
        type: string
        description: "Max results"

  analyze_event:
    description: "Analizar un evento con Glia DeepSeek: clasifica (bug_report, product_requirement, question, urgent) + Value Proposition Canvas."
    command: "node /app/zea-agent-skill/src/index.js sensor analyze {event_id} --app {app_id}"
    parameters:
      event_id:
        type: string
        description: "Sensor event ID"
      app_id:
        type: string
        description: "App ID"

  listen_events:
    description: "Escuchar eventos nuevos sin procesar y auto-procesarlos. Útil para modo autónomo."
    command: "node /app/zea-agent-skill/src/index.js sensor listen --app {app_id} --auto-process"
    parameters:
      app_id:
        type: string
        description: "App ID"

  report_event:
    description: "Pipeline completo: analizar evento + clasificar + enviar reporte al usuario."
    command: "node /app/zea-agent-skill/src/index.js sensor report {event_id} --app {app_id}"
    parameters:
      event_id:
        type: string
        description: "Sensor event ID"
      app_id:
        type: string
        description: "App ID"

  learn_suggest:
    description: "Consultar REML antes de procesar eventos para ver patrones aprendidos."
    command: "node /app/zea-agent-skill/src/index.js learn suggest --app {app_id} --action sensor.{action_name}"
    parameters:
      app_id:
        type: string
        description: "App ID"
      action_name:
        type: string
        description: "Action (transcribe, analyze, listen, report)"
---

# Sensor Service — Input/Output Channel for Autonomous Agents

Sensor es el canal de entrada/salida del ecosistema ZEA. Captura feedback de usuarios (WhatsApp, voz, API) y lo convierte en acciones automáticas.

## Flujo Autónomo Completo

```
1. CAPTURE (input)
   WhatsApp → Kapso webhook → Sensor event created
   Audio → MLX Whisper → transcribed text
   API → manual event creation

2. CLASSIFY (Glia + DeepSeek)
   zea sensor analyze <event_id>
   → bug_report | product_requirement | question | urgent

3. DISPATCH (Autonomous Agent)
   bug_report       → zea agent scan + zea agent improve --auto
   product_requirement → zea innovation analyze
   question         → direct response
   urgent           → escalate + notify

4. NOTIFY (output)
   zea sensor report <event_id>
   → analyze + send result via WhatsApp (Kapso API)

5. LEARN (REML)
   zea learn analyze --app sensor
   → confidence scores ↑ with each success
```

## Comandos CLI

```bash
# Transcribir audio
zea sensor transcribe audio.opus --app sudlich

# Listar eventos
zea sensor events --app sudlich --source whatsapp --status ingested

# Analizar evento
zea sensor analyze <event_id> --app sudlich

# Auto-procesar (modo autónomo)
zea sensor listen --app sudlich --auto-process

# Pipeline completo: analyze + report
zea sensor report <event_id> --app sudlich

# Consultar aprendizaje
zea learn suggest --app sudlich --action sensor.transcribe
```

## Arquitectura

```
Sensor Service (Elixir/Phoenix) — puerto 4082
  ├─ API: POST /api/sensor/events, /analyze/:id, /whatsapp/webhook
  ├─ DB: sensor_events, sensor_transcriptions, sensor_analyses
  ├─ Adapters: Audio (MLX Whisper), WhatsApp (Kapso)
  └─ Workers: Oban jobs for async processing

CLI (zea sensor) — Node.js
  ├─ transcribe, events, status, analyze
  ├─ listen (auto-process), report (analyze + notify)
  └─ REML: withLearning() on all commands

Agent (zea agent scan/improve)
  ├─ Detects unprocessed sensor events
  └─ Auto-fixes based on classification

Glia (DeepSeek v4 Pro)
  ├─ Classify: bug_report, product_requirement, question, urgent
  └─ Innovate: Value Proposition Canvas (Jobs, Pains, Gains)
```
