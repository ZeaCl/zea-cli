---
domain: venture
description: "Gestión de Capital Calls + Creación de Fondos para Südlich Ventures"
name: "capital-call"
tools:
  list_capital_calls:
    description: "Listar todos los capital calls registrados en el sistema"
    command: 'wget -qO- --header="Authorization: Bearer $ZEA_TOKEN" http://venture-api:4081/gp/capital-calls'
    parameters: {}
  show_capital_call:
    description: "Ver detalle de un capital call por su ID"
    command: 'wget -qO- --header="Authorization: Bearer $ZEA_TOKEN" http://venture-api:4081/gp/capital-calls/{call_id}'
    parameters:
      call_id:
        type: "string"
        description: "ID del capital call"
  send_capital_call:
    description: "Enviar un capital call a los LPs. Pedir confirmación antes de usar."
    command: 'wget -qO- --post-data= --header="Authorization: Bearer $ZEA_TOKEN" --header="Content-Type: application/json" http://venture-api:4081/gp/capital-calls/{call_id}/send'
    parameters:
      call_id:
        type: "string"
        description: "ID del capital call a enviar"
  create_fund:
    description: "Crear un nuevo fondo de inversión via Cerebelum workflow. El workflow valida, crea, configura fees, y transiciona el fondo a FUNDRAISING automáticamente."
    command: 'wget -qO- --header="Authorization: Bearer $ZEA_TOKEN" --header="Content-Type: application/json" --post-data="{\"workflow_module\":\"FundCreateWorkflow\",\"inputs\":{\"name\":\"{fund_name}\",\"type\":\"{fund_type}\",\"hard_cap\":{hard_cap},\"currency\":\"{currency}\",\"jwt\":\"$ZEA_TOKEN\"}}" http://cerebelum:4005/api/v1/executions'
    parameters:
      fund_name:
        type: "string"
        description: "Nombre del fondo (ej: Sudlich Tech Fund V)"
      fund_type:
        type: "string"
        description: "Tipo de fondo: VENTURE_CAPITAL, PRIVATE_EQUITY, REAL_ESTATE, GROWTH_EQUITY"
      hard_cap:
        type: "number"
        description: "Hard cap en dólares (ej: 50000000)"
      currency:
        type: "string"
        description: "Moneda (USD, CLP, EUR)"
---

# Capital Call Management

Tools disponibles:
- list_capital_calls: Lista todos los capital calls
- show_capital_call: Ver detalle por ID
- send_capital_call: Enviar a LPs (pedir confirmación antes)
- create_fund: Crear un nuevo fondo via Cerebelum workflow
