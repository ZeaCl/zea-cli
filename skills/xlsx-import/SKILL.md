---
name: xlsx-import
description: Pipeline de importación de datos desde Excel/CSV a la base de datos de Venture de ZEA Platform. Usar cuando se necesita leer planillas con datos de fondos, inversionistas, compromisos, capital calls o pagos, entender su estructura, mapear columnas a entidades de la base de datos, y ejecutar la importación vía API. También para validar datos importados comparando Excel vs base de datos.
license: Proprietary
---

# XLSX Import Pipeline — ZEA Platform

## Descripción

Este skill orquesta el pipeline completo de importación de datos desde planillas Excel/CSV hacia la base de datos Venture de ZEA Platform. Trabaja en conjunto con el skill `xlsx` (Anthropic) para la lectura/escritura de archivos y con el skill `venture` para la inserción vía API.

## Pipeline de Importación

### Fase 1: Lectura y Análisis
1. Leer el archivo Excel con pandas (`pd.read_excel`)
2. Identificar headers, tipos de datos, valores nulos
3. Describir la estructura al usuario: columnas, filas, tipos

### Fase 2: Mapeo de Columnas
1. Comparar columnas del Excel con las entidades de la base de datos
2. Si hay ambigüedad → preguntar al usuario
3. Generar un plan de mapeo: `columna_excel → campo_db`

### Fase 3: Validación
1. Validar tipos de datos (fechas, montos, emails)
2. Validar referencias (fund_id, lp_id deben existir o crearse primero)
3. Reportar warnings y errores antes de importar

### Fase 4: Importación
1. Orden de inserción: fondos → inversionistas → compromisos → capital calls → pagos
2. Cada entidad se inserta vía la API de Venture (ver endpoints abajo)
3. Verificar respuesta HTTP después de cada lote
4. Si falla → corregir y reintentar

### Fase 5: Verificación
1. Comparar conteos: filas Excel vs registros en DB
2. Cruzar datos clave para verificar integridad
3. Reporte final con resumen de importación

## Entidades y Endpoints

| Entidad | Endpoint | Método |
|---|---|---|
| Fund | `/gp/funds` | GET (list), POST (create)* |
| Investor (LP) | `/gp/investors` | GET (list), POST (create) |
| Commitment | `/gp/investors/{id}/commitments` | POST |
| Capital Call | `/gp/capital-calls` | POST |
| Payment | (vía capital call items) | — |

*Nota: La creación de fondos puede requerir un workflow de Cerebelum (`FundCreateWorkflow`).

## Reglas de Negocio

1. **Montos**: Todos los montos en la BD son BIGINT (centavos). Si el Excel tiene montos en pesos (`$1,000.00`), multiplicar por 100.
2. **Estados**: Los fondos tienen 8 estados válidos: `DRAFT`, `FUNDRAISING`, `ACTIVE`, `INVESTING`, `HARVESTING`, `LIQUIDATED`, `WIND_DOWN`, `CLOSED`.
3. **Tipos de LP**: `INDIVIDUAL`, `INSTITUTIONAL`, `CORPORATE`, `FAMILY_OFFICE`.
4. **Jerarquía**: Un LP pertenece a una org. Un commitment relaciona LP + Fund. Un capital call pertenece a un Fund. Un payment pertenece a un capital_call_item.
5. **IDs**: Usar `uuid` v4 para nuevos registros si el Excel no los proporciona.

## Scripts

### `scripts/parse_excel.py`
Lee un Excel y devuelve un JSON con la estructura detectada:
```bash
python3 scripts/parse_excel.py <archivo.xlsx>
```
Output: `{"sheets": {"Sheet1": {"columns": [...], "rows": N, "dtypes": {...}}}}`

### `scripts/import_data.py`
Ejecuta la importación usando la API de Venture:
```bash
python3 scripts/import_data.py <archivo.xlsx> --map <mapeo.json> --token <ZEA_TOKEN>
```
Output: `{"imported": {"funds": N, "investors": N, ...}, "errors": [...]}`

## Preguntas de Clarificación

Cuando el mapeo es ambiguo, el agente DEBE preguntar:
- "La columna 'Monto' ¿es en pesos o en centavos?"
- "La columna 'Tipo' ¿mapea a `fund.status` o a `lp.investor_type`?"
- "¿El archivo tiene una sola hoja o múltiples hojas con distintas entidades?"
- "¿Hay IDs existentes que deba respetar o genero nuevos?"
