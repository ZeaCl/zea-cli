---
name: screen-functionalizer
description: "Pipeline completo para dar funcionalidad a pantallas Stitch importadas en ZEA Platform. Toma HTML estático de Stitch, analiza sus componentes, descubre qué APIs de Venture pueden darle datos, inyecta data-zea-bind, crea intent_routing con domain_api + data_mapping, implementa los cambios en el manifiesto y verifica que los datos reales se rendericen correctamente. Usa orquestación automática con delegación a maintenance agent y preguntas del coach cuando se traba."
---

# Screen Functionalizer — Pipeline de Funcionalización

## Filosofía

Una pantalla Stitch es una maqueta — HTML estático. Para que sea funcional necesita:
1. Identificar qué datos muestra (KPIs, tablas, formularios)
2. Conectarlos a APIs reales de Venture
3. Inyectar bindings en el HTML
4. Crear la navegación (intents)
5. Verificar que todo funcione

El agente NUNCA deja una pantalla como HTML estático. Siempre completa el pipeline.

## Pipeline de 6 fases

### Fase 1: ANALYZE
```
Input:  HTML de un StitchedScreen (manifest.states["dashboard"].html)
Output: { type: "dashboard"|"list"|"form"|"detail",
          components: [{type, selector, current_value, data_purpose}],
          data_needs: ["fondos activos", "AUM total", "lista LPs"] }
```

**Reglas:**
- Parsear el HTML identificando: `<table>`, `<span class="metric">`, `<button>`, `<form>`, `<canvas>`, `<h1-h6>`
- Clasificar cada componente por su propósito semántico
- Extraer valores actuales (estáticos) como referencia
- **Coach trigger**: 3 iteraciones sin decidir el tipo → el coach pregunta "¿Qué te falta saber para clasificarla?"
- **Maintenance trigger**: HTML corrupto o vacío → delegar

### Fase 2: DISCOVER
```
Input:  component list + data_needs
Output: intent_routing entries con type: "domain_api" + data_mapping
```

**Catálogo de APIs Venture:**

| Componente | Endpoint | Campo en response |
|---|---|---|
| KPI "Active Funds" | `GET /gp/dashboard` | `active_funds` |
| KPI "Active LPs" | `GET /gp/dashboard` | `active_lps` |
| KPI "AUM" | `GET /gp/dashboard` | `aum` |
| KPI "Pending Calls" | `GET /gp/dashboard` | `pending_capital_calls` |
| Tabla de fondos | `GET /gp/funds` | `funds` (array) |
| Tabla de inversores | `GET /gp/investors` | `lps` (array) |
| Tabla de capital calls | `GET /gp/capital-calls` | `capital_calls` (array) |
| Formulario crear fund | `POST /gp/funds` | (body params: name, type, etc.) |
| Gráfico (chart) | `GET /gp/dashboard` | `aum`, `active_funds` (para labels/values) |

**Reglas:**
- Cada componente visual debe mapear a un endpoint
- Si un componente no tiene API directa → preguntar al coach
- Si un endpoint devuelve 500 → delegar a maintenance
- El `data_mapping` mapea campos del response a keys que usa el HTML

**Ejemplo de output:**
```json
{
  "intent_routing": {
    "load_dashboard": {
      "type": "domain_api",
      "domain": "venture",
      "endpoint": "GET /gp/dashboard",
      "target_state": "dashboard",
      "data_mapping": {
        "aum": "aum",
        "active_funds": "active_funds_count",
        "active_lps": "active_lps",
        "pending_calls": "pending_capital_calls"
      }
    }
  }
}
```

### Fase 3: INJECT BINDINGS
```
Input:  HTML estático + data_mapping keys
Output: HTML con data-zea-bind attributes
```

**Reglas:**
- Encontrar cada valor estático en el HTML
- Reemplazar con `data-zea-bind="key.del.data_mapping"`
- Para tablas: `<tr data-zea-bind="funds">` con `<td data-zea-bind="name">`
- Para métricas: `<span data-zea-bind="aum">` en vez del valor hardcodeado
- NO modificar estructura HTML, solo agregar atributos
- **Coach trigger**: el mapeo es ambiguo (ej: dos valores iguales en distinto contexto)

**Ejemplo transformación:**
```html
<!-- Antes -->
<span class="metric-value">$10,000,000</span>

<!-- Después -->
<span class="metric-value" data-zea-bind="aum">$10,000,000</span>
```

### Fase 4: PLAN (orquestar)
```
Input:  intents + bindings + estado actual del manifiesto
Output: Plan detallado paso a paso (usando skill orchestrate)
```

**El plan debe incluir:**
1. Estados a crear/modificar
2. Intents a agregar (con tipo, domain, endpoint, data_mapping)
3. Navegación entre pantallas (sidebar items, botones)
4. Orden de ejecución
5. Puntos de verificación

**Reglas:**
- Siempre crear un experiment antes de modificar (si la API lo permite)
- Si el plan tiene más de 10 pasos → coach pregunta "¿Cuál es la versión mínima viable?"
- Cada paso debe ser atómico y verificable

### Fase 5: IMPLEMENT
```
Input:  Plan paso a paso
Output: Manifiesto actualizado en zea-apps
```

**Comandos clave:**
```bash
# Obtener manifiesto actual
curl http://apps.zea.localhost/api/apps/my_app/manifest

# Actualizar manifiesto (vía API o archivo)
# Opción A: API
curl -X PUT http://apps.zea.localhost/api/apps/my_app \
  -H "Content-Type: application/json" \
  -d '{"manifest": {...}, "intent_routing": {...}}'

# Opción B: Archivo (si API no disponible)
# Escribir directamente el manifiesto en el workspace
```

**Reglas:**
- Si API funciona → usarla
- Si API falla (500) → delegar a maintenance → reintentar
- Si API no existe → usar filesystem como fallback
- Cada paso se verifica antes de continuar
- **Maintenance trigger por paso:** 500, tabla rota, servicio caído

### Fase 6: VERIFY
```
Input:  App funcionalizada
Output: Reporte de verificación (pass/fail por componente)
```

**Pruebas por pantalla:**
1. **Carga de datos**: curl al endpoint → verificar que response no está vacío
2. **Renderizado**: abrir la app en SDUI → verificar que los bindings muestran valores reales
3. **Navegación**: dispatch intents → verificar transiciones entre pantallas
4. **Estado vacío**: simular API sin datos → verificar que la UI no se rompe
5. **Error**: simular API caída → verificar que hay mensaje de error

**Reglas:**
- Si 3+ tests fallan con el mismo patrón → quality supervisor registra desviación
- Si curl falla → delegar a maintenance
- Si el renderizado no funciona → revisar data-zea-bind paths

## Catálogo de APIs por tipo de pantalla

| Tipo de pantalla | APIs necesarias | Intents típicos |
|---|---|---|
| **Dashboard** | `GET /gp/dashboard`, `GET /gp/funds` | `load_dashboard`, `view_funds_list`, `create_fund` |
| **Lista** | `GET /gp/{entidad}` | `load_list`, `view_detail`, `create_new` |
| **Formulario** | `POST /gp/{entidad}` | `submit_form`, `cancel` |
| **Detalle** | `GET /gp/{entidad}/{id}` | `load_detail`, `edit`, `delete` |

## Delegación automática

| Error | Acción |
|---|---|
| HTML corrupto | → Maintenance: re-importar de Stitch |
| API 500 | → Maintenance: diagnosticar logs, fixear, reintentar |
| data-zea-bind no resuelve | → Maintenance: verificar data_mapping, corregir paths |
| Manifiesto no se actualiza | → Maintenance: verificar zea-apps, migrar si es necesario |
| 3 iteraciones mismo paso | → Coach: pregunta socrática |
| Plan > 10 pasos | → Coach: "¿MVP?" |
| Mapeo ambiguo | → Coach: "¿Cuál interpretación es la correcta?" |

## Comandos

```bash
# Iniciar pipeline para una pantalla
zea screen functionalize --app my_app --screen dashboard

# Solo analizar (sin modificar)
zea screen analyze --app my_app --screen dashboard

# Solo inyectar bindings
zea screen inject-bindings --app my_app --screen dashboard

# Verificar una pantalla funcionalizada
zea screen verify --app my_app --screen dashboard
```
