---
name: ops
description: "Operaciones ZEA: Docker, migraciones, deploy, estado de contenedores."
---

# Ops — Operations

## Comandos
```bash
# Estado de contenedores
node /workspace/zea-cli/src/index.js ops status

# Iniciar/parar servicios
node /workspace/zea-cli/src/index.js ops up
node /workspace/zea-cli/src/index.js ops down

# Migraciones
node /workspace/zea-cli/src/index.js ops migrate

# Deploy
node /workspace/zea-cli/src/index.js ops deploy

# Sincronizar código
node /workspace/zea-cli/src/index.js ops sync
```

## Docker Compose
```bash
cd /Users/dev/Documents/zea/platform
docker compose -f docker-compose.local.yml up -d
docker compose ps
docker logs <service>
```
