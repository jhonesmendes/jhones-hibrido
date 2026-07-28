# Implementation Plan: Campanhas de disparo em massa

**Branch**: `004-campanhas-disparo-massa` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-campanhas-disparo-massa/spec.md`

## Summary

Nova feature de domínio: campanhas de disparo em massa para contatos importados
por CSV, em dois modos (oficial via modelo aprovado + variável {{1}}; não oficial
via texto livre com variáveis nomeadas). O disparo é executado em segundo plano
dentro do mesmo processo Node (mesmo padrão do turno do agente e do runner do
Laboratório — sem filas externas, Constituição II), reutilizando `sendTemplate` e
`sendText`/o adaptador não oficial já existentes em vez de duplicar lógica de
envio. Progresso ao vivo via o bus SSE já usado pela caixa de entrada e o
Laboratório.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15 App Router, Drizzle ORM, Zod — todas já no
projeto. Sem dependências novas: o parsing de CSV é implementado manualmente
(formato simples, separador vírgula, sem necessidade de uma biblioteca).

**Storage**: PostgreSQL via Drizzle. Duas tabelas novas: `campaign` e
`campaign_recipient` (migração nova via `pnpm db:generate`).

**Testing**: Vitest (unit, para o parser de CSV e a renderização de variáveis) +
self-test E2E ao vivo (Princípio IX) com Playwright real contra `pnpm dev` + mocks.

**Target Platform**: Web (navegador) + Node self-hosted.

**Project Type**: Monolito Next.js existente.

**Performance Goals**: N/A — disparo sequencial deliberado (um por um, com
intervalo), não é uma rota de alto throughput.

**Constraints**: O intervalo entre envios do modo não oficial MUST ser
configurável (Princípio IX v2.0.0) — nunca uma constante no código. O envio
ocorre in-process (Constituição II) — nada de filas/workers externos.

**Scale/Scope**: pensado para dezenas/centenas de destinatários por campanha
(uso de uma agência/negócio pequeno), não milhares — coerente com o Princípio
VIII (foco vertical, não é plataforma de marketing em massa em escala).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Segurança de Dados**: sem novos segredos; reutiliza credenciais já
  cifradas (Meta / canal não oficial) tal como estão. PASS.
- **II. Soberania (v2.0.0)**: canal não oficial já permitido; disparo in-process,
  sem filas externas. PASS.
- **III. Multi-tenancy**: `campaign`/`campaign_recipient` levam
  `organization_id` NOT NULL, todas as queries via `scoped()`. PASS.
- **IV. Idempotência**: cada destinatário cria/reutiliza contato+conversa com
  os mesmos helpers idempotentes já testados (`getOrCreateContact`/
  `getOrCreateConversation`); disparo duplo bloqueado pelo status da campanha
  (FR-011). PASS.
- **V. Qualidade Verificável**: gate typecheck+lint+build+test sem exceção. PASS
  (pendente de execução).
- **VI. Specs Antes do Código**: este plano e spec precedem a implementação. PASS.
- **VII. Rastreabilidade**: escopo reduzido (sem agendamento, sem seleção a
  partir de pipeline/tags) documentado em spec.md → Assumptions. PASS.
- **VIII. Foco Vertical (v2.0.0)**: campanhas já admitidas explicitamente como
  extensão de "converter conversas em escala"; não é um builder de fluxos
  genérico nem scraping. PASS.
- **IX. Verificação ao Vivo (v2.0.0)**: MUST avisar sobre risco de ban na UI
  antes de salvar uma campanha não oficial (FR-005) e o intervalo MUST ser
  configurável (FR-006) — ambos já refletidos nos requisitos. Self-test E2E ao
  vivo cobrindo ambos os canais antes de declarar "Feito". Pendente de execução
  na implementação.

Sem violações — Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/004-campanhas-disparo-massa/
├── plan.md              # This file
├── spec.md              # Feature spec
├── data-model.md         # Phase 1 output
├── tasks.md              # Phase 2 output (/speckit-tasks)
└── checklists/
    └── requirements.md
```

Sem `research.md`: não há incógnitas técnicas — o padrão de trabalho em segundo
plano in-process, o bus SSE e os primitivos de envio já existem e são
documentados em Technical Context. Sem `contracts/` separado: os endpoints são
documentados em `data-model.md` junto às entidades que expõem, dado o tamanho
reduzido da feature.

### Source Code (repository root)

```text
src/
├── lib/
│   ├── db/schema.ts              # + tabelas campaign, campaignRecipient
│   └── campaigns/
│       ├── render.ts             # renderMessage/extractVariables (texto livre)
│       └── csv.ts                # parseRecipientsCsv (telefone + variáveis)
├── server/
│   └── campaigns/
│       ├── queries.ts            # list/get/serialize
│       ├── create.ts             # criar campanha + destinatários a partir do CSV
│       └── send.ts               # runCampaign (loop in-process) + cancelCampaign
├── app/api/campaigns/
│   ├── route.ts                  # GET (listar) / POST (criar)
│   ├── import-csv/route.ts       # POST → preview de um CSV (sem persistir)
│   └── [id]/
│       ├── route.ts              # GET (detalhe + destinatários)
│       ├── send/route.ts         # POST (dispara, dispara o loop em segundo plano)
│       └── cancel/route.ts       # POST (cancela)
├── app/(app)/campanhas/
│   ├── page.tsx
│   └── [id]/page.tsx
└── components/campaigns/
    ├── campaigns-client.tsx      # listagem + modal de criação
    └── campaign-detail-client.tsx # detalhe com progresso ao vivo (SSE)
```

**Structure Decision**: segue o mesmo padrão já estabelecido no repositório para
`inbox`/`whatsapp`/`unofficial` (`src/lib/<domínio>/` para lógica pura,
`src/server/<domínio>/` para acesso a dados e orquestração,
`src/app/api/<domínio>/` para as rotas, `src/components/<domínio>/` para a UI).
Zero desvios da convenção existente.

## Complexity Tracking

*(vazio — não há violações a justificar)*
