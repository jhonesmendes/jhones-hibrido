# Implementation Plan: Motor WhatsApp não oficial nativo (Baileys)

**Branch**: `006-motor-baileys-nativo` | **Date**: 2026-07-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-motor-baileys-nativo/spec.md`

## Summary

Substitui por completo a camada de adaptadores de gateway (`src/lib/unofficial/*`,
webhook público, colunas de provedor/URL/API-key) por um motor próprio que fala
o protocolo do WhatsApp Web diretamente (`@whiskeysockets/baileys`), rodando
in-process. Sem webhook: os eventos de mensagens/conexão chegam por callbacks do
socket dentro do mesmo processo. A sessão pareada (credenciais + chaves de
Signal) é persistida cifrada no Postgres — mesmo padrão de cifragem do restante
do projeto — para sobreviver a reinicializações (US3). O estado de conexão é exposto
pelo mesmo bus SSE já usado pela caixa de entrada/Laboratório/Campanhas, eliminando o
polling atual de 5s.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js (runtime `nodejs` explícito nas
rotas afetadas — Baileys usa APIs do Node não disponíveis no edge).

**Primary Dependencies**: `@whiskeysockets/baileys` (nova — conexão direta,
sem servidor intermediário) + `qrcode` (nova — só para converter a string do QR
numa imagem PNG que já sabemos exibir). Sem dependências de rede para
terceiros: o Baileys conecta direto aos servidores do WhatsApp.

**Storage**: PostgreSQL via Drizzle. A tabela `unofficial_channel` é reescrita
(migração): fora `provider`/`baseUrl`/`instanceName`/`apiKey*`/`webhookToken`;
dentro `authStateCipher/Iv/Tag` (blob JSON cifrado com as credenciais +
armazém de chaves do Baileys).

**Testing**: Vitest para a lógica de normalização de mensagens recebidas/estado
(pura, sem socket real). O pareamento real (QR + WhatsApp real) NÃO é automatizável
— ver spec.md → Assumptions; fica como verificação humana explícita.

**Target Platform**: Node self-hosted, processo único de longa duração (mesma
suposição de Campanhas/Follow-up: nada disso funciona em serverless).

**Constraints**: Um socket ativo por organização conectada, vivendo em memória
do processo (`Map` module-level) — é reconstruído ao reiniciar a partir da sessão
persistida (US3). Sem S3/armazenamento de objetos (Princípio II) — por isso
mídia fica fora desta iteração (precisaria persistir bytes ou tentar novamente a
descarga sob demanda contra um socket que poderia não continuar ativo).

**Scale/Scope**: uma sessão por organização — mesma suposição de "um negócio por
instância" já vigente em todo o projeto.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Segurança de Dados**: a sessão do WhatsApp (equivalente a um segredo de
  autenticação) é cifrada em repouso com o mesmo `lib/crypto` AES-256-GCM que já
  protege o token da Meta e as API keys de gateway. PASS.
- **II. Soberania (v2.0.0)**: elimina uma dependência externa real (os processos
  gateway Evolution/WPPConnect/WAHA) — Baileys é uma biblioteca que conecta
  direto ao WhatsApp, sem servidor intermediário próprio. Mais soberano que o estado
  atual, não menos. Já mencionado explicitamente no texto da constituição
  ("conexão direta tipo WhatsApp Web (Baileys)"). PASS.
- **III. Multi-tenancy**: um socket + uma sessão por `organizationId`, `Map`
  indexado por organização, colunas com `organization_id` NOT NULL + `scoped()`.
  PASS.
- **IV. Idempotência**: reaproveita `ingestInboundMessage` tal como está (já idempotente
  por `wa_message_id` único) — o motor só normaliza e chama essa função, não
  reimplementa idempotência. PASS.
- **V. Qualidade Verificável**: gate typecheck+lint+build+test. O pareamento real com
  um telefone fica marcado explicitamente como verificação humana (não
  automatizável) — não é reportado como "feito" sem essa marca. PASS.
- **VI. Specs Antes do Código**: este plano e spec precedem a implementação.
  PASS.
- **VII. Rastreabilidade**: corte de escopo (sem mídia) e a impossibilidade de
  automatizar o pareamento real documentados em spec.md → Assumptions. PASS.
- **VIII. Foco Vertical**: continua sendo o mesmo canal de conversas/leads de
  WhatsApp — muda COMO se conecta, não O QUE faz. PASS.
- **IX. Verificação ao Vivo**: tudo o que é automatizável (persistência de sessão,
  ciclo de vida connect/disconnect, normalização de mensagens, roteamento de envio)
  é verificado com testes reais antes de "Feito". O pareamento QR↔telefone real é
  a única parte que o próprio Princípio IX reconhece como delegável à
  verificação humana ("aprovação de terceiro" / o intrinsecamente não
  verificável por ferramentas — aqui, um WhatsApp real alheio ao ambiente).

Sem violações — não se aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/006-motor-baileys-nativo/
├── plan.md
├── spec.md
├── data-model.md
├── tasks.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── lib/db/schema.ts                     # unofficial_channel reescrita
├── server/baileys/
│   ├── auth-state.ts                    # AuthenticationState persistido no BD, cifrado
│   ├── manager.ts                       # connect/disconnect/getLiveStatus, Map in-process
│   ├── inbound.ts                       # normaliza mensagens do socket → ingestInboundMessage
│   └── sender.ts                        # sendText(organizationId, phone, text)
├── server/unofficial/                   # ELIMINADO (channel.ts, ingest.ts)
├── lib/unofficial/                      # ELIMINADO (adapters de gateway)
├── app/api/webhooks/unofficial/         # ELIMINADO (já não há webhook)
├── app/api/settings/channels/           # reescrita: POST connect, DELETE disconnect
│   └── route.ts                         # (sem GET status por polling — ver SSE)
├── app/api/media/[id]/route.ts          # desabilitado para canal não oficial
│                                          nesta iteração (ver Assumptions)
├── server/inbox/send.ts                 # sendViaUnofficial → chama server/baileys/sender
├── server/events/bus.ts                 # + evento "channel.status"
├── instrumentation.ts                   # + reconectar sessões já pareadas ao iniciar
└── components/settings/
    └── channels-client.tsx              # reescrita: sem campos de gateway, QR/estado via SSE
```

**Structure Decision**: novo domínio `src/server/baileys/` substitui por completo
`src/lib/unofficial/` + `src/server/unofficial/` (FR-010) —
consistente com o padrão `src/server/<domínio>/` já usado no projeto. O
webhook público desaparece: o motor roda in-process, os eventos chegam por
callbacks diretos do socket.

## Complexity Tracking

*(vazio — não há violações a justificar)*
