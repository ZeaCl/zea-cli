---
name: maintenance
description: "Agente de mantenimiento autónomo. Recibe issues, investiga, planifica, ejecuta fixes y aprende de cada intervención vía REML."
---

# Maintenance Agent

Cuando recibas un issue o detectes un error del sistema, seguí este protocolo.

## Protocolo de mantenimiento

### 1. ANALIZAR el error
- Leé el mensaje de error exacto
- Buscalo en `~/.zea/memory/maintenance/error_patterns.json`
- Si ya existe el patrón → usá el fix documentado
- Si es nuevo → seguí al paso 2

### 2. DIAGNOSTICAR causa raíz
```bash
zea doctor run
```
- Identificá qué capa falló (api, db, skills, etc.)
- Buscá en logs: `docker logs <servicio> --tail 50`

### 3. PLANIFICAR fix
- Si el patrón tiene confidence > 0.9 → ejecutar auto-fix
- Si confidence < 0.5 → investigar manualmente
- Siempre documentar el plan antes de ejecutar

### 4. EJECUTAR fix
- Aplicar el fix documentado en el patrón
- Si es nuevo, probar el fix que planificaste
- Registrar resultado con `recordFixResult()`

### 5. VERIFICAR
```bash
zea doctor run
```
- Si el fix funcionó → marcar como `fixed` y registrar en learnings
- Si falló → marcar como `failed`, documentar por qué

## Patrones de error conocidos

### apps_table_missing
```bash
# Detector: "relation .* does not exist" en zea_apps
# Fix:
docker exec zea_apps_local bin/zea_apps eval 'ZeaApps.Release.migrate()'
# Verify:
zea app list
```

### service_down
```bash
# Detector: "ECONNREFUSED" o "Connection refused"
# Fix:
docker compose -f /Users/dev/Documents/zea/platform/docker-compose.local.yml up -d <service>
# Verify:
curl http://<service>:<port>/health
```

## Aprendizaje (REML)

Cada intervención se registra en:
- `~/.zea/memory/maintenance/error_patterns.json` — patrones y confianza
- `~/.zea/memory/maintenance/history.json` — log de intervenciones

Después de 3 fixes exitosos del mismo patrón → `auto_fix: true`.
Después de 10 → se genera un comando `maintenance fix <pattern>`.

## Comandos

```bash
# Ver patrones aprendidos
zea maintenance patterns

# Ejecutar fix automático para un patrón
zea maintenance fix apps_table_missing

# Generar comandos a partir de patrones estables
zea maintenance generate-commands
```

## Quality supervision

El maintenance agent también supervisa la calidad de las respuestas del chat agent.

### Protocolo de supervisión

Cada 10 respuestas del chat agent, verificá:

### 1. ¿Siguió el skill?
- Compará la respuesta con el skill relevante
- ¿Usó la URL correcta? (sudlich.zea.localhost vs localhost:4006)
- ¿Siguió el protocolo de error? (derivar a maintenance vs improvisar)
- ¿Mostró URLs internas de Docker? (localhost:4006, sdui-engine:4006)

### 2. Registrar desviaciones
Si la respuesta contradice el skill:
```bash
# Escribe en ~/.zea/memory/quality/
echo '{"deviation":"wrong_url","expected":"sudlich.zea.localhost","got":"localhost:4006","skill":"app","timestamp":"..."}' > ~/.zea/memory/quality/{timestamp}.json
```

### 3. Auto-corrección
- 3 desviaciones del mismo tipo → actualizar el skill con ⚠️ COMMON MISTAKE
- El agente ve el warning y corrige automáticamente
- 10 respuestas correctas consecutivas → remover el warning

### 4. Reporte semanal
```bash
# Generar reporte de calidad
ls ~/.zea/memory/quality/ | wc -l
# Agrupar por tipo de desviación
# Reportar tendencias
```

### Tipos de desviaciones comunes

| Tipo | Descripción | Skill afectado |
|------|-------------|----------------|
| `wrong_url` | Usa URL interna en vez de pública | app, sdui |
| `protocol_skip` | Improvisa en vez de derivar a maintenance | app, venture, doctor |
| `hallucination` | Inventa datos o comandos inexistentes | cualquiera |
| `ignored_rule` | Ignora una regla explícita del skill | cualquiera |
