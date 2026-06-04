---
name: domain
description: >
  Create, scaffold, validate, and extend ZEA Platform business domains with TDD-first pipeline
  (init → scaffold tests → scaffold API → scaffold DB → pipeline). Use this skill whenever the user
  wants to create a new domain, add entities/tables to an existing domain, run CI/CD validation on
  a domain API, create a new business module in ZEA (e.g. "crear un dominio de nutrition"),
  extend a domain with new tables or API endpoints, validate domain code quality, or any task
  involving `zea domain` commands. Even if the user doesn't say "domain" explicitly, if they talk
  about "crear un módulo nuevo", "agregar una API", "nuevo negocio en ZEA", or "multi-tenant app",
  use this skill.
---

# ZEA Domain — Creación y Gestión de Dominios

## 🎯 Cuándo usar este skill

**Triggers principales:**
- Usuario dice "crear un dominio", "nuevo dominio", "nuevo módulo de negocio"
- Usuario menciona "nutrition", "sports", "education" como nuevo vertical en ZEA
- Usuario quiere "agregar tablas", "extender API", "agregar endpoints" a un dominio existente
- Usuario dice "pipeline", "validar dominio", "CI/CD del dominio"
- Usuario habla de "scaffold", "TDD", "generar código de API"
- Cualquier tarea que involucre `zea domain` commands

## 🧱 Conceptos clave

Un **dominio** en ZEA es un módulo de negocio multi-tenant completo. Incluye API REST (Elixir/Phoenix), schema SQL con RLS, comandos CLI para AI agents, y un pipeline de validación de 9 etapas.

**Flujo TDD obligatorio:** tests → api → db → pipeline. NUNCA saltarse tests.

```
dominio/
├── domains/{name}/manifest.json     ← Registro del dominio
├── domains/{name}/api-catalog.json  ← Catálogo de endpoints REST
├── {name}-api/                      ← Proyecto Elixir/Phoenix
│   ├── mix.exs, .formatter.exs
│   ├── lib/                         ← Código (router, controller, plugs, repo)
│   ├── test/
│   │   ├── unit/                    ← Tests de plugs + controller
│   │   ├── integration/             ← Tests CRUD por entidad
│   │   └── e2e/                     ← Tests de flujo completo
│   ├── init-{name}.sql              ← Schema SQL + RLS policies
│   └── Dockerfile
└── src/commands/{name}.js           ← Comandos CLI para AI agents
```

## 🚀 Comandos esenciales

### Crear dominio desde spec (Open Spec)

```bash
zea domain init <name> \
  --spec requirements.md \
  --design-spec design.md \
  --label "Human Label" \
  --api-prefix "xx" \
  --api-port 4085 \
  --entities "profiles,meals,goals" \
  --yes
```

`--spec` + `--design-spec` detectan entidades automáticamente del ERD y requirements. Con `--yes` las acepta todas sin preguntar.

### Scaffold (TDD order)

```bash
zea domain scaffold <name> --layer tests   # 1. Tests PRIMERO (RED)
zea domain scaffold <name> --layer api     # 2. Código (GREEN)
zea domain scaffold <name> --layer db      # 3. Schema SQL + RLS
zea domain scaffold <name> --layer docker  # 4. Dockerfile
```

**Capas:** `tests`, `api`, `db`, `docker`, `cli`

### Pipeline de validación

```bash
zea domain pipeline <name>                       # 9 etapas completas
zea domain pipeline <name> --step test           # Solo tests
zea domain pipeline <name> --from compile --to coverage
zea domain pipeline <name> --skip dialyzer,build
zea domain pipeline <name> --step format --fix   # Auto-formatear
zea domain pipeline stages                       # Listar etapas
```

**Etapas:** compile → format → credo → deps → test → coverage → dialyzer → build → smoke

Cada etapa es binaria (✅/❌). Si una falla, el pipeline se detiene y sugiere el comando para reintentar desde esa etapa.

### Extender dominio (AI agents en runtime)

```bash
zea <domain> data add-table --name "food_catalog" --fields '[...]'
zea <domain> api add-endpoint --method GET --path "/nt/food-catalog" --handler "list_food_catalog"
zea <domain> schema
```

Esto permite a un AI agent agregar tablas y endpoints sin escribir código manualmente.

## 🔐 Multi-tenancy y RLS

Toda tabla generada incluye:
```sql
organization_id UUID NOT NULL REFERENCES organizations(id)
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
CREATE POLICY {table}_org_isolation ON {table}
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

## 📦 Convenciones

| Elemento | Formato | Ejemplo |
|---|---|---|
| Domain name | snake_case | `nutrition` |
| API prefix | 2-3 letras | `nt`, `sp` |
| API port | 4080+ | `4085` |
| Project dir | `{name}-api` | `nutrition-api` |
| Test files | `test/{layer}/*_test.exs` | `test/integration/meals_test.exs` |
| SQL file | `init-{name}.sql` | `init-nutrition.sql` |

## ⚠️ Errores comunes

| Error | Causa | Solución |
|---|---|---|
| `API directory not found` | Dominio no inicializado | `zea domain init <name>` |
| `mix format` falla | Falta `.formatter.exs` | Re-scaffoldear con `--layer api` |
| `ConnCase not found` | Falta `Code.require_file` en test_helper | Agregar require_file al test_helper.exs |
| `pipeline` no definido en router | Se usó `pipeline :auth` (Phoenix) en Plug.Router | Usar plugs inline |
| Compile warnings | Unused aliases en router | Normal en scaffold, no bloquea |

## 🔄 Flujo de trabajo del agente

1. Recibe request del usuario ("crear dominio X")
2. Si hay spec → `zea domain init X --spec spec.md --design-spec design.md --yes`
3. `zea domain scaffold X --layer tests` (TDD: RED)
4. `zea domain scaffold X --layer api`
5. `zea domain scaffold X --layer db`
6. `cd X-api && mix deps.get`
7. `zea domain pipeline X --from compile --to test` (debe mostrar RED)
8. Implementar handlers en el controller para pasar tests (GREEN)
9. `zea domain pipeline X` (todo verde)
10. Commit + push
