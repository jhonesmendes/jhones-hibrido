# Implementation Plan: Follow-up automático de pipeline

**Branch**: `005-followup-automatico-pipeline` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-followup-automatico-pipeline/spec.md`

## Summary

Configuração singular por organização (habilitado, etapa gatilho, intervalo,
mensagem, etapa de sucesso, etapa de expiração, requer documento) mais um scheduler
in-process que roda a cada N minutos (mesmo padrão do restante do trabalho em
segundo plano do projeto — sem filas externas) para: enviar o lembrete a
leads inativos na etapa gatilho, e expirar os que não responderam depois do
prazo de carência. A detecção de documento é resolvida de forma reativa (no
mesmo momento da ingestão da mensagem recebida), não por scheduler, para cumprir
SC-004. Reaproveita `sendText` para o envio e `lead.lastActivityAt` (já
existente) como única fonte de "última atividade" — sem rastreamento novo para isso.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15, Drizzle ORM — todas já no projeto. Sem
dependências novas (nada de `node-cron`: um `setInterval` module-level basta,
igual a `scheduleAgentTurn`).

**Storage**: PostgreSQL via Drizzle. Duas tabelas novas: `pipelineFollowup`
(configuração, 1 linha por organização) e `followupSend` (registro/idempotência).

**Testing**: Vitest (unit, para a lógica pura de elegibilidade de um lead) +
self-test E2E ao vivo (Princípio IX).

**Target Platform**: Node self-hosted, processo único de longa duração (não
serverless) — o `setInterval` do scheduler vive enquanto o processo viver.

**Project Type**: Monolito Next.js existente.

**Performance Goals**: N/A — ciclo de verificação periódico de baixa frequência
(minutos), não uma rota de alto tráfego.

**Constraints**: O intervalo de verificação do scheduler e o intervalo/mensagem de
follow-up MUST vir de configuração (env var para o primeiro, banco de dados
para o segundo) — nunca constantes de negócio no código (regra explícita do
roadmap, já alinhada com o restante do projeto).

**Scale/Scope**: pensado para o volume de um negócio pequeno/médio (dezenas de
leads ativos por etapa), coerente com o Princípio VIII.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Segurança de Dados**: sem segredos novos. PASS.
- **II. Soberania**: scheduler in-process, sem filas externas, sem dependências
  novas. PASS.
- **III. Multi-tenancy**: `pipelineFollowup`/`followupSend` levam
  `organization_id` NOT NULL, queries via `scoped()`. PASS.
- **IV. Idempotência**: índice único parcial sobre `followupSend` (1 registro
  `pending`/`sent`-sem-resolver ativo por lead por vez) evita duplicar
  lembretes; mesmo padrão de `test_run_org_running_uq`. PASS.
- **V. Qualidade Verificável**: gate typecheck+lint+build+test sem exceção. PASS
  (pendente de execução).
- **VI. Specs Antes do Código**: este plano e spec precedem a implementação. PASS.
- **VII. Rastreabilidade**: o prazo de carência = intervalo (suposição) documentado em
  spec.md → Assumptions. PASS.
- **VIII. Foco Vertical**: serve diretamente a "atender/organizar/converter"
  leads de WhatsApp — não é um builder de fluxos genérico (uma única transição
  configurável: gatilho → sucesso/expiração). PASS.
- **IX. Verificação ao Vivo**: o envio do lembrete respeita o guardrail de
  sandbox `is_test` (reaproveita `sendText`, que já o aplica) — não se introduz um
  caminho de envio novo sem esse guardrail. Self-test E2E ao vivo antes de "Feito".

Sem violações — não se aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-followup-automatico-pipeline/
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
├── lib/db/schema.ts                    # + pipelineFollowup, followupSend
├── server/
│   ├── pipeline/
│   │   ├── followup.ts                 # get/saveFollowupConfig, serialize
│   │   ├── followup-scheduler.ts       # startFollowupScheduler (setInterval), runFollowupCycle
│   │   └── followup-document.ts        # onInboundMedia (reativo, chamado desde ingest.ts)
│   └── inbox/ingest.ts                 # + chamada a onInboundMedia quando a mensagem é mídia
├── instrumentation-node.ts              # + startFollowupScheduler() na inicialização
├── app/api/pipeline/followup/route.ts   # GET/PUT config
└── components/pipeline/
    └── followup-manager.tsx             # modal de configuração (junto ao StageManager)
```

**Structure Decision**: segue o padrão `src/server/<domínio>/` +
`src/app/api/<domínio>/` já estabelecido; o scheduler é registrado em
`instrumentation-node.ts`, o único ponto de inicialização de trabalho em segundo
plano de vida longa que já existe no projeto (hoje só faz `cleanupOrphanRuns`).

## Complexity Tracking

*(vazio — não há violações a justificar)*
