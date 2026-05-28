defmodule Skills.GestionFondos.Components.FundDetail do
  @moduledoc """
  Componente FundDetail para mostrar detalles de un fondo.

  Retorna primitivos de AgentUI en lugar de un tipo custom :fund_detail.
  """

  alias AgentUI.Element

  def name, do: :fund_detail

  def build(props) do
    fund_id = props[:fund_id] || ""

    %Element{
      type: :card,
      props: [],
      children: [
        %Element{
          type: :text,
          props: [content: "Detalle del Fondo", size: "lg", weight: "bold"],
          children: []
        },
        %Element{
          type: :text,
          props: [content: "ID: #{fund_id}", size: "md", color: "muted"],
          children: []
        }
      ]
    }
  end
end
