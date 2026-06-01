---
name: glia
description: "Glia Agent — chat interactivo con IA multi-agente vía WebSocket. Usar cuando se necesita preguntar, analizar, planificar, o ejecutar tareas con herramientas. También usar como punto de entrada para delegar entre agentes."
---

# Glia Agent CLI

Glia es el motor multi-agente ReAct de ZEA Platform. Se conecta vía WebSocket para streaming en tiempo real.

## Instalación

```bash
bun install -g github:ZeaCl/glia-cli
```

La Glia CLI comparte el archivo de configuración con ZEA CLI (`~/.config/zea/config.json`). Usa el mismo token de autenticación.

## Comandos principales

### Chat one-shot

```bash
glia chat "¿Cuántos fondos hay en Venture?" --skill venture
```

Envía un mensaje y recibe respuesta con streaming en tiempo real. Soporta Markdown renderizado (tablas, bold, código).

Opciones:
- `--tools <list>`: herramientas disponibles (bash, filesystem, etc.)
- `--skill <name>`: cargar un skill de dominio (venture, doctor, design, etc.)
- `--system-prompt <text>`: prompt personalizado

### Consola interactiva (REPL)

```bash
glia console --skill venture
```

Sesión interactiva persistente. Comandos dentro de la consola:
- `/exit` — salir
- `/reset` — reiniciar sesión

### Gestión de agentes

```bash
glia agent create <id> --skills <capabilities>
glia agent list
glia agent stop <id>
```

Crear, listar y detener agentes especialistas en el swarm.

### Swarm multi-agente

```bash
glia swarm create <id> --skills <capabilities>
glia swarm run "tarea" --tools bash,filesystem
```

Orquestación multi-agente para tareas complejas.

## Configuración

```bash
glia config set deepseek_key sk-...
glia config set gliaUrl http://localhost:4001
glia config list
```

Archivo de configuración: `~/.config/zea/config.json`

## Autenticación

```bash
glia auth set-token <jwt>
glia auth status
```

También acepta `ZEA_PAT` como variable de entorno.

## Dominios disponibles (skills)

Para respuestas especializadas, usar `--skill <name>`:

| Skill | Dominio |
|-------|---------|
| `venture` | Fondos de inversión, capital calls, investors |
| `doctor` | Diagnóstico de la plataforma |
| `design` | Diseño de apps, importar screens Stitch |
| `orchestrate` | Planificación de cambios con Lego pieces |
| `app` | Gestión de apps, experiments |
| `sdui` | Server-Driven UI, manifiestos |
| `workflow` | Flujos de trabajo Cerebelum |
| `sensor` | Captura y procesamiento de datos |
| `xlsx` | Importación y análisis de Excel |
| `zea` | Punto de entrada general a la plataforma |

## Protocolo WebSocket

Glia se conecta a `ws://localhost:4001/socket/websocket?vsn=2.0.0&token=<jwt>` usando Phoenix Channels V2.

Eventos del servidor:
- `thinking_delta` — el agente está procesando
- `message_delta` — chunks de texto en tiempo real
- `tool_call` — herramienta invocada (bash, filesystem, etc.)
- `tool_result` — resultado de la herramienta
- `done` — respuesta completa
- `error` — error

## Integración con Thalamus

Para autenticación JWT usar `zea auth login` (ZEA CLI). El token se comparte en `~/.config/zea/config.json`.
