---
name: zea
description: Authenticate, switch organizations, manage Personal Access Tokens (PATs) and perform platform actions using the ZEA CLI or MCP server.
---
# ZEA Platform Agent Skill

This skill allows AI agents to interact with the ZEA Platform Authentication and Identity service, enabling authentication, organization switching, and token management.

## Prerequisites
Ensure the `zea` CLI is installed globally.
If not authenticated, run:
```bash
zea auth login
```
Or set the `ZEA_PAT` environment variable with a Personal Access Token.

## Available Commands

- **Interactive Login**: Open browser to authenticate with ZEA Platform.
  ```bash
  zea auth login
  ```
- **Set PAT token manually**: Authenticate by saving a pre-generated Personal Access Token.
  ```bash
  zea auth set-token <token_value>
  ```
- **List Organizations**: Show all organizations the authenticated user belongs to.
  ```bash
  zea org list
  ```
- **Switch Organization Context**: Set the active organization context for subsequent commands.
  ```bash
  zea org switch <org_slug_or_id>
  ```
- **Create Organization**: Create a new organization.
  ```bash
  zea org create --name <org_name> --email <owner_email> [--plan <plan_type>]
  ```
  *Example:* `zea org create --name "Sudlich Enterprise" --email "ccerda@sudlich.cl" --plan standard`
- **Create Personal Access Token**: Generate a new PAT under the active organization.
  ```bash
  zea token create --name <description>
  ```
  *Example:* `zea token create --name "Cortex Local CLI"`
- **List Tokens**: Show all active Personal Access Tokens.
  ```bash
  zea token list
  ```
- **Revoke Token**: Deactivate a Personal Access Token by its ID.
  ```bash
  zea token revoke <token_id>
  ```

## MCP Server Integration
To configure ZEA Platform as a Model Context Protocol (MCP) server in your agent configuration (e.g., `mcp_config.json`), add:
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
