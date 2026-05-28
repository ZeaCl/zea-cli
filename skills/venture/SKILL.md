---
name: venture
description: "Gestión de fondos de inversión: listar, crear, transicionar. Capital calls: listar, crear, enviar. Investors, payments, distributions."
---

# Venture — Fund Management

## Comandos
```bash
# Fondos
node /workspace/zea-cli/src/index.js venture fund list
node /workspace/zea-cli/src/index.js venture fund create --name "X" --hard-cap 5000000 --currency USD
node /workspace/zea-cli/src/index.js venture fund show <id>
node /workspace/zea-cli/src/index.js venture fund transition <id> --status FUNDRAISING

# Capital Calls
node /workspace/zea-cli/src/index.js venture capital-call list
node /workspace/zea-cli/src/index.js venture capital-call create --fund <id> --amount 1000000 --due-date 2026-12-31
node /workspace/zea-cli/src/index.js venture capital-call send <id>

# Investors
node /workspace/zea-cli/src/index.js venture investor list
node /workspace/zea-cli/src/index.js venture investor create --name "X" --email "x@y.com"
node /workspace/zea-cli/src/index.js venture investor add-commitment --investor <id> --fund <id> --amount 1000000

# Dashboard
node /workspace/zea-cli/src/index.js venture dashboard
```

## APIs internas
```bash
curl http://venture-api:4081/gp/funds -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
curl http://venture-api:4081/gp/capital-calls -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
curl http://venture-api:4081/gp/investors -H "Authorization: Bearer $ZEA_TOKEN" -H "x-zea-org-id: $ZEA_ORG_ID"
```
