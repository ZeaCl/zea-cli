---
name: venture
description: "Gestión de fondos de inversión: listar, crear, transicionar. Capital calls: listar, crear, enviar. Investors, payments, distributions."
---

# Venture — Fund Management

## 🔐 Autenticación

**IMPORTANTE**: Antes de cualquier comando, verificar que tengas token.

```bash
# 1. Revisar si hay token en variables de entorno
echo "ZEA_TOKEN=${ZEA_TOKEN:-no definido}"
echo "ZEA_PAT=${ZEA_PAT:-no definido}"

# 2. Usar el primero que exista
export ZEA_TOKEN="${ZEA_TOKEN:-$ZEA_PAT}"

# 3. Si ninguno existe, NO puedo ejecutar comandos
#    Pedir al usuario que configure ZEA_PAT en Thalamus agent_config
```

Si no hay token, responder: "No tengo token de acceso a ZEA Platform. Necesito que configures ZEA_PAT en mi agent_config en Thalamus."

## Comandos CLI
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

## APIs (recomendado: usa curl, no el CLI)
```bash
# Con token
curl http://venture.zea.localhost/gp/funds \
  -H "Authorization: Bearer ${ZEA_TOKEN}"

curl http://venture.zea.localhost/gp/funds \
  -H "Authorization: Bearer ${ZEA_TOKEN}"

curl http://venture.zea.localhost/gp/investors \
  -H "Authorization: Bearer ${ZEA_TOKEN}"

curl http://venture.zea.localhost/gp/dashboard \
  -H "Authorization: Bearer ${ZEA_TOKEN}"

curl http://venture.zea.localhost/gp/capital-calls \
  -H "Authorization: Bearer ${ZEA_TOKEN}"
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
