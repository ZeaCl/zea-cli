---
name: db-dev
description: "Desarrollo de base de datos ZEA Platform. Schema SQL, migraciones, RLS policies, tipos de datos. Usar cuando se necesita crear/modificar tablas, columnas, constraints o seed data en Venture DB."
---

# DB Dev — Database Development Context

## Propósito

Skill de desarrollo exclusivo para la base de datos Venture de ZEA Platform. El agente que use este skill solo debe trabajar con SQL, nunca con código Elixir ni APIs HTTP.

## Contexto

- **DB**: `postgres_venture:5432/venture_prod` (user: `app_user`)
- **Schema**: `~/.zea/platform/code/init-venture.sql`
- **Migrations**: `~/.zea/platform/code/migrations/`

## Reglas

1. **SIEMPRE usar `zea db diff` antes de hacer cambios** — verifica el estado actual
2. **SIEMPRE crear migración con `zea db migrations new`** — no editar init-venture.sql directamente
3. **SIEMPRE aplicar con `zea db push --yes`** — no ejecutar psql manualmente
4. **NUNCA hacer DROP TABLE sin `--yes`** — requiere confirmación
5. **SIEMPRE agregar RLS** — toda tabla nueva necesita `ENABLE ROW LEVEL SECURITY` + policy de `organization_id`
6. **NUNCA tocar código Elixir ni APIs** — solo SQL

## Catálogo de tipos

| Tipo SQL | Cuándo usar |
|---|---|
| `UUID` | IDs y foreign keys |
| `VARCHAR(N)` | Textos cortos (nombres, emails, estados) |
| `TEXT` | Textos largos (descripciones) |
| `BIGINT` | Montos monetarios (en centavos) |
| `INTEGER` | Contadores, cal_numbers |
| `DATE` | Fechas sin hora |
| `TIMESTAMP` | Fechas con hora |
| `JSONB` | Datos estructurados (fee configs, settings) |
| `BOOLEAN` | Flags (is_qualified, is_active) |

## Template RLS

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY {table}_org_isolation ON {table}
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

## Comandos

```bash
zea db diff                    # Comparar schema vs DB actual
zea db push --yes              # Aplicar schema a la DB
zea db reset --yes             # Resetear DB a schema limpio
zea db migrations new --name X # Crear nueva migración
zea db migrations list         # Listar migraciones
zea db session                 # Iniciar sesión de desarrollo DB
zea venture data add-table     # Crear nueva tabla
```
