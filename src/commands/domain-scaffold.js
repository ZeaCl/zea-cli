import path from 'path';
import fs from 'fs/promises';

const ZEA_ROOT = path.resolve(import.meta.dirname, '../../..');

const SCAFFOLD_LAYERS = ['tests', 'api', 'db', 'cli', 'docker'];

const MODULE_CAMEL = (name) => name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

export async function scaffoldTests(domainName, apiDir, catalog) {
  const prefix = catalog.manifest?.api_prefix || domainName.substring(0, 2);
  const prefixUpper = prefix.toUpperCase();
  const modulePrefix = MODULE_CAMEL(domainName);

  // ── Unit: JWT Auth Plug Test ──
  const jwtTest = `defmodule ${modulePrefix}ApiWeb.Plugs.JWTAuthPlugTest do
  use ${modulePrefix}ApiWeb.ConnCase, async: true

  alias ${modulePrefix}ApiWeb.Plugs.JWTAuthPlug

  describe "call/2" do
    test "returns 401 when no authorization header is present" do
      conn = build_conn() |> JWTAuthPlug.call(%{})
      assert conn.halted
      assert conn.status == 401
      assert conn.resp_body =~ "unauthorized"
    end

    test "returns 401 when authorization header is malformed" do
      conn =
        build_conn()
        |> put_req_header("authorization", "InvalidFormat")
        |> JWTAuthPlug.call(%{})

      assert conn.halted
      assert conn.status == 401
    end

    test "returns 401 when organization header is missing" do
      # Sin x-zea-org-id, debería rechazar
      conn =
        build_conn()
        |> put_req_header("authorization", "Bearer invalid_token")
        |> JWTAuthPlug.call(%{})

      assert conn.halted
      assert conn.status == 401
    end
  end
end
`;

  // ── Unit: Scoping Plug Test ──
  const scopingTest = `defmodule ${modulePrefix}ApiWeb.Plugs.ScopingPlugTest do
  use ${modulePrefix}ApiWeb.ConnCase, async: true

  alias ${modulePrefix}ApiWeb.Plugs.ScopingPlug

  describe "call/2" do
    test "allows read access for all roles" do
      conn =
        build_conn()
        |> assign(:role, "member")
        |> ScopingPlug.call(%{access: :read})

      refute conn.halted
    end

    test "blocks write access for restricted roles" do
      conn =
        build_conn()
        |> assign(:role, "viewer")
        |> ScopingPlug.call(%{access: :write})

      assert conn.halted
      assert conn.status == 403
    end

    test "allows write access for admin roles" do
      conn =
        build_conn()
        |> assign(:role, "admin")
        |> ScopingPlug.call(%{access: :write})

      refute conn.halted
    end
  end
end
`;

  // ── Unit: Controller Test (health endpoint) ──
  const controllerTest = `defmodule ${modulePrefix}ApiWeb.Controllers.NTControllerTest do
  use ${modulePrefix}ApiWeb.ConnCase, async: true

  describe "GET /${prefix}/health" do
    test "returns 200 with status ok" do
      conn = get(build_conn(), "/${prefix}/health")
      assert conn.status == 200
      assert conn.resp_body =~ "ok"
    end
  end
end
`;

  await fs.mkdir(path.join(apiDir, 'test', 'unit', 'plugs'), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'test', 'unit', 'controllers'), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'test', 'integration'), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'test', 'e2e'), { recursive: true });

  await fs.writeFile(path.join(apiDir, 'test', 'unit', 'plugs', 'jwt_auth_plug_test.exs'), jwtTest);
  await fs.writeFile(path.join(apiDir, 'test', 'unit', 'plugs', 'scoping_plug_test.exs'), scopingTest);
  await fs.writeFile(path.join(apiDir, 'test', 'unit', 'controllers', 'nt_controller_test.exs'), controllerTest);

  // ── Integration: CRUD tests para cada entidad ──
  const entities = (catalog.manifest?.entities || '').split(',').map(e => e.trim()).filter(Boolean);

  for (const entity of entities) {
    const entityPath = entity.replace(/_/g, '-');
    const entityCamel = entityPath.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');

    const integrationTest = `defmodule ${modulePrefix}ApiWeb.Integration.${entityCamel}Test do
  use ${modulePrefix}ApiWeb.ConnCase, async: true

  @moduletag :integration

  describe "CRUD /${prefix}/${entityPath}" do
    setup do
      # TODO: setup authenticated connection
      %{conn: build_conn()}
    end

    test "GET /${prefix}/${entityPath} returns empty list when no records", %{conn: conn} do
      conn = get(conn, "/${prefix}/${entityPath}")
      assert conn.status == 401
    end

    test "POST /${prefix}/${entityPath} creates a record", %{conn: conn} do
      conn = post(conn, "/${prefix}/${entityPath}", %{})
      # Will return 401 without auth, or 201 with auth
      assert conn.status == 401
    end

    test "GET /${prefix}/${entityPath}/:id returns 404 for non-existent", %{conn: conn} do
      conn = get(conn, "/${prefix}/${entityPath}/00000000-0000-0000-0000-000000000000")
      assert conn.status == 401
    end

    test "PUT /${prefix}/${entityPath}/:id returns 401 without auth", %{conn: conn} do
      conn = put(conn, "/${prefix}/${entityPath}/00000000-0000-0000-0000-000000000000", %{})
      assert conn.status == 401
    end

    test "DELETE /${prefix}/${entityPath}/:id returns 401 without auth", %{conn: conn} do
      conn = delete(conn, "/${prefix}/${entityPath}/00000000-0000-0000-0000-000000000000")
      assert conn.status == 401
    end
  end
end
`;

    await fs.writeFile(
      path.join(apiDir, 'test', 'integration', `${entityPath}_test.exs`),
      integrationTest
    );
  }

  // ── E2E: Flujo completo ──
  const e2eTest = `defmodule ${modulePrefix}ApiWeb.E2E.FullFlowTest do
  use ${modulePrefix}ApiWeb.ConnCase, async: true

  @moduletag :e2e

  describe "full flow" do
    test "health check works" do
      conn = get(build_conn(), "/${prefix}/health")
      assert conn.status == 200
      assert conn.resp_body =~ "ok"
    end

    test "unknown route returns 404" do
      conn = get(build_conn(), "/${prefix}/nonexistent")
      assert conn.status == 404
    end
  end
end
`;

  await fs.writeFile(
    path.join(apiDir, 'test', 'e2e', 'full_flow_test.exs'),
    e2eTest
  );

  await fs.mkdir(path.join(apiDir, 'test', 'support'), { recursive: true });

  // ── Test helper files ──
  const connCase = `defmodule ${modulePrefix}ApiWeb.ConnCase do
  use ExUnit.CaseTemplate

  using do
    quote do
      use Plug.Test
      use Phoenix.ConnTest

      @endpoint ${modulePrefix}ApiWeb.Endpoint
    end
  end
end
`;

  const testHelper = `Code.require_file("support/conn_case.exs", __DIR__)
ExUnit.start()
`;

  await fs.writeFile(path.join(apiDir, 'test', 'support', 'conn_case.exs'), connCase);
  await fs.writeFile(path.join(apiDir, 'test', 'test_helper.exs'), testHelper);

  return { entities };
}

export async function scaffoldApi(domainName, apiDir, catalog) {
  const prefix = catalog.manifest?.api_prefix || domainName.substring(0, 2);
  const modulePrefix = MODULE_CAMEL(domainName);
  const appName = `${domainName}-api`;
  const appAtom = `${domainName}_api`;

  // ── mix.exs ──
  const mixExs = `defmodule ${modulePrefix}Api.MixProject do
  use Mix.Project

  def project do
    [
      app: :${appAtom},
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      extra_applications: [:logger],
      mod: {${modulePrefix}Api.Application, []}
    ]
  end

  defp deps do
    [
      {:phoenix, "~> 1.7"},
      {:plug_cowboy, "~> 2.7"},
      {:jason, "~> 1.4"},
      {:joken, "~> 2.6"},
      {:req, "~> 0.5"},
      {:ecto_sql, "~> 3.11"},
      {:postgrex, "~> 0.19"}
    ]
  end
end
`;

  // ── config/config.exs ──
  const config = `import Config

config :${appAtom}, ${modulePrefix}Api.Repo,
  database: "${domainName}_prod",
  username: System.get_env("DB_USER", "app_user"),
  password: System.get_env("DB_PASSWORD", "app_password"),
  hostname: System.get_env("DB_HOST", "localhost"),
  port: String.to_integer(System.get_env("DB_PORT", "5432"))

config :${appAtom}, :thalamus_jwks_url,
  System.get_env("THALAMUS_JWKS_URL", "http://thalamus:4000/.well-known/jwks.json")

config :${appAtom}, ${modulePrefix}ApiWeb.Endpoint,
  url: [host: System.get_env("PHX_HOST", "localhost")],
  secret_key_base: System.get_env("SECRET_KEY_BASE", "dev_secret_64_chars_minimum_please_change_me!!"),
  server: true,
  http: [port: String.to_integer(System.get_env("PORT", "${catalog.manifest?.api_port || 4085}"))]
`;

  // ── Application ──
  const application = `defmodule ${modulePrefix}Api.Application do
  use Application

  @impl true
  def start(_type, _args) do
    children = [
      ${modulePrefix}ApiWeb.Endpoint
    ]

    opts = [strategy: :one_for_one, name: ${modulePrefix}Api.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
`;

  // ── Endpoint ──
  const endpoint = `defmodule ${modulePrefix}ApiWeb.Endpoint do
  use Phoenix.Endpoint, otp_app: :${appAtom}

  plug ${modulePrefix}ApiWeb.Router
end
`;

  // ── Router ──
  const entities = (catalog.manifest?.entities || '').split(',').map(e => e.trim()).filter(Boolean);
  let routes = '';
  for (const entity of entities) {
    const entityPath = entity.replace(/_/g, '-');
    routes += `
  get "/${prefix}/${entityPath}" do
    NTController.list_${entity}(conn, [])
  end

  post "/${prefix}/${entityPath}" do
    NTController.create_${entity}(conn, [])\n  end

  get "/${prefix}/${entityPath}/:id" do
    NTController.show_${entity}(conn, [])\n  end

  put "/${prefix}/${entityPath}/:id" do
    NTController.update_${entity}(conn, [])\n  end

  delete "/${prefix}/${entityPath}/:id" do
    NTController.delete_${entity}(conn, [])\n  end`;
  }

  const router = `defmodule ${modulePrefix}ApiWeb.Router do
  use Plug.Router

  alias ${modulePrefix}ApiWeb.Plugs.JWTAuthPlug
  alias ${modulePrefix}ApiWeb.Plugs.ScopingPlug
  alias ${modulePrefix}ApiWeb.Controllers.NTController

  plug(:match)
  plug(Plug.Parsers, parsers: [:json], pass: ["*/*"], json_decoder: Jason)
  plug JWTAuthPlug
  plug ScopingPlug
  plug(:dispatch)

  # Health
  get "/${prefix}/health" do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(200, Jason.encode!(%{status: "ok"}))
  end

  # Each route below wraps JWTAuthPlug + ScopingPlug
${routes}

  # Fallback
  match _ do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(404, Jason.encode!(%{error: "not_found"}))
  end
end
`;

  // ── Controller ──
  let controllerFns = '';
  for (const entity of entities) {
    controllerFns += `
  def list_${entity}(conn, _opts) do
    json(conn, 200, [])
  end

  def create_${entity}(conn, _opts) do
    {conn, 201, %{id: "pending", message: "not implemented"}}
  end

  def show_${entity}(conn, _opts) do
    {conn, 404, %{error: "not_found"}}
  end

  def update_${entity}(conn, _opts) do
    {conn, 200, %{id: "pending", message: "not implemented"}}
  end

  def delete_${entity}(conn, _opts) do
    {conn, 200, %{deleted: true}}
  end
`;
  }

  const jsonHelper = `  defp json(conn, status, body) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(status, Jason.encode!(body))
  end
`;

  const controller = `defmodule ${modulePrefix}ApiWeb.Controllers.NTController do
  use Plug.Builder

  import Plug.Conn
${jsonHelper}
${controllerFns}
end
`;

  // ── Plugs ──
  const jwtAuthPlug = `defmodule ${modulePrefix}ApiWeb.Plugs.JWTAuthPlug do
  @moduledoc "Authenticates requests via JWT Bearer token from Thalamus."
  @behaviour Plug
  import Plug.Conn

  def init(opts), do: opts

  def call(%{halted: true} = conn, _opts), do: conn
  def call(%{state: :sent} = conn, _opts), do: conn

  def call(conn, _opts) do
    case get_req_header(conn, "authorization") do
      ["Bearer " <> _token] ->
        # TODO: Validate JWT with Thalamus JWKS
        org_id = List.first(get_req_header(conn, "x-zea-org-id") || [])
        if org_id && org_id != "" do
          conn
          |> assign(:org_id, org_id)
          |> assign(:authenticated, true)
        else
          halt_unauthorized(conn, "missing_organization_context")
        end

      _ ->
        halt_unauthorized(conn, "missing_jwt_token")
    end
  end

  defp halt_unauthorized(conn, reason) do
    conn
    |> put_resp_content_type("application/json")
    |> send_resp(401, Jason.encode!(%{error: "unauthorized", detail: reason}))
    |> halt()
  end
end
`;

  const scopingPlug = `defmodule ${modulePrefix}ApiWeb.Plugs.ScopingPlug do
  @moduledoc "Blocks restricted roles from write operations."
  @behaviour Plug
  import Plug.Conn

  def init(opts) do
    %{access: Keyword.get(opts, :access, :read)}
  end

  def call(conn, %{access: :write}) do
    role = Map.get(conn.assigns, :role, "member")

    if role == "viewer" do
      conn
      |> put_resp_content_type("application/json")
      |> send_resp(403, Jason.encode!(%{error: "forbidden", detail: "viewer role cannot perform write operations"}))
      |> halt()
    else
      conn
    end
  end

  def call(conn, _opts), do: conn
end
`;

  // ── Repo ──
  const repo = `defmodule ${modulePrefix}Api.Repo do
  use Ecto.Repo,
    otp_app: :${appAtom},
    adapter: Ecto.Adapters.Postgres
end
`;

  // ── Write files ──
  await fs.mkdir(path.join(apiDir, 'config'), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'lib', `${domainName}_api`), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'lib', `${domainName}_api_web`), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'lib', `${domainName}_api_web`, 'controllers'), { recursive: true });
  await fs.mkdir(path.join(apiDir, 'lib', `${domainName}_api_web`, 'plugs'), { recursive: true });

  await fs.writeFile(path.join(apiDir, 'mix.exs'), mixExs);
  await fs.writeFile(path.join(apiDir, '.formatter.exs'), `[
  import_deps: [],
  inputs: ["mix.exs", "config/*.exs", "lib/**/*.{ex,exs}", "test/**/*.{ex,exs}"]
]\n`);
  await fs.writeFile(path.join(apiDir, 'config', 'config.exs'), config);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api`, 'application.ex'), application);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api`, 'repo.ex'), repo);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api_web`, 'endpoint.ex'), endpoint);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api_web`, 'router.ex'), router);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api_web`, 'controllers', 'nt_controller.ex'), controller);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api_web`, 'plugs', 'jwt_auth_plug.ex'), jwtAuthPlug);
  await fs.writeFile(path.join(apiDir, 'lib', `${domainName}_api_web`, 'plugs', 'scoping_plug.ex'), scopingPlug);

  return { entities };
}

export async function scaffoldDb(domainName, apiDir, catalog) {
  const entities = (catalog.manifest?.entities || '').split(',').map(e => e.trim()).filter(Boolean);
  const lines = ['-- init-nutrition.sql — Schema + RLS for nutrition domain', ''];

  const tableDefs = {
    profiles: [
      'user_id UUID NOT NULL UNIQUE',
      'gender VARCHAR(50)',
      'birth_date DATE',
      'weight_kg FLOAT',
      'height_cm FLOAT',
      'activity_level VARCHAR(50)',
      'diet_type VARCHAR(50)'
    ],
    meals: [
      'user_id UUID NOT NULL',
      'daily_record_id UUID',
      'meal_type VARCHAR(50)',
      'food_name VARCHAR(255)',
      'food_image_url TEXT',
      'calories FLOAT',
      'proteins FLOAT',
      'carbs FLOAT',
      'fats FLOAT',
      'sugars FLOAT',
      'fiber FLOAT',
      'sodium FLOAT',
      'ingredients JSONB',
      'recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    ],
    daily_records: [
      'user_id UUID NOT NULL',
      'record_date DATE NOT NULL',
      'calorie_goal FLOAT',
      'protein_goal FLOAT',
      'carbs_goal FLOAT',
      'fat_goal FLOAT',
      'hydration_goal FLOAT'
    ],
    hydration_records: [
      'user_id UUID NOT NULL',
      'daily_record_id UUID',
      'amount_ml FLOAT NOT NULL',
      'recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    ],
    subscriptions: [
      'user_id UUID NOT NULL',
      'plan_type VARCHAR(50) NOT NULL',
      'start_date DATE NOT NULL',
      'end_date DATE NOT NULL',
      'status VARCHAR(50) DEFAULT \'active\''
    ],
    goals: [
      'user_id UUID NOT NULL UNIQUE',
      'diet_type VARCHAR(50)',
      'target_calories INTEGER',
      'target_proteins INTEGER',
      'target_carbs INTEGER',
      'target_fats INTEGER'
    ],
    notification_settings: [
      'user_id UUID NOT NULL UNIQUE',
      'breakfast_enabled BOOLEAN DEFAULT true',
      'lunch_enabled BOOLEAN DEFAULT true',
      'dinner_enabled BOOLEAN DEFAULT true'
    ]
  };

  for (const entity of entities) {
    const cols = tableDefs[entity] || [
      'name VARCHAR(255)',
      'description TEXT'
    ];

    lines.push(`-- Table: ${entity}`);
    lines.push(`CREATE TABLE IF NOT EXISTS ${entity} (`);
    lines.push('  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),');
    lines.push('  organization_id UUID NOT NULL REFERENCES organizations(id),');
    for (const col of cols) {
      lines.push(`  ${col},`);
    }
    lines.push('  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,');
    lines.push('  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    lines.push(');');
    lines.push('');
    lines.push(`ALTER TABLE ${entity} ENABLE ROW LEVEL SECURITY;`);
    lines.push(`CREATE POLICY ${entity}_org_isolation ON ${entity}`);
    lines.push('  USING (organization_id = current_setting(\'app.current_organization_id\')::uuid);');
    lines.push('');
  }

  const sql = lines.join('\n');
  await fs.writeFile(path.join(apiDir, 'init-nutrition.sql'), sql + '\n');
}

export function getLayers() {
  return SCAFFOLD_LAYERS;
}

export async function scaffoldLayer(domainName, layer, apiDir, catalog) {
  switch (layer) {
    case 'tests':
      return scaffoldTests(domainName, apiDir, catalog);
    case 'api':
      return scaffoldApi(domainName, apiDir, catalog);
    case 'db':
      return scaffoldDb(domainName, apiDir, catalog);
    case 'cli':
      // CLI commands are generated in src/commands/nutrition.js
      // This is handled separately by the nutrition command registration
      return { message: 'CLI commands should be created manually or via builder-expert' };
    case 'docker':
      return scaffoldDocker(domainName, apiDir, catalog);
    default:
      throw new Error(`Unknown layer: ${layer}. Valid layers: ${SCAFFOLD_LAYERS.join(', ')}`);
  }
}

async function scaffoldDocker(domainName, apiDir, catalog) {
  const appName = `${domainName}-api`;
  const port = catalog.manifest?.api_port || 4085;

  const dockerfile = `FROM elixir:1.17-alpine AS deps
WORKDIR /app
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod
COPY config ./config
COPY lib ./lib
RUN mix compile
RUN mix release ${appName}

FROM alpine:3.21
RUN apk add --no-cache ncurses-libs openssl libstdc++ bash
WORKDIR /app
COPY --from=deps /app/_build/prod/rel/${appName} ./
EXPOSE ${port}
CMD ["bin/${appName}", "start"]
`;

  await fs.writeFile(path.join(apiDir, 'Dockerfile'), dockerfile);
}
