# Data Model: Motor WhatsApp não oficial nativo (Baileys)

## Entidade

### `unofficial_channel` (reescrita — 1 linha por organização)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefixo `uch_` (já existe) |
| `organizationId` | text NOT NULL UNIQUE FK → organization | scoped, singleton |
| `authStateCipher/Iv/Tag` | text NOT NULL (3 colunas) | JSON `{ creds, keys }` completo do Baileys, cifrado AES-256-GCM (mesmo `lib/crypto` do token da Meta) |
| `displayPhoneNumber` | text NULL | número exibido depois do pareamento |
| `status` | enum `disconnected` \| `connecting` \| `connected` NOT NULL default `disconnected` | |
| `createdAt` / `updatedAt` | timestamp | |

É eliminado: `provider`, `baseUrl`, `instanceName`, `apiKeyCipher/Iv/Tag`,
`webhookToken` (já não há provedor a escolher nem webhook a rotear).

## Motor (`src/server/baileys/`)

### `auth-state.ts`

Implementa o contrato `AuthenticationState` que o Baileys espera
(`{ creds: AuthenticationCreds, keys: SignalKeyStore }`):

- `loadAuthState(organizationId)`: lê a linha cifrada (ou `null` se nunca se
  conectou), descifra, deserializa `{ creds, keys }`. Se não existir, gera
  `creds` novas (`initAuthCreds()` do Baileys) e `keys = {}`.
- O `SignalKeyStore` é implementado como um objeto em memória que mantém TODO
  o mapa `keys` (get/set síncronos sobre o objeto) + uma função
  `persist(organizationId)` que cifra e faz upsert do blob completo no BD.
  `persist()` é chamado a cada `creds.update` do socket e depois de cada
  `keys.set(...)` (o Baileys chama isso com frequência durante o pareamento; o
  blob completo é persistido a cada vez — volume baixo, um negócio pequeno, sem
  necessidade de otimizar com debounce nesta iteração).

### `manager.ts`

Estado module-level (mesmo padrão `globalThis` de Campanhas/Follow-up para
sobreviver a HMR em dev):

- `activeSockets: Map<organizationId, WASocket>`
- `liveStatus: Map<organizationId, { status, qr: string | null, phoneNumber: string | null }>`

Funções:

- `connect(organizationId)`: se já houver um socket ativo, é no-op. Carrega o
  `AuthenticationState` (auth-state.ts), cria o socket
  (`makeWASocket({ auth: state, ... })`), enlaça:
  - `connection.update` → se trouxer `qr`, gera PNG (`qrcode.toDataURL`),
    atualiza `liveStatus` e publica `channel.status` por SSE; se
    `connection === "open"`, marca `connected` + salva `displayPhoneNumber`
    (de `sock.user.id`) no BD; se `connection === "close"`, decide
    reconectar (se não foi um logout explícito) ou marcar `disconnected`.
  - `creds.update` → `persist()` do auth state.
  - `messages.upsert` → para cada mensagem nova, delega a `inbound.ts`.
- `disconnect(organizationId)`: `sock.logout()`, remove o socket do `Map`,
  apaga a linha de `unofficial_channel` (força QR novo na próxima vez, FR-009).
- `getLiveStatus(organizationId)`: lê `liveStatus` (fallback ao BD se não houver
  socket ativo — ex. depois de um restart antes de `connect()` rodar).
- `reconnectAllOnBoot()`: lê todas as organizações com uma linha em
  `unofficial_channel` (sessão pareada existente) e chama `connect()` para
  cada uma — encaixado desde `instrumentation.ts` (US3).

### `inbound.ts`

`handleIncomingMessages(organizationId, messages: WAMessage[])`:

- Filtra: ignora mensagens de grupos/broadcast (`remoteJid` termina em `@g.us`
  ou é `status@broadcast`), ignora mensagens sem `message` (notificações de
  protocolo).
- Normaliza: `from` = dígitos do JID, `type` = texto se
  `message.conversation`/`extendedTextMessage`, senão o tipo de mídia
  (`imageMessage` → `"image"`, etc. — mesmo mapeamento que já existia nos
  adaptadores antigos, transportado tal como está), `text` = corpo ou caption,
  `fromMe` = `key.fromMe`, `waMessageId` = `unof:baileys:<key.id>` (mesmo
  prefixo com namespace já usado por `unofficialMessageId`, adaptado).
- Chama `ingestInboundMessage(...)` (reuso direto, FR-006) com
  `channel: "unofficial"`, `mediaUrl: null` (sem mídia nesta iteração).

### `sender.ts`

`sendText(organizationId, phone, text): Promise<string>`:

- Pega o socket ativo do `manager` (lança um erro tipado se não houver
  conexão — mesmo `SendError` já usado por `sendViaUnofficial`).
- `sock.sendMessage(phone + "@s.whatsapp.net", { text })`, devolve
  `res.key.id`.

## Mudanças no código existente

- `src/server/inbox/send.ts` → `sendViaUnofficial` deixa de chamar
  `getAdapter(...).sendText(...)` e chama `server/baileys/sender.ts`
  diretamente. O resto da função (guardrail de sandbox, inserção da
  mensagem, publish SSE) não muda.
- `src/server/events/bus.ts` → novo tipo `{ type: "channel.status"; data:
  { status: string; qrCode: string | null; phoneNumber: string | null } }`.
- `src/components/use-events.ts` → handler `onChannelStatus`.
- `src/instrumentation.ts` → depois de `startFollowupScheduler()`, chama
  `reconnectAllOnBoot()`.

## Contratos de API (reescritos)

### `POST /api/settings/channels`

Body vazio. Dispara `connect(organizationId)` (fire-and-forget, como o resto
do trabalho em segundo plano do projeto) e responde imediatamente — o QR
chega por SSE.

### `DELETE /api/settings/channels`

Chama `disconnect(organizationId)`.

### `GET /api/settings/channels`

Devolve o estado atual (`getLiveStatus`, com fallback ao BD) — é usado apenas
para o carregamento inicial da tela; as atualizações ao vivo chegam por
SSE (`channel.status`), não por polling.
