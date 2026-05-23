# ZEA Platform Agent Skill

This repository contains the official agent skill, CLI tool, and Model Context Protocol (MCP) server for **ZEA Platform**, the infrastructure platform designed for AI coding agents.

Adding this skill to your AI coding agents (such as Claude Code, Cursor, Windsurf, or Copilot) allows them to authenticate, manage personal access tokens (PATs), switch organizations, and interact with all ZEA Platform features.

## Installation

You can install this skill globally or within your project:

```bash
npx skills add ZeaCl/zea-agent-skill
```

And install the CLI tool globally:

```bash
npm install -g @zea-cl/cli
```

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
