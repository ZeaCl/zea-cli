---
name: zea
description: ZEA Platform — AI-first infrastructure for coding agents. Use this skill to access all ZEA domains (design, venture, workflow, domain, sdui, memory, agent, doctor, innovation, ops, sensor).
---

# ZEA Platform — Agent Skill

This is the **umbrella skill** for the entire ZEA Platform. It documents all available CLI commands, the Lego-piece architecture, the layer-by-layer doctor methodology, and how other agentic systems can integrate.

## Architecture — Lego Pieces

Each domain is a standalone skill+CLI piece. Combine them as needed.

| Domain | CLI | Skill File | Description |
|--------|-----|------------|-------------|
| **Design** | `zea design` | design/SKILL.md | Import designs (Stitch MCP + future tools) |
| **Venture** | `zea venture` | venture/SKILL.md | Fund management, capital calls, LPs |
| **Workflow** | `zea workflow` | — | Human-in-the-loop workflows (Cerebelum) |
| **Domain** | `zea domain` | — | Multi-domain roles, scopes, RBAC |
| **SDUI** | `zea sdui` | sdui/SKILL.md | Server-Driven UI sessions |
| **Memory** | `zea memory` | memory/SKILL.md | Persistent memory per app (agent learning) |
| **Agent** | `zea agent` | agent/SKILL.md | Manage Glia agents (create, assign, stop) |
| **Ops** | `zea ops` | ops/SKILL.md | Docker, migrations, deploy |
| **Doctor** | `zea doctor` | doctor/SKILL.md | Health check layer by layer |
| **Orchestrate** | `zea agent plan/execute` | orchestrate/SKILL.md | Autonomous planner — analyze → plan → build → verify |
| **Auth** | `zea auth` | — | Login, set-token |
| **Org** | `zea org` | — | Organization management |
| **Token** | `zea token` | — | Personal Access Tokens |
| **App** | `zea app` | — | App manifest registry |
| **Skill** | `zea skill` | — | Skill management (list, reload) |
| **Sensor** | `zea sensor` | — | Audio transcription & analysis |

## Quick Reference — All CLI Commands

### 🔐 Authentication
```bash
zea auth login                      # Interactive browser login
zea auth login --email user@... --password ...  # Direct login
zea auth set-token <token>          # Set PAT manually
```

### 🏢 Organizations
```bash
zea org list                        # List your orgs
zea org switch <id_or_slug>         # Set active org
zea org create                       # Create new org
```

### 🔄 Workflows (Cerebelum HITL)
```bash
zea workflow list                   # List available workflows
zea workflow run <module> [inputs]  # Execute a workflow
zea workflow status <execution_id>  # Get execution status
zea workflow stop <execution_id>    # Stop a running execution
zea workflow resume <execution_id>  # Resume a paused execution
```

### 🔐 Domain Roles & Scopes
```bash
zea domain list                     # List available domains and scopes
zea domain register <domain>        # Register a domain with its scopes
zea domain grant <user> <domain> <role> --org <org> [--entity-id <id>]
zea domain revoke <user> <domain> <role>
```

### 🎨 Design (Stitch MCP + future)
```bash
zea design list-screens --app <app_id>
zea design import-screen --app <app_id> --screen-id <sid> --state <name> --intent <name>
zea design status --app <app_id>
```

### 🧠 Memory (Agent Learning)
```bash
zea memory init --app <app_id> --stitch-project <project_id>
zea memory get --app <app_id> --key <path>
zea memory set --app <app_id> --key <path> --value <json>
zea memory list --app <app_id>
```

### 💰 Venture (Fund Management)
```bash
zea venture fund list
zea venture fund show <fund_id>
zea venture capital-call list
zea venture capital-call show <call_id>
zea venture capital-call send <call_id>
zea venture investor list
```

### 📱 Apps
```bash
zea app list
zea app show <app_id>
zea app register <manifest.yaml>
```

### 🖥️ SDUI
```bash
zea sdui start <app_id>
zea sdui dispatch <session_id> <action> [payload]
zea sdui screens <app_id>
zea sdui screen <app_id> <state> [--save]
zea sdui manifest <app_id>
```

### 🤖 Agents
```bash
zea agent list
zea agent create <name> [--mission <mission>]
zea agent assign <name> [--skill <skill>]
zea agent stop <name>
zea agent plan --app <id> --request "<text>"
zea agent execute --app <id> --name <experiment> --auto
zea agent scan --app <id>
zea agent improve --app <id> --auto
```

### 🛠️ Skills
```bash
zea skill list
zea skill reload
```

### 🩺 Doctor (Health Check)
```bash
zea doctor run                      # All 6 layers
zea doctor check api                # Layer 1: Connectivity
zea doctor check auth               # Layer 2: Authentication
zea doctor check venture            # Layer 3: Data endpoints
zea doctor check design            # Layer 4: Stitch MCP
zea doctor check glia               # Layer 5: LLM + Tools
zea doctor check tools              # Layer 6: Skill execution
```

### 🎙️ Sensor (Audio + AI)
```bash
zea sensor transcribe <files...> --app <id>
zea sensor events --app <id> [--source] [--status]
zea sensor status <event_id> --app <id>
zea sensor analyze <event_id> --app <id>
zea sensor listen --app <id> [--auto-process]
zea sensor report <event_id> --app <id>
```

### 💡 Innovation (Customer Discovery)
```bash
zea innovation start --sector "Construction"
zea innovation discover --sector "..." --role "..."
zea innovation analyze --file "..."
zea innovation simulate --role "CTO"
zea innovation propose
zea innovation opening --name "..." --company "..."
zea innovation register --company "..." --contact "..."
```

## Doctor — Layer-by-Layer Testing Methodology

When something breaks, test from bottom up:

### Layer 1 — API Connectivity
```bash
# Can the agent reach external APIs?
wget -qO- http://venture-api:4081/health
wget -qO- http://auth.zea.localhost/.well-known/jwks.json
```
✅ Success: `{"status":"ok"}`, JWKS keys returned

### Layer 2 — Authentication
```bash
# Is the token valid? Can we decode it?
zea doctor check auth
```
✅ Success: Token decodes, exp > now, Venture API returns 200

### Layer 3 — Venture API Data
```bash
# Do endpoints return real data?
curl -s http://venture-api.zea.localhost/gp/dashboard -H "Authorization: Bearer $TOKEN"
```
✅ Success: metrics object with active_funds, aum, pending_calls

### Layer 4 — Stitch MCP
```bash
# Can we list screens from Stitch?
zea design list-screens --app <app_id>
```
✅ Success: screens array with titles and IDs

### Layer 5 — Glia LLM + Tools
```bash
# Are agents running? Are tools loaded?
curl -s http://glia.zea.localhost/api/skills -H "Authorization: Bearer $TOKEN"
```
✅ Success: skills > 0, tools_count > 0

### Layer 6 — Skill Tools Execution
```bash
# Can the LLM call tools? Do tools execute?
# Test directly from the chat or via:
wget -qO- --header="Authorization: Bearer $ZEA_TOKEN" http://venture-api:4081/gp/capital-calls
```
✅ Success: Returns JSON with capital calls

## Common Issues & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `Tools: 0` in logs | YAML parsing failed | Check SKILL.md frontmatter: use quoted strings, `>-` for multi-line |
| `Tool not called` | Model doesn't support function calling | Use `deepseek-v4-pro`, try `tool_choice: "required"` |
| `401 Unauthorized` | Missing auth header | Add `--header="Authorization: Bearer $ZEA_TOKEN"` |
| `500 Internal` | JWKS fetch failed | Check thalumus:4000 reachable from container |
| `Empty response` | poll_for_response too early | Added `has_tool_call?` check to skip incomplete messages |
| `wget: bad address` | DNS not resolving | Use Docker internal: `venture-api:4081` not `.localhost` |
| `Todos los proveedores fallaron` | DeepSeek key invalid | Check `DEEPSEEK_API_KEYS` env var |
| `Logger.error undefined` | Missing `require Logger` | Added in adapter |

## Integration for Other Agentic Systems

### Via bash (any agent)
```bash
export ZEA_TOKEN="<jwt>"
export STITCH_KEY="<google-api-key>"

# Venture API
wget -qO- --header="Authorization: Bearer $ZEA_TOKEN" http://venture-api.zea.localhost/gp/dashboard

# Stitch MCP
curl -s -X POST https://stitch.googleapis.com/mcp \
  -H "Content-Type: application/json" \
  -H "X-Goog-Api-Key: $STITCH_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_screens","arguments":{"projectId":"PROJECT_ID"}},"id":1}'
```

### Via ZEA CLI (opencode, Claude)
```bash
# Install
npm install -g zea-agent-skill

# Authenticate
zea auth login --email user@... --password ...

# Use any domain
zea venture capital-call list
zea design import-screen --app myapp --screen-id xyz --state dashboard --intent back_to_dashboard
zea memory init --app myapp --stitch-project 12345
```

### Via Glia (ReactAgent)
Place SKILL.md files in `~/.zea/agents/{mission}/skills/{domain}/SKILL.md`
Restart Glia or call `POST /api/skills/reload`

### Via REST API (any system)
```
GET  /api/apps/:id/manifest          → App manifest
POST /api/apps                       → Register/update app
POST /api/sessions                   → Start SDUI session
POST /api/sessions/:id/dispatch      → Dispatch intent
GET  /api/skills                     → List loaded skills
POST /api/skills/reload              → Reload skills from disk
POST /api/agents                     → Create agent
POST /api/agents/:name/message       → Send message to agent
```

## Plugin System

Custom client commands are auto-discovered from `~/.zea/cli/plugins/<client>/index.js`:

```js
// ~/.zea/cli/plugins/sudlich/index.js
export function register(program) {
  const cmd = program.command('sudlich')
    .description('Südlich Ventures custom commands');
  cmd.command('approve-call').action(async () => { /* ... */ });
}
```

## Files Structure
```
~/.zea/
├── skills/             ← Agent skills (Lego pieces)
│   ├── zea/            ← Umbrella (this file)
│   ├── design/         ← zea design
│   ├── venture/        ← zea venture
│   ├── sdui/           ← zea sdui
│   ├── memory/         ← zea memory
│   ├── agent/          ← zea agent
│   ├── ops/            ← zea ops
│   ├── doctor/         ← zea doctor
│   ├── innovation/     ← zea innovation
│   └── <client>/       ← Client-specific skills
├── agents/             ← Glia missions + skills
├── memory/             ← Agent memory per app
└── cli/plugins/        ← Auto-discovered CLI plugins
```
