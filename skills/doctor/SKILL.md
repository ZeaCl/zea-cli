---
name: doctor
description: "Diagnóstico de la plataforma ZEA. Verifica 6 capas: HTTP health, auth, venture data, stitch, glia, tools. Usar después de cada deploy."
---

# ZEA Doctor — Health Check

## Comandos

```bash
# Diagnóstico completo (todas las capas)
zea doctor run

# Diagnóstico por capa específica
zea doctor check <layer>

# Diagnóstico completo de plataforma (con agentes y workflows)
zea diagnose
```

## Capas

1. **api** — HTTP health de todos los servicios (venture, thalamus, stitch MCP)
2. **auth** — JWT válido, token decode, expiración, Venture API autenticada
3. **venture** — Fondos, capital calls, investors, dashboard accesibles
4. **stitch** — Stitch MCP reachable, list_screens funciona (requiere STITCH_KEY)
5. **glia** — Glia health endpoint, agents running, DeepSeek reachable
6. **tools** — ZEA CLI disponible, ZEA_TOKEN válido, skills directory existe

## Uso

```bash
# Diagnóstico completo (recomendado después de cada deploy)
zea doctor run

# Capa específica
zea doctor check venture
zea doctor check glia
zea doctor check auth
```

## Error recovery

Si `zea doctor run` encuentra fallos:

### 1. Verificar el servicio afectado
- **api**: ¿Están corriendo los servicios Docker? `docker ps | grep zea`
- **auth**: ¿Thalamus está corriendo? `curl http://auth.zea.localhost/.well-known/jwks.json`
- **venture**: ¿venture-api está corriendo? `curl http://venture.zea.localhost/health`
- **glia**: ¿Glia está corriendo? `curl http://glia.zea.localhost/api/health`
- **stitch**: ¿STITCH_KEY está configurada? `echo $STITCH_KEY`
- **tools**: ¿zea CLI instalado? `which zea`

### 2. Reiniciar servicio
```bash
docker compose -f docker-compose.local.yml up -d <service> --build
```

### 3. Verificar base de datos
```bash
docker exec zea_postgres_local psql -U postgres -c "\l"
```

### 4. Revisar logs
```bash
docker logs zea_<service>_local --tail 50
```
