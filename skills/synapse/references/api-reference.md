# Synapse API Reference

Documentación detallada de la API REST y WebSocket de Synapse.
Cargar este archivo cuando se necesiten detalles de endpoints, formatos de request/response,
o troubleshooting avanzado.

## REST API

Base URL: `http://localhost:4003` (dev) o configurable con `PORT`

### Autenticación

Todas las rutas (excepto `/health`) requieren header `Authorization: Bearer <JWT>`.

En dev/test se puede usar el bypass: `x-test-user-id: <user_id>`.

### GET /health

Respuesta: `{"status":"ok","service":"synapse","timestamp":"..."}`

### GET /conversations

Lista todas las conversaciones del usuario autenticado.

Respuesta:
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "dm",
      "title": null,
      "created_by": "user_id",
      "participants": [
        {"user_id": "user_a", "role": "owner"},
        {"user_id": "user_b", "role": "member"}
      ],
      "last_message": null,
      "inserted_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST /conversations

Crea una nueva conversación.

Request:
```json
{
  "type": "dm",
  "participant_ids": ["user_b"]
}
```

Para grupos:
```json
{
  "type": "group",
  "title": "Equipo de diseño",
  "participant_ids": ["user_b", "user_c"]
}
```

Respuesta: `201` con el objeto conversation (mismo formato que GET).

Errores:
- `422` si `type=group` sin `title`
- `422` si `participant_ids` vacío
- DM duplicada: devuelve la existente (idempotente)

### GET /conversations/:id

Obtiene una conversación por ID.

Errores:
- `404` si no existe
- `403` si el usuario no es participante

### GET /conversations/:id/messages

Cursor pagination. Parámetros: `?before=ISO8601&limit=50` (default limit=50).

Respuesta:
```json
{
  "data": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender_id": "user_a",
      "content": "hola @carlos",
      "mentions": ["carlos"],
      "type": "text",
      "metadata": {},
      "inserted_at": "2024-01-01T00:00:00Z"
    }
  ],
  "cursor": {
    "next": "2024-01-01T00:00:00Z",
    "has_more": true
  }
}
```

Los mensajes vienen en orden DESC (más recientes primero).

### POST /conversations/:id/messages

Envía un mensaje. El procesamiento es asíncrono (GenServer).

Request:
```json
{
  "content": "hola @carlos mirá esto"
}
```

Respuesta: `201 {"status":"sent","conversation_id":"uuid"}`

El mensaje se persiste y se broadcastuea vía WebSocket. Las @menciones disparan:
1. Resolución de usuarios contra Thalamus
2. Si el mencionado es `is_agent: true` → forward a Glia
3. El mencionado se agrega como participante automáticamente

---

## WebSocket

Endpoint: `ws://host:4003/socket/websocket?token=<JWT>`

Protocolo: Phoenix Channels sobre WebSocket nativo.

### Formato de frames

Phoenix Channels usa arrays JSON: `[join_ref, ref, topic, event, payload]`

### Conexión

```json
// Cliente envía token como query param en la URL del WebSocket
ws://localhost:4003/socket/websocket?token=<JWT>
```

### Join a un canal

```json
// Cliente → Servidor
[null, null, "conversation:<uuid>", "phx_join", {}]

// Servidor → Cliente
[null, null, "conversation:<uuid>", "phx_reply", {"status": "ok", "response": {}}]
```

Error si no es participante:
```json
[null, null, "conversation:<uuid>", "phx_reply", {"status": "error", "response": {"reason": "not_participant"}}]
```

### Enviar mensaje

```json
// Cliente → Servidor
[null, null, "conversation:<uuid>", "send_message", {"content": "hola"}]

// Servidor → broadcast a todos los suscriptores
[null, null, "conversation:<uuid>", "new_message", {
  "id": "uuid",
  "sender_id": "user_a",
  "content": "hola",
  "mentions": [],
  "type": "text",
  "inserted_at": "2024-01-01T00:00:00Z"
}]
```

### Typing indicator

```json
// Cliente → Servidor
[null, null, "conversation:<uuid>", "typing", {}]

// Servidor → broadcast
[null, null, "conversation:<uuid>", "typing_start", {"user_id": "user_a"}]

// Después de 3s sin actividad, el servidor envía:
[null, null, "conversation:<uuid>", "typing_stop", {"user_id": "user_a"}]
```

---

## SDK TypeScript (@zea.cl/synapse-js)

### Instalación

```bash
npm install github:zeacl/synapse-js
```

### API completa

```ts
class SynapseClient {
  // REST
  readonly conversations: {
    list(): Promise<Conversation[]>
    get(id: string): Promise<Conversation>
    create(params: CreateConversationParams): Promise<Conversation>
  }
  readonly messages: {
    list(convId: string, opts?: { before?: string; limit?: number }): Promise<{
      data: Message[]
      cursor: PaginationCursor
    }>
  }

  // WebSocket
  connect(): Promise<void>
  disconnect(): void
  joinConversation(convId: string): void
  leaveConversation(convId: string): void
  sendMessage(convId: string, content: string): void
  sendTyping(convId: string): void

  // Eventos
  on(event: 'connected', handler: () => void): () => void
  on(event: 'disconnected', handler: (p: { reason: string }) => void): () => void
  on(event: 'error', handler: (p: { error: Error }) => void): () => void
  on(event: 'message', handler: (p: { message: Message }) => void): () => void
  on(event: 'typing:start', handler: (p: { userId: string }) => void): () => void
  on(event: 'typing:stop', handler: (p: { userId: string }) => void): () => void
  off(event: string, handler: Function): void

  get connected(): boolean
}

// React hooks
function useSynapse(config: SynapseConfig): {
  client: SynapseClient | null
  connected: boolean
  error: Error | null
}

function useConversation(client: SynapseClient, convId: string): {
  messages: Message[]
  send: (content: string) => void
  typing: () => void
  typingUsers: string[]
  loadMore: () => Promise<boolean>
  hasMore: boolean
  loading: boolean
}
```

### Configuración

```ts
interface SynapseConfig {
  token: string | (() => string | Promise<string>)
  baseUrl: string
  autoConnect?: boolean          // default: true
  reconnect?: boolean | {         // default: true
    maxAttempts?: number          // default: 10
    baseDelay?: number            // default: 1000
    maxDelay?: number            // default: 30000
  }
}
```

---

## SDK Elixir (synapse_client)

### Instalación

```elixir
{:synapse_client, github: "zeacl/synapse_client"}
```

### API completa

```elixir
# Iniciar cliente
@spec SynapseClient.start_link(keyword()) :: GenServer.on_start()
# Opciones: :token (required), :base_url (required), :name, :connect (default: true)

# REST
@spec list_conversations(client()) :: {:ok, [map()]} | {:error, term()}
@spec get_conversation(client(), String.t()) :: {:ok, map()} | {:error, term()}
@spec create_conversation(client(), keyword()) :: {:ok, map()} | {:error, term()}
@spec list_messages(client(), String.t(), keyword()) :: {:ok, [map()], map()} | {:error, term()}

# Real-time
@spec subscribe(client(), String.t()) :: :ok
@spec send_message(client(), String.t(), String.t()) :: :ok
@spec typing(client(), String.t()) :: :ok
```

### Mensajes recibidos (en el mailbox del proceso)

```elixir
receive do
  {:new_message, message} -> ...
  {:typing_start, user_id} -> ...
  {:typing_stop, user_id} -> ...
end
```

---

## Errores comunes y soluciones

| Error | Causa probable | Solución |
|---|---|---|
| `401 unauthorized` | JWT inválido/expirado | Refresh token o verificar contra Thalamus |
| `403 not_participant` | Usuario no agregado a la conversación | `POST /conversations` primero |
| WS timeout | Synapse no corriendo | `curl /health` o `mix phx.server` |
| `fetch is not defined` | Node < 18 | Usar Node 18+ o polyfill |
| WS desconexión | Network issue o idle timeout (30 min) | Reconexión automática del SDK |
