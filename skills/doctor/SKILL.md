---
name: doctor
description: "Diagnóstico de la plataforma ZEA. Verifica 7 capas: HTTP health, auth, venture data, skills sync, opencode, tools, chat E2E. Usar después de cada deploy."
---

# ZEA Doctor — Health Check

## Comando
```
node /workspace/zea-cli/src/index.js doctor check
```

## Capas
1. **api** — HTTP health de todos los servicios
2. **auth** — JWT valida + opencode session create
3. **venture** — Fondos, capital calls, investors accesibles
4. **skills** — Skills ZEA sincronizadas con opencode
5. **opencode** — DeepSeek reachable + responde prompts
6. **tools** — ZEA CLI disponible + ZEA_TOKEN válido
7. **chat** — E2E smoke test (send prompt → get response)

## Uso
```bash
# Diagnóstico completo
zea doctor check

# Diagnóstico + reparación automática
zea doctor check --fix
```
