# Thalamus Agent Skill

This repository contains the official agent skill, CLI tool, and Model Context Protocol (MCP) server for **ZEA Thalamus**, the agentic authentication and authorization server.

Adding this skill to your AI coding agents (such as Claude Code, Cursor, Windsurf, or Copilot) allows them to authenticate, manage personal access tokens (PATs), switch organizations, and interact with the secure identity features of ZEA Thalamus.

## Installation

You can install this skill globally or within your project:

```bash
npx skills add ZeaCl/thalamus-agent-skill
```

And install the CLI tool globally:

```bash
npm install -g @zea-ai/thalamus-cli
```

## CLI Usage

The `thalamus` CLI provides commands to authenticate and manage Thalamus resources.

### 1. Authentication
To login interactively via OAuth2 PKCE redirect loop:
```bash
thalamus auth login
```
This opens your browser, redirects to Thalamus for authentication, and securely saves your credentials locally.

Alternatively, you can authenticate using a Personal Access Token (PAT) by setting the `THALAMUS_PAT` environment variable or using:
```bash
thalamus auth set-token <th_pat_...>
```

### 2. Organizations
List organizations you belong to:
```bash
thalamus org list
```

Switch the active organization context:
```bash
thalamus org switch <org_slug_or_id>
```

Create a new organization:
```bash
thalamus org create --name "My Organization" --email "owner@myorg.com" --plan standard
```

### 3. Personal Access Tokens (PATs)
Generate a new PAT:
```bash
thalamus token create --name "My Token Description"
```

List active PATs:
```bash
thalamus token list
```

Revoke a PAT:
```bash
thalamus token revoke <token_id>
```

## MCP Server Integration

Thalamus includes a built-in Model Context Protocol (MCP) server that exposes these actions as tools for LLMs. To add it to your agent configurations (e.g. `mcp_config.json`):

```json
{
  "mcpServers": {
    "thalamus": {
      "command": "thalamus",
      "args": ["mcp"],
      "env": {
        "THALAMUS_API_URL": "http://auth.zea.localhost:4000",
        "THALAMUS_PAT": "your_personal_access_token_here"
      }
    }
  }
}
```

---
*Powered by [Zea Platform](https://zea.cl)*
