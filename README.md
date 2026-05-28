# ZEA Platform Agent Skill

CLI tools, agent skills, and MCP server for **ZEA Platform** — the infrastructure platform for AI coding agents.

Adding this skill to your AI coding agents (Claude Code, Cursor, Windsurf, Copilot, opencode) allows them to authenticate, manage tokens, and interact with all ZEA Platform features.

## Installation

### Rápida (todo junto)
```bash
curl -fsSL https://raw.githubusercontent.com/ZeaCl/zea-agent-skill/main/install.sh | bash
```

### Solo CLI (zea + glia)
```bash
npm install -g github:ZeaCl/zea-agent-skill
```

### Solo skills (para agentes)
```bash
npx skills add ZeaCl/zea-agent-skill --yes --global
```

## Quick Start

```bash
# Chat con Glia
glia "¿Cuántos fondos hay?"

# Chat interactivo
glia

# Plan mode
glia --plan "Planificá cómo cambiar el color"

# Backend React (sin opencode)
glia --react "Hola"
```

## Skills disponibles

| Skill | Descripción |
|-------|-------------|
| `zea` | Umbrella — documentación completa |
| `app` | Crear, registrar y modificar apps |
| `design` | Importar screens Stitch, cambiar colores |
| `venture` | Fondos, capital calls, investors |
| `sdui` | Manifiestos, estados, intents |
| `doctor` | Diagnóstico 7 capas |
| `agent` | Gestión de agentes Glia |
| `workflow` | Cerebelum workflows |
| `sensor` | Audio transcription |
| `orchestrate` | Planificador autónomo |

## CLI Usage

The `zea` CLI provides commands to authenticate and manage ZEA Platform resources.

### 1. Authentication
To login interactively via OAuth2 PKCE redirect loop:
```bash
zea auth login
```
This opens your browser, redirects to Thalamus/ZEA Auth for authentication, and securely saves your credentials locally.

Alternatively, you can authenticate using a Personal Access Token (PAT) by setting the `ZEA_PAT` environment variable or using:
```bash
zea auth set-token <token_value>
```

### 2. Organizations
List organizations you belong to:
```bash
zea org list
```

Switch the active organization context:
```bash
zea org switch <org_slug_or_id>
```

Create a new organization:
```bash
zea org create --name "My Organization" --email "owner@myorg.com" --plan standard
```

### 3. Personal Access Tokens (PATs)
Generate a new PAT:
```bash
zea token create --name "My Token Description"
```

List active PATs:
```bash
zea token list
```

Revoke a PAT:
```bash
zea token revoke <token_id>
```

## MCP Server Integration

ZEA CLI includes a built-in Model Context Protocol (MCP) server that exposes these actions as tools for LLMs. To add it to your agent configurations (e.g. `mcp_config.json`):

```json
{
  "mcpServers": {
    "zea": {
      "command": "zea",
      "args": ["mcp"],
      "env": {
        "ZEA_API_URL": "http://auth.zea.localhost:4000",
        "ZEA_PAT": "your_personal_access_token_here"
      }
    }
  }
}
```

---
*Powered by [Zea Platform](https://zea.cl)*
