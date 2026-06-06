---
name: synapse
description: >
  Integración de Synapse — mensajería en tiempo real de ZEA Platform.
  Usar este skill siempre que el usuario mencione: "chat", "mensajería", "conversaciones",
  "real-time", "websocket de chat", "integrar Synapse", "SDK de Synapse", "@menciones",
  "typing indicators", o quiera agregar comunicación en tiempo real a cualquier app
  (React, Phoenix, Vite, Node). También cuando necesite diagnosticar conectividad con
  Synapse o crear canales entre usuarios y agentes de IA. Aunque el usuario no diga
  "Synapse" explícitamente, si habla de agregar funcionalidad de chat o mensajería en
  tiempo real, usá este skill.
---

# Synapse — Mensajería en Tiempo Real

Synapse es el backend de chat de ZEA Platform. Provee API REST (conversaciones, mensajes) y WebSocket (tiempo real, typing indicators, @menciones que resuelven contra Thalamus y forwardean a Glia si el mencionado es un agente IA).

## Decisiones rápidas

| El usuario quiere... | Hacé esto |
|---|---|
| Agregar chat a una app React/Vite | `npm install github:zeacl/synapse-js` + `useConversation` hook |
| Agregar chat a una app Phoenix | `{:synapse_client, github: "zeacl/synapse_client"}` + GenServer |
| Ver si Synapse está vivo | Ejecutá `scripts/synapse doctor` |
| Probar conectividad con JWT | Ejecutá `scripts/synapse test --token <JWT>` |
| Ver variables de entorno necesarias | Ejecutá `scripts/synapse env` |
| Saber todos los endpoints | Leé `references/api-reference.md` |

## Instalación del SDK

### React / Vite / TypeScript

```bash
npm install github:zeacl/synapse-js
```

```ts
import { SynapseClient, useConversation } from '@zea.cl/synapse-js'

const synapse = new SynapseClient({
  token: jwtFromThalamus,  // string o () => Promise<string> para refresh
  baseUrl: import.meta.env.VITE_SYNAPSE_URL || 'http://localhost:4003',
})

// REST
const convs = await synapse.conversations.list()
const conv = await synapse.conversations.create({
  type: 'dm', participantIds: ['user_carlos'],
})

// Real-time + React
function ChatRoom({ convId }: { convId: string }) {
  const { messages, send, typing, typingUsers, loadMore, hasMore, loading } =
    useConversation(synapse, convId)

  if (loading) return <Loading />
  return (
    <div>
      {hasMore && <button onClick={loadMore}>Cargar más</button>}
      {messages.map(m => <Bubble key={m.id} msg={m} />)}
      {typingUsers.length > 0 && <TypingIndicator />}
      <Input onSend={send} onType={typing} />
    </div>
  )
}
```

### Phoenix / Elixir

```elixir
# mix.exs
{:synapse_client, github: "zeacl/synapse_client"}
```

```elixir
# En tu Application.start/2 o supervision tree:
{SynapseClient,
 name: MiApp.SynapseClient,
 token: fn -> obtener_jwt() end,
 base_url: "http://localhost:4003"}

# REST
{:ok, convs} = SynapseClient.list_conversations(MiApp.SynapseClient)
{:ok, conv} = SynapseClient.create_conversation(MiApp.SynapseClient,
  type: :dm, participant_ids: ["user_carlos"])

# Real-time
SynapseClient.subscribe(MiApp.SynapseClient, conv_id)
SynapseClient.send_message(MiApp.SynapseClient, conv_id, "hola @carlos")

receive do
  {:new_message, msg} -> IO.puts("#{msg.sender_id}: #{msg.content}")
end
```

## @Menciones y agentes IA

Cuando un mensaje contiene `@username`, Synapse automáticamente:
1. Extrae los usernames con regex
2. Resuelve cada uno contra Thalamus (`GET /api/users?username=...`)
3. Si `is_agent: true` → forwardea el mensaje a Glia por WebSocket
4. Agrega al mencionado como participante de la conversación

El cliente **no** necesita hacer nada especial — solo incluir `@username` en el contenido.

## Diagnóstico rápido

```bash
# Health check
curl http://localhost:4003/health

# Con JWT
curl -H "Authorization: Bearer $JWT" http://localhost:4003/conversations

# Con bypass (solo dev/test)
curl -H "x-test-user-id: user_test" http://localhost:4003/conversations

# O usá el CLI:
scripts/synapse doctor
scripts/synapse test --token $JWT
scripts/synapse env
```

## Referencias

- `references/api-reference.md` — API REST + WebSocket completa, tipos de los SDKs, errores comunes
- `scripts/synapse` — CLI para health check, inicialización y smoke tests

## Repos

| Repo | Descripción |
|---|---|
| `zeacl/synapse` | Backend (Phoenix + PostgreSQL) |
| `zeacl/synapse-js` | SDK TypeScript (cero deps) |
| `zeacl/synapse_client` | SDK Elixir (Req + WebSockex) |
