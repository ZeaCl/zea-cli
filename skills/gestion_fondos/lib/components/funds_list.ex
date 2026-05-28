defmodule Skills.GestionFondos.Components do
  @moduledoc """
  Componentes de UI para la skill GestionFondos.
  """

  alias AgentUI.Element

  @doc """
  Lista de componentes que esta skill define.
  """
  def list_components, do: [:funds_list, :fund_detail]

  @doc """
  Construye el componente FundsList.
  """
  def funds_list(props) do
    data = decode_data(props["data"])

    columns = [
      %{key: "name", label: "Nombre"},
      %{key: "status", label: "Estado"},
      %{key: "committed_amount", label: "Monto Comprometido"},
      %{key: "funded_amount", label: "Monto Fondado"}
    ]

    %Element{
      type: :table,
      props: [
        columns: columns,
        items: data
      ],
      children: []
    }
  end

  @doc """
  Construye el componente FundDetail.
  """
  def fund_detail(props) do
    fund_id = props["fund_id"] || ""

    %Element{
      type: :card,
      props: [id: fund_id],
      children: []
    }
  end

  defp decode_data(nil), do: []
  defp decode_data(""), do: []

  defp decode_data(data) when is_binary(data) do
    case URI.decode_www_form(data) do
      {:ok, decoded} ->
        case Jason.decode(decoded) do
          {:ok, map} when is_map(map) -> Map.get(map, "items", [])
          {:ok, list} when is_list(list) -> list
          _ -> []
        end

      _ ->
        []
    end
  rescue
    _ -> []
  end

  defp decode_data(data) when is_map(data) do
    Map.get(data, "items", [])
  end

  defp decode_data(_), do: []
end
