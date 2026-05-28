defmodule Skills.GestionFondos.Components.FundsList do
  @moduledoc """
  Componente FundsList para renderizar lista de fondos.

  Retorna primitivos de AgentUI en lugar de un tipo custom :funds_list.
  """

  alias AgentUI.Element

  def name, do: :funds_list

  def build(props) do
    columns = props[:columns] || []
    items = props[:items] || []

    %Element{
      type: :column,
      props: [gap: 16],
      children: [
        %Element{
          type: :row,
          props: [justify: "space-between", align: "center"],
          children: [
            %Element{
              type: :text,
              props: [content: "Portafolio de Fondos", size: "lg", weight: "bold"],
              children: []
            },
            %Element{
              type: :badge,
              props: [text: "#{length(items)} fondos", variant: "info"],
              children: []
            }
          ]
        },
        %Element{
          type: :table,
          props: [columns: columns, items: items],
          children: []
        }
      ]
    }
  end
end
