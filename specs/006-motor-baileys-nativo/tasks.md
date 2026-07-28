---

description: "Task list: motor WhatsApp não oficial nativo (Baileys)"
---

# Tasks: Motor WhatsApp não oficial nativo (Baileys)

**Input**: Design documents from `specs/006-motor-baileys-nativo/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: unitários para a normalização de mensagens recebidas (pura). O
pareamento QR↔telefone real NÃO é automatizável — fica como verificação humana
explícita (ver spec.md → Assumptions), não se finge um teste que não existe.

## Phase 1: Setup

- [X] T001 `pnpm add @whiskeysockets/baileys qrcode` + `pnpm add -D
  @types/qrcode`.
- [X] T002 Migração: reescrever `unofficial_channel` em `src/lib/db/schema.ts`
  (ver data-model.md) — fora colunas de gateway, dentro
  `authStateCipher/Iv/Tag`. `pnpm db:generate` + `pnpm db:migrate`.
- [X] T003 Adicionar o evento `channel.status` a `SseEvent`
  (`src/server/events/bus.ts`) + handler `onChannelStatus` em
  `src/components/use-events.ts`.

**Checkpoint**: dependências instaladas, schema migrado.

---

## Phase 2: User Story 1 - Conectar sem gateway externo (Priority: P1) 🎯 MVP

- [X] T010 [US1] `src/server/baileys/auth-state.ts`: `loadAuthState`,
  `SignalKeyStore` em memória + `persist()` cifrado (ver data-model.md).
- [X] T011 [US1] `src/server/baileys/manager.ts`: `connect`, `disconnect`,
  `getLiveStatus` — trata `connection.update` (QR, open, close),
  `creds.update` (persist). Runtime Node explícito onde for necessário.
- [X] T012 [US1] `src/app/api/settings/channels/route.ts` reescrita: POST
  (conectar), DELETE (desconectar), GET (estado inicial). Elimina
  `src/app/api/settings/channels/status/route.ts` (já não há polling).
- [X] T013 [US1] `src/components/settings/channels-client.tsz` reescrita: sem
  campos de provedor/URL/instância/API key — um botão "Conectar", QR/estado
  via `useEvents({ onChannelStatus })`, botão "Desconectar" quando conectado.
- [X] T014 [US1] Eliminar `src/lib/unofficial/` por completo (types.ts,
  evolution.ts, wppconnect.ts, waha.ts, index.ts) e
  `src/server/unofficial/channel.ts` (FR-010).
- [X] T015 [US1] Eliminar `src/app/api/webhooks/unofficial/[webhookToken]/`
  (já não há webhook a receber).

**Checkpoint**: conectar/desconectar funcional; pareamento real pendente de
verificação humana (não automatizável).

---

## Phase 3: User Story 2 - Enviar/receber texto pelo motor (Priority: P1)

- [X] T020 [US2] `src/server/baileys/inbound.ts`: `handleIncomingMessages` —
  filtra grupos/broadcast, normaliza tipo/texto/from, chama
  `ingestInboundMessage` (reuso direto).
- [X] T021 [US2] Encaixar `messages.upsert` do socket (em `manager.ts`) a
  `handleIncomingMessages`.
- [X] T022 [US2] `src/server/baileys/sender.ts`: `sendText(organizationId,
  phone, text)` sobre o socket ativo; erro tipado se não houver conexão.
- [X] T023 [US2] `src/server/inbox/send.ts`: `sendViaUnofficial` chama o
  novo `sender.ts` em vez de `getAdapter(...).sendText(...)`.
- [X] T024 [US2] Eliminar `src/server/unofficial/ingest.ts`
  (`processUnofficialWebhook`/`unofficialMessageId`) — substituído por T020.
- [X] T025 [US2] `src/app/api/media/[id]/route.ts`: serve mídia do canal não
  oficial a partir de `message_media` (Postgres, base64, self-hosted) — revisado
  pós self-test: implementado, já não é 404 (ver spec.md → Assumptions,
  atualizado).
- [X] T025b [US2] `src/lib/db/schema.ts` (`messageMedia`) +
  `drizzle/0006_message_media_table.sql`: tabela nova para os bytes de
  mídia do canal não oficial. `src/server/baileys/inbound.ts`:
  `downloadMedia()` via `downloadMediaMessage` do Baileys (baixa +
  decifra, já traz a chave na mensagem). `src/server/inbox/ingest.ts`:
  `ingestInboundMessage` aceita `media` e o persiste; `LOCAL_MEDIA_MARKER`
  exportado para a rota saber distinguir "URL externa" de "bytes
  locais".
- [X] T026 [US2] [P] Testes unitários de `inbound.ts` (normalização pura, sem
  socket real) em `tests/unit/baileys-inbound.test.ts`: texto simples, mídia
  sem preview, grupo ignorado, `fromMe` (eco), resolução de LID (dois casos
  novos pós self-test: resolve / descarta sem mapeamento).

**Checkpoint**: envio/recebimento de texto verificado em código; a troca
real com um WhatsApp de verdade fica para verificação humana.

---

## Phase 4: User Story 3 - Reconexão automática ao reiniciar (Priority: P2)

- [X] T030 [US3] `src/server/baileys/manager.ts`: `reconnectAllOnBoot()` —
  lista organizações com linha em `unofficial_channel`, chama `connect()`
  para cada uma.
- [X] T031 [US3] Encaixar `reconnectAllOnBoot()` em `src/instrumentation.ts`
  (junto a `cleanupOrphanRuns`/`startFollowupScheduler`).

**Checkpoint**: as 3 histórias completas em código.

---

## Phase 5: Polish

- [X] T040 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm
  build && pnpm test`.
- [X] T041 Self-test automatizável ao vivo (Princípio IX): iniciar o
  servidor, iniciar uma conexão, verificar que chega um QR real por SSE
  dentro de alguns segundos, verificar que `GET /api/settings/channels`
  reflete o estado, verificar que enviar sem conexão dá o erro esperado.
- [ ] T042 **Verificação humana obrigatória** (não delegável a ferramentas,
  Princípio IX): escanear o QR com um WhatsApp real, confirmar que o
  estado passa a "Conectado" com o número correto, enviar uma mensagem a partir
  da caixa de entrada e confirmar que chega ao telefone real, responder a partir do
  telefone e confirmar que aparece na caixa de entrada. Reiniciar o servidor e
  confirmar que reconecta sozinho (US3) sem pedir QR de novo.

## Resultado do self-test (T040-T041)

Gate técnico, executado duas vezes (antes e depois da migração do
schema/ambiente de teste, ver Notes da sessão) — verde em ambas:

```
pnpm typecheck  → TYPECHECK=0
pnpm lint       → LINT=0
pnpm exec vitest run --no-file-parallelism → 124/124 testes, 22/22 arquivos
pnpm build      → BUILD=0 (17 rotas dinâmicas compiladas, sem warnings de
                  resolução de módulos nativos)
```

Self-test de comportamento ao vivo (Playwright, `WA_MOCK_ENABLED=true`,
servidor real em `localhost:3001`, login real, sem mocks do motor Baileys —
este fala com os servidores reais do WhatsApp):

| # | Asserção | Resultado |
|---|---|---|
| 1 | US1: tela de conexão não pede URL/instância/API key/provedor de terceiros | OK |
| 2 | US1: estado inicial mostra "Desconectado" | OK |
| 3 | US1: clique em "Conectar" muda o estado para "Conectando…" ao vivo (SSE) | OK |
| 4 | US1/SC-002: o motor nativo contata os servidores reais do WhatsApp e gera um QR real (sem gateway de terceiros) | OK |
| 5 | `GET /api/settings/channels` reflete o mesmo estado da UI (connecting + qrCode) | OK |
| 6 | US2 caminho infeliz: enviar sem conexão confirmada falha de forma limpa (409, `not_connected`) | OK |
| 7 | US1: desconectar limpa a sessão (estado volta a "Desconectado") | OK |

8/8 asserções em verde. O que este self-test **não** cobre (não automatizável
— ver T042): o pareamento real com um telefone, a troca real de mensagens,
e a reconexão automática após um reinício com uma sessão já pareada.

## Dependencies & Execution Order

- Setup (T001-T003) bloqueia todo o resto.
- US1 (T010-T015) é a base — sem conexão não há nada a enviar/receber.
- US2 (T020-T026) depende de US1 (precisa de `manager.ts` com um socket ativo).
- US3 (T030-T031) depende de US1 (reconectar é apenas "conectar de novo").
- Polish depende das 3 histórias; T042 é o fechamento real da feature —
  sem isso, não se declara "Feita" (Princípio IX), ainda que todo o código já
  esteja verificado até onde as ferramentas alcançam.

## Notes

- Elimina por completo: `src/lib/unofficial/`, `src/server/unofficial/`,
  `/api/webhooks/unofficial/`, `/api/settings/channels/status/` — sem deixar
  código morto nem uma opção "modo gateway" alternativa (FR-010).
- Reaproveita: `ingestInboundMessage`, `lib/crypto` (cifragem), o bus SSE, o
  padrão `globalThis` de socket/estado in-process já usado por
  Campanhas/Follow-up.
- T042 não pode ser executado neste ambiente de desenvolvimento — exige um
  telefone real com WhatsApp. O resultado é documentado quando o dono o
  executar, não é presumido nem fingido.
