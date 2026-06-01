---
name: venture
description: "Gestión de fondos de inversión: listar, crear, transicionar. Capital calls: listar, crear, enviar. Investors, payments, distributions."
---

# Venture — Fund Management

## Comandos
```bash
# Fondos
zea venture fund list
zea venture fund create --name "X" --hard-cap 5000000 --currency USD
zea venture fund show <id>
zea venture fund transition <id> --status FUNDRAISING

# Capital Calls
zea venture capital-call list
zea venture capital-call create --fund <id> --amount 1000000 --due-date 2026-12-31
zea venture capital-call send <id>

# Investors
zea venture investor list
zea venture investor create --name "X" --email "x@y.com"
zea venture investor add-commitment --investor <id> --fund <id> --amount 1000000

# Dashboard
zea venture dashboard
```

## APIs internas
```bash
curl https://venture.zea.cl/gp/funds -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
curl https://venture.zea.cl/gp/capital-calls -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
curl https://venture.zea.cl/gp/investors -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
```

## Error recovery

Si venture commands fallan (HTTP 500, "undefined_table", "ECONNREFUSED"):

### 1. Diagnóstico
```bash
docker exec zea_postgres_venture_local psql -U app_user -d venture_prod -c "\dt"
```
- Si "relation does not exist" → DB sin migraciones
- Si ECONNREFUSED → servicio caído

### 2. DERIVÁ a maintenance agent
POST opencode-maintenance:4097/session
Prompt: "Issue: venture-api. {error}. Skill: maintenance. Fix: run migrations or restart service."

### 3. Reintentar
Si maintenance reporta "fixed" → reintentar la operación original.
