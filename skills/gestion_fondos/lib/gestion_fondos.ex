defmodule Skills.GestionFondos do
  @moduledoc """
  Skill para gestión de fondos de inversión via GP API REST.

  Provee la tool `call_gp_api` que el agente usa para consultar
  fondos, LPs, capital calls, pagos y analytics en tiempo real.
  """

  use ReactAgent.Skills.Skill
  require AgentUI

  @impl true
  def execute("call_gp_api", %{"endpoint" => endpoint} = args) do
    validate_config()

    config = config()
    api_url = Map.get(config, "api_url") || "http://localhost:4081"
    api_key = Map.get(config, "api_key")

    cond do
      is_nil(api_key) or String.starts_with?(to_string(api_key), "${") ->
        """
        Error: GP_API_KEY no está configurada.

        Para solucionarlo:
        1. Solicitá tu API key al equipo de venture-gp-api
        2. Agregala al archivo .env del proyecto:
           GP_API_KEY=sk_live_tu_api_key_aqui

        3. Reiniciá la aplicación: iex -S mix
        """

      not String.starts_with?(endpoint, "/") ->
        "Error: el endpoint debe comenzar con / (ej: /gp/funds)"

      true ->
        params = Map.get(args, "params") || %{}
        url = build_url(api_url, endpoint, params)
        call_api(url, endpoint, api_key)
    end
  end

  @doc """
  Valida que la configuración esté completa al cargar la skill.
  """
  def validate_config do
    config = config()
    api_key = Map.get(config, "api_key")
    api_url = Map.get(config, "api_url")

    missing = []
    missing = if is_nil(api_key) or String.starts_with?(to_string(api_key), "${"), do: ["GP_API_KEY" | missing], else: missing
    missing = if is_nil(api_url) or String.starts_with?(to_string(api_url), "${"), do: ["GP_API_URL" | missing], else: missing

    if Enum.empty?(missing) do
      :ok
    else
      vars = Enum.join(missing, ", ")
      IO.puts("\n[Skill: gestion_fondos] ⚠️  Faltan variables de entorno: #{vars}")
      IO.puts("Para solucionarlo, agregá al archivo .env:")
      Enum.each(missing, fn var ->
        IO.puts("  #{var}=tu_valor_aqui")
      end)
      IO.puts("Y reiniciá la aplicación con: iex -S mix\n")
      {:warning, missing}
    end
  end

  @doc """
  Registro de actions de panel que esta skill maneja.
  """
  def panel_actions do
    %{
      "gp_list_funds" => {"call_gp_api", %{endpoint: "/gp/funds"}},
      "gp_fund_detail" => {"call_gp_api", fn item_id, _, _, _ ->
        %{endpoint: "/gp/funds/#{item_id}"} end},
      "gp_fund_lps" => {"call_gp_api", fn item_id, _, _, _ ->
        %{endpoint: "/gp/funds/#{item_id}/lps"} end},
      "gp_pending_calls" => {"call_gp_api", %{endpoint: "/gp/capital-calls"}},
      "gp_capital_call_detail" => {"call_gp_api", fn item_id, _, _, _ ->
        %{endpoint: "/gp/capital-calls/#{item_id}"} end},
      "gp_list_payments" => {"call_gp_api", %{endpoint: "/gp/payments"}},
      "gp_dashboard" => {"call_gp_api", %{endpoint: "/gp/dashboard"}},
      "gp_analytics" => {"call_gp_api", fn _, _, panel_state, _ ->
        query = Map.get(panel_state, :analytics_query, "fund_collection_rate")
        %{endpoint: "/gp/analytics?q=#{query}"} end}
    }
  end

  # ── Private ───────────────────────────────────────────────────────────────────

  defp call_api(url, _endpoint, api_key) do
    headers = [{"x-api-key", api_key}]

    headers = if org_id = Process.get(:organization_id) do
      [{"x-organization-id", org_id} | headers]
    else
      headers
    end

    case Req.get(url, headers: headers, receive_timeout: 15_000) do
      {:ok, %Req.Response{status: status, body: body}} when status in 200..299 ->
        # Retornamos directamente lo que procesa el formateador de datos
        store_api_data_and_report(body)

      {:ok, %Req.Response{status: 400, body: body}} ->
        "Error de solicitud (400): #{format_body(body)}"

      {:ok, %Req.Response{status: 401}} ->
        "Error de autenticación (401): GP_API_KEY inválida o revocada."

      {:ok, %Req.Response{status: 404}} ->
        "No encontrado (404): el recurso solicitado no existe en la API."

      {:ok, %Req.Response{status: 429}} ->
        "Rate limit excedido (429): demasiadas solicitudes. Intenta en un momento."

      {:ok, %Req.Response{status: status, body: body}} ->
        "Error HTTP #{status}: #{format_body(body)}"

      {:error, %Req.TransportError{reason: :econnrefused}} ->
        "Error de conexión: la GP API no está disponible. ¿Está corriendo en #{url}?"

      {:error, reason} ->
        "Error de conexión: #{inspect(reason)}"
    end
  end

  defp build_url(base, endpoint, params) when map_size(params) == 0 do
    String.trim_trailing(base, "/") <> endpoint
  end

  defp build_url(base, endpoint, params) do
    query =
      params
      |> Enum.map(fn {k, v} -> "#{k}=#{URI.encode_www_form(to_string(v))}" end)
      |> Enum.join("&")

    String.trim_trailing(base, "/") <> endpoint <> "?" <> query
  end

  defp format_body(body) when is_map(body) or is_list(body) do
    Jason.encode!(body, pretty: true)
  end

  defp format_body(body) when is_binary(body) do
    case Jason.decode(body) do
      {:ok, parsed} -> Jason.encode!(parsed, pretty: true)
      {:error, _} -> body
    end
  end

  defp format_body(body), do: inspect(body)

  defp store_api_data_and_report(body) do
    items = case body do
      %{"items" => items} -> items
      _ when is_list(body) -> body
      _ -> [body]
    end

    # Cumplimiento MVI de 2 Fases síncronas (v0.0.5):
    # Retornamos la lista de elementos puros. El ActionRunner interceptará esta tupla
    # y la inyectará en el data_store del GenServer Session de forma atómica.
    {:ok, items}
  end

  @impl true
  def render_dashboard do
    AgentUI.Element.new(:panel, route: "panel")
  end
end
