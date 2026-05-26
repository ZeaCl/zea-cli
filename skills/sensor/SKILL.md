---
name: sensor
description: Transcribe audio, analyze WhatsApp conversations, and capture multimodal data using ZEA Sensor service. Use when user asks to transcribe, transcription, audio, voice note, WhatsApp, analyze conversation, Kapso, or capture sensor data. Service runs locally with MLX Whisper on Apple Silicon or via API in production.
---

# Sensor Service (ZEA Platform)

## Commands

```bash
# Transcribe local audio
zea sensor transcribe audio.opus
zea sensor transcribe *.opus --model large-v3-turbo --formats all

# Query sensor events
zea sensor events --source whatsapp --status completed
zea sensor status <event_id>
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `sensor_transcribe_audio` | Transcribe audio file using MLX Whisper |
| `sensor_list_events` | List sensor events with filters |
| `sensor_get_event` | Get event details including transcription |

## API Endpoints

```
POST /api/sensor/audio/transcribe
GET  /api/sensor/events
GET  /api/sensor/events/:id
POST /api/sensor/whatsapp/webhook
```

## Flow: WhatsApp → Transcription → Agent

1. Kapso webhook → Sensor WhatsAppAdapter
2. Audio detected → download media → enqueue transcription (Oban)
3. AudioAdapter processes with MLX Whisper → stores text
4. PubSub broadcasts "event_completed" → agents listen
5. Agent analyzes transcription → triggers Cerebelum workflow
