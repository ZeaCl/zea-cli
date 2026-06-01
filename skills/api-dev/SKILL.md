---
name: api-dev
description: "Desarrollo de API ZEA Platform. Controllers, routers, handlers, use cases. Usar cuando se necesita crear/modificar endpoints HTTP en venture-gp-api."
---

# API Dev — API Development Context

## Propósito

Skill de desarrollo exclusivo para la API Venture de ZEA Platform. El agente que use este skill solo debe trabajar con código Elixir (controllers, routers), nunca con SQL.

## Contexto

- **API**: `venture-gp-api` (Phoenix/Elixir)
- **Controller**: `lib/venture_gp_api_web/controllers/gp_controller.ex`
- **Router**: `lib/venture_gp_api_web/router.ex`
- **Base URL**: `https://venture.zea.cl`

## Reglas

1. **SIEMPRE usar `zea venture api add-endpoint`** — no editar archivos manualmente
2. **NUNCA tocar SQL ni la DB directamente**
3. **SIEMPRE seguir el patrón del controller existente** — usar `gp_ctx(conn)` para org_id
4. **SIEMPRE devolver errores con `{:error, _} -> json(conn, 500, %{error: "internal_error"})`**
5. **NUNCA exponer errores internos** — mensajes genéricos

## Template de handler GET (lista)

```elixir
def list_{entity}(conn, _opts) do
  case GP.List{Entity}.execute(gp_ctx(conn)) do
    {:ok, items} -> json(conn, 200, items)
    {:error, _} -> json(conn, 500, %{error: "internal_error"})
  end
end
```

## Template de handler POST (crear)

```elixir
def create_{entity}(conn, _opts) do
  case GP.Create{Entity}.execute(gp_ctx(conn), conn.body_params) do
    {:ok, item} -> json(conn, 201, item)
    {:error, _} -> json(conn, 500, %{error: "internal_error"})
  end
end
```

## Comandos

```bash
zea venture api add-endpoint   # Crear nuevo endpoint
zea venture api list-endpoints # Listar endpoints existentes
zea api session                # Iniciar sesión de desarrollo API
```
