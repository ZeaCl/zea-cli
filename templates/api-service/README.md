# API Service Template — Generar una API Phoenix/Elixir para un dominio nuevo

## Descripción
Este template genera una API service completa (como venture-api) para un dominio nuevo de ZEA Platform. El builder-expert usa este template para crear el código de la API.

## Placeholders (el builder-expert los reemplaza)

| Placeholder | Descripción | Ejemplo (psycho) | Ejemplo (sports) |
|---|---|---|---|
| `{{APP_NAME}}` | Nombre del proyecto Mix (snake_case) | `psycho_api` | `sports_api` |
| `{{APP_MODULE}}` | Nombre del módulo Elixir (PascalCase) | `PsychoApi` | `SportsApi` |
| `{{API_PREFIX}}` | Prefijo de las rutas HTTP | `pp` | `sp` |
| `{{API_PORT}}` | Puerto del servicio | `4083` | `4084` |
| `{{DOMAIN_NAME}}` | Nombre del dominio | `psycho` | `sports` |
| `{{DOMAIN_LABEL}}` | Etiqueta legible | `Psicopedagogía` | `Deportes` |
| `{{DB_NAME}}` | Nombre de la base de datos | `psycho_prod` | `sports_prod` |
| `{{ENTITIES}}` | Lista de entidades (separadas por coma) | `patients,sessions,evaluations` | `teams,players,matches` |

## Estructura de archivos generados

```
{{APP_NAME}}/
├── mix.exs                          ← Elixir project definition
├── Dockerfile                       ← Multi-stage Docker build
├── config/
│   └── config.exs                   ← DB connection + app config
├── lib/
│   ├── {{app_name}}/
│   │   └── application.ex           ← OTP Application
│   ├── {{app_name}}_web/
│   │   ├── endpoint.ex              ← Phoenix Endpoint
│   │   ├── router.ex                ← Routes con scope "/{{api_prefix}}"
│   │   └── controllers/
│   │       └── {{api_prefix}}_controller.ex  ← CRUD handlers
│   └── {{app_name}}/
│       ├── repo.ex                  ← Ecto Repo
│       └── release.ex               ← Release tasks (migrate, rollback)
├── init-{{name}}.sql                ← Schema SQL con RLS
└── priv/
    └── repo/
        └── migrations/
```

## Cómo usarlo el builder-expert

1. Leer este README + manifest.json
2. Tomar las entidades del Open Spec (Requirements fase)
3. Reemplazar placeholders con los valores del dominio
4. Generar cada archivo en el filesystem
5. Ejecutar `mix compile` para verificar
6. Agregar docker-compose entry + Caddy route
7. Commit + push

## Patrones que DEBE seguir el código generado

### Controller ({{api_prefix}}_controller.ex)

```elixir
defmodule {{APP_MODULE}}Web.{{API_PREFIX}}Controller do
  use {{APP_MODULE}}Web, :controller

  # GET /{{api_prefix}}/{{entity}}
  def list_{{entity}}(conn, _opts) do
    case GP.List{{Entity}}.execute(gp_ctx(conn)) do
      {:ok, items} -> json(conn, 200, items)
      {:error, _} -> json(conn, 500, %{error: "internal_error"})
    end
  end

  # POST /{{api_prefix}}/{{entity}}
  def create_{{entity}}(conn, _opts) do
    case GP.Create{{Entity}}.execute(gp_ctx(conn), conn.body_params) do
      {:ok, item} -> json(conn, 201, item)
      {:error, _} -> json(conn, 500, %{error: "internal_error"})
    end
  end
end

defp gp_ctx(conn) do
  %{
    org_id: conn.assigns.org_id,
    role: Map.get(conn.assigns, :role),
    entity_id: Map.get(conn.assigns, :entity_id)
  }
end
```

### Router

```elixir
scope "/{{api_prefix}}", {{APP_MODULE}}Web do
  pipe_through [:api, :auth, :scoping, :rate_limit]
  
  # Auto-generated from Open Spec entities
  {{#each entities}}
  get "/{{entity}}", {{API_PREFIX}}Controller, :list_{{entity}}
  post "/{{entity}}", {{API_PREFIX}}Controller, :create_{{entity}}
  get "/{{entity}}/:id", {{API_PREFIX}}Controller, :show_{{entity}}
  put "/{{entity}}/:id", {{API_PREFIX}}Controller, :update_{{entity}}
  {{/each}}
end
```

### Dockerfile

```dockerfile
FROM elixir:1.19-alpine AS deps
WORKDIR /app
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
COPY config ./config
COPY lib ./lib
RUN mix compile
RUN mix release

FROM alpine:3.21
RUN apk add --no-cache ncurses-libs openssl libstdc++ bash
WORKDIR /app
COPY --from=deps /app/_build/prod/rel/{{app_name}} ./
EXPOSE {{api_port}}
CMD ["bin/{{app_name}}", "start"]
```

### docker-compose entry

```yaml
  {{name}}-api:
    build:
      context: ../{{app_name}}
      dockerfile: Dockerfile
      target: runtime
    container_name: zea_{{name}}_api
    ports:
      - "{{api_port}}:{{api_port}}"
    depends_on:
      - postgres
    environment:
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: {{db_name}}
      DB_USER: app_user
      DB_PASSWORD: app_password
      PORT: {{api_port}}
      MIX_ENV: prod
      SECRET_KEY_BASE: "dev_secret_for_{{name}}_minimum_64_chars_ok!!"
      PHX_HOST: {{name}}.zea.localhost
      THALAMUS_JWKS_URL: "http://thalamus:4000/.well-known/jwks.json"
    networks:
      - zea_network_local
    restart: unless-stopped
```

### Caddy route

```
http://{{name}}.zea.localhost {
    reverse_proxy {{name}}-api:{{api_port}}
}
```

### init-{{name}}.sql (schema SQL)

Generado por el db-expert desde las entidades del Open Spec. Debe incluir:
- CREATE TABLE para cada entidad
- ENABLE ROW LEVEL SECURITY + policy para cada tabla
- Tipos correctos: UUID para IDs, BIGINT para montos, VARCHAR para textos cortos
- Timestamps estándar: created_at, updated_at
- Índices en campos frecuentemente consultados
