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

## Error recovery

Si `doctor check` encuentra fallos en alguna capa:

### 1. Buscar en error_patterns
```bash
node /workspace/zea-cli/src/index.js maintenance patterns
```
- Si el error tiene un patrón conocido con confidence > 0.9 → auto-fix
- Si confidence < 0.5 → derivar a maintenance agent

### 2. Auto-fix (patrones estables)
Si `error_patterns.json` tiene un fix para este error con confidence > 0.9:
- Ejecutar el fix documentado
- Verificar con `doctor check` de nuevo
- Registrar resultado con `recordFixResult()`

### 3. Maintenance agent (errores nuevos o inestables)
Si el patrón no existe o tiene confidence baja:
- POST opencode-maintenance:4097/session con el detalle del error
- El maintenance agent investiga, fixea y reporta
- Si fixea → registrar patrón en error_patterns
- Si no puede → reportar al usuario
