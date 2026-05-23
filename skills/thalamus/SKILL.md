---
name: thalamus
description: Authenticate, switch organizations, and manage Personal Access Tokens (PATs) using the Thalamus CLI or MCP server.
allowed-tools:
  - thalamus
---
# Thalamus Agent Skill

This skill allows AI agents to interact with the ZEA Thalamus Authentication and Identity service, enabling authentication, organization switching, and token management.

## Prerequisites
Ensure the `thalamus` CLI is installed globally.
If not authenticated, run:
```bash
thalamus auth login
```
Or set the `THALAMUS_PAT` environment variable with a Personal Access Token.

## Available Commands

- **Interactive Login**: Open browser to authenticate with Thalamus.
  ```bash
  thalamus auth login
  ```
- **Set PAT token manually**: Authenticate by saving a pre-generated Personal Access Token.
  ```bash
  thalamus auth set-token <token_value>
  ```
- **List Organizations**: Show all organizations the authenticated user belongs to.
  ```bash
  thalamus org list
  ```
- **Switch Organization Context**: Set the active organization context for subsequent commands.
  ```bash
  thalamus org switch <org_slug_or_id>
  ```
- **Create Personal Access Token**: Generate a new PAT under the active organization.
  ```bash
  thalamus token create --name <description>
  ```
  *Example:* `thalamus token create --name "Cortex Local CLI"`
- **List Tokens**: Show all active Personal Access Tokens.
  ```bash
  thalamus token list
  ```
- **Revoke Token**: Deactivate a Personal Access Token by its ID.
  ```bash
  thalamus token revoke <token_id>
  ```

## MCP Server Integration
To configure Thalamus as a Model Context Protocol (MCP) server in your agent configuration (e.g., `mcp_config.json`), add:
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
