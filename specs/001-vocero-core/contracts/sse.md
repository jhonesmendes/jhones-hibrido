# Contrato: Canal SSE da caixa de entrada

Rota: `GET /api/events` (autenticada por sessão; escopo = organização do usuário).
`export const dynamic = 'force-dynamic'`.

Headers de resposta (obrigatórios, exatos):

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no
Connection: keep-alive
```

- **Heartbeat**: comentário `: ping\n\n` a cada ~25s (mantém o stream vivo atrás do
  Caddy/Traefik e proxies intermediários).
- **Eventos** (`event: <tipo>`, `data: <json>`, `id: <epoch_ms>`):
  - `message.new` — `{ conversationId, message: {...} }` (nunca de conversas `is_test`)
  - `message.status` — `{ conversationId, messageId, status }`
  - `conversation.updated` — `{ conversation: {...} }` (handoff, unread, last_message_at)
  - `lab.run` — `{ runId, status, progress: {done, total}, score? }`
- **Catch-up**: o cliente envia `Last-Event-ID` (ou o front refaz a busca a partir do seu
  último `last_message_at`) ao reconectar; o servidor NÃO garante replay — o cliente faz
  refetch de conversas/mensagens com `since=<timestamp>` no evento `open` após uma
  reconexão. EventSource reconecta sozinho (retry por padrão).
- **Bus interno**: EventEmitter in-process por organização (`server/events`); publicar
  após commit no BD.
