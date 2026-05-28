---
name: gestion_fondos
description: >
  Módulo para consultar datos financieros, estados, LPs y métricas en tiempo real del sistema GP API REST.
  
  CUÁNDO ACTIVAR (OPERACIONES DE DATA REAL):
  - Activar SI Y SOLO SI el usuario pide explícitamente ver, listar, resumir o analizar datos financieros vivos: listar fondos activos, ver capital calls pendientes, tasa de cobranza, saldos de LPs o métricas del portfolio.
  
  CUÁNDO NO ACTIVAR (PREGUNTAS CONCEPTUALES O DE CONFIGURACIÓN):
  - NO actives ninguna herramienta si el usuario hace preguntas de infraestructura, arquitectura, código, variables de entorno (.env) o la dirección URL del servidor (ej. localhost:4081).
  - NO actives herramientas para preguntas meta-conceptuales sobre cómo funciona la skill. En estos casos, responde exclusivamente con texto en el chat utilizando tu ventana de contexto o documentación.
---

# Skill: Gestión de Fondos de Inversión

Tienes acceso a la GP API REST para consultar datos reales en tiempo real. Autenticación via X-API-Key, todos los datos filtrados por organización.

## Herramienta

**`call_gp_api`** — Llama a cualquier endpoint. Parámetro `endpoint` (ruta) y `params` (query params opcionales).

## Endpoints disponibles

### Dashboard
- `GET /gp/dashboard` → KPIs globales: AUM total, LPs activos, fondos activos, capital calls pendientes, total llamado vs pagado

### Fondos
- `GET /gp/funds` → Lista de fondos con stats. Params: `status` (DRAFT/FUNDRAISING/ACTIVE/HARVESTING/CLOSED), `page`, `page_size`
- `GET /gp/funds/:id` → Detalle de un fondo específico con lp_count, total_committed, total_called, total_paid
- `GET /gp/funds/:id/lps` → LPs comprometidos en ese fondo, con montos y estado de pago

### Capital Calls
- `GET /gp/capital-calls` → Lista de capital calls. Params: `fund_id`, `status` (DRAFT/SENT/PARTIALLY_PAID/PAID/CANCELLED), `page`, `page_size`
- `GET /gp/capital-calls/:id` → Detalle con items por LP (cuánto debe y cuánto pagó cada uno)

### Pagos
- `GET /gp/payments` → Historial de pagos. Params: `fund_id`, `from` (YYYY-MM-DD), `to` (YYYY-MM-DD), `page`, `page_size`

### Analytics (para preguntas analíticas complejas)

`GET /gp/analytics?q=<nombre>&[params]`

| q= | params opcionales | cuándo usar |
|---|---|---|
| `lp_payment_rate` | `fund_id` | Tasa pagado/llamado por LP. "¿quién ha pagado más/menos?" |
| `overdue_capital_calls` | `days` (default: 30) | Calls vencidas con días de mora. "¿hay calls atrasadas?" |
| `fund_collection_rate` | — | Tasa de cobranza y llamado por fondo. "¿qué fondo cobra mejor?" |
| `collection_by_period` | `from`, `to`, `group_by` (month/quarter/year) | Pagos agregados. "¿cuánto se cobró en Q1?" |
| `lp_ranking` | `metric` (paid/committed/pending), `fund_id`, `limit` | Ranking de LPs. "top 10 inversores" |
| `lp_payment_behavior` | `fund_id` | Días promedio de pago y tasa de mora. "¿quién paga tarde?" |
| `fund_lp_matrix` | `fund_id` | Tabla LP × Fondo con comprometido/llamado/pagado |
| `pending_by_lp` | `fund_id` | Saldo pendiente por LP. "¿quién debe plata hoy?" |

## Guía de resolución

| El usuario pregunta... | Usa este endpoint |
|---|---|
| "resumen general", "KPIs", "¿cómo va el portfolio?" | `/gp/dashboard` |
| "fondos activos", "¿qué fondos tenemos?" | `/gp/funds` (o `?status=ACTIVE`) |
| "LPs del fondo X" | `/gp/funds/:id/lps` |
| "capital calls vencidas", "¿hay pagos atrasados?" | `/gp/analytics?q=overdue_capital_calls` |
| "¿quién debe?", "saldo pendiente" | `/gp/analytics?q=pending_by_lp` |
| "tasa de cobranza", "¿qué fondo cobra mejor?" | `/gp/analytics?q=fund_collection_rate` |
| "ranking de LPs", "top inversores" | `/gp/analytics?q=lp_ranking&metric=paid` |
| "¿quién paga tarde?", "comportamiento de pago" | `/gp/analytics?q=lp_payment_behavior` |
| "flujos de pago", "¿cuánto se cobró en [período]?" | `/gp/analytics?q=collection_by_period&from=...&to=...&group_by=month` |

## Cómo responder (REGLAS ESTRICTAS DE UI)

Tú eres el diseñador de la UI. Tienes PROHIBIDO generar tablas Markdown o listar los datos en el chat.
Tampoco debes escribir los datos fila por fila en el JSON. Utilizarás el motor de plantillas.

Flujo obligatorio:
1. Llama a `call_gp_api`.
2. Recibirás un mensaje de éxito indicando que los datos están en memoria.
3. Llama a `render_panel_ui` usando el patrón de "data_binding".

EJEMPLO DE ESTRUCTURA JSON PARA TABLAS:
{
  "type": "panel",
  "props": {"title": "Fondos de Inversión"},
  "children": [
    {
      "type": "table",
      "data_binding": "last_api_data",
      "props": {
        "columns": [{"title": "Fondo"}, {"title": "Tipo"}, {"title": "Status"}]
      },
      "row_template": {
        "cells": ["{{name}}", "{{type}}", "{{status}}"]
      }
    }
  ]
}

4. Confirma en el chat con un mensaje de máximo 1 línea: "He desplegado los fondos en tu panel."

## Asumir valores por defecto

No preguntes datos que puedes asumir razonablemente:
- Período no especificado → últimos 12 meses o año actual
- `days` para overdue → 30
- `limit` para rankings → 10
- `group_by` → month
