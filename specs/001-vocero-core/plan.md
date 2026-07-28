# Implementation Plan: Vocero CRM — Núcleo v1

**Branch**: `001-vocero-core` | **Date**: 2026-07-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-vocero-core/spec.md`

## Summary

Vocero CRM é um monolito Next.js self-hosted que implementa: caixa de entrada de WhatsApp
em tempo real (SSE), contatos + pipeline kanban, agente de IA com knowledge base e
ações tipadas, Laboratório de auto-avaliação (6 personas roteirizadas + juiz LLM),
wizard de conexão do número (modo direto ou modo agência/Tech Provider), templates
limitados, multiusuário mínimo e instalação em 15 minutos (Coolify ou docker compose +
Caddy). Os padrões mais difíceis (webhook assinado, ingestão idempotente, criptografia de
tokens, coalesce+lock do agente, mock harness) são portados de um projeto de referência
privado em produção, simplificados para menos código. Todo input externo é validado com
Zod; o LLM é acessado apenas por um adaptador compatível com OpenRouter; o ambiente de
testes interno (wa-mock + ai-mock) permite o self-test E2E completo sem tocar a API real.

## Technical Context

**Language/Version**: TypeScript estrito (`strict` + `noUncheckedIndexedAccess`), Node 22

**Primary Dependencies**: Next.js 15 (App Router, output standalone) + React 19 ·
Tailwind CSS + shadcn/ui · Drizzle ORM (migrações versionadas) · Better Auth + plugin
organization · Zod · nanoid (IDs com prefixo)

**Storage**: PostgreSQL 16 (self-hosted; serviço separado no Coolify / serviço compose)

**Testing**: Vitest (unit) + Playwright via MCP (self-test E2E conduzido pelo agente)

**Target Platform**: VPS Linux com Coolify (Rota A) ou Docker Compose + Caddy (Rota B);
desenvolvimento em Windows/macOS/Linux com Docker

**Project Type**: Aplicação web monolítica (um único pacote, sem workspaces)

**Performance Goals**: mensagem recebida visível na caixa de entrada aberta ≤2s (SSE,
também atrás do Caddy); instalação completa ~15 min; execução do Laboratório ≤10 min
(timeout)

**Constraints**: SSE com heartbeat `: ping` ~25s, `Cache-Control: no-cache,
no-transform`, `X-Accel-Buffering: no`, `Content-Type: text/event-stream` exato, rota
`force-dynamic`, catch-up ao reconectar · sem WebSocket nem servidor custom (quebra o
standalone) · sem filas externas (background in-process) · dependências de runtime SOMENTE
Meta Cloud API + LLM opcional (Constituição II endurecida) · repositório público: zero
segredos/nomes privados

**Scale/Scope**: uma instância = um negócio; ~15 tabelas; 8 user stories; equipe de
operação pequena (<10 usuários); volume de WhatsApp de PME (milhares de mensagens/mês)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação | Status |
|---|---|---|
| I. Segurança de Dados | Token Meta criptografado AES-256-GCM em repouso; `ENCRYPTION_KEY` apenas via env; segredos jamais ao cliente/logs; isolamento por `organization_id` em toda query | ✅ |
| II. Soberania (endurecida) | Runtime deps: apenas Meta Cloud API + adaptador OpenRouter opcional. Sem S3/email/Stripe/Google. Auth (Better Auth) e Postgres self-hosted. Adaptadores dedicados (`lib/meta`, `lib/ai`) | ✅ |
| III. Multi-Tenancy Real | `organization_id` NOT NULL + índice org-first em toda tabela de domínio; helpers de escopo obrigatórios (`lib/db/tenant`) | ✅ |
| IV. Idempotência | `wa_message_id` UNIQUE + dedup na ingestão; estados e template-status idempotentes; seed e migrações idempotentes | ✅ |
| V. Qualidade Verificável | Gate typecheck+lint+build+Vitest; o que não é verificável → lista "pendente de verificação humana" | ✅ |
| VI. Specs Antes do Código | Este fluxo (spec → plan → tasks → implement); artefatos commitados e públicos | ✅ |
| VII. Rastreabilidade | Decisões DV-VC-n em research.md; premissas explícitas na spec | ✅ |
| VIII. Foco Vertical | Escopo v1 rejeita broadcast/fluxos visuais/scraping/Instagram (Fora de Escopo da spec) | ✅ |
| IX. Verificação ao Vivo | Self-test E2E com Playwright contra wa-mock + ai-mock (caminho feliz + infeliz), local primeiro; smoke real condicional a credenciais | ✅ |

**Pós-design (Fase 1)**: reavaliado após data-model e contratos — sem violações; não há
entradas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-vocero-core/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões DV-VC-n
├── data-model.md        # Fase 1 — ~15 tabelas
├── quickstart.md        # Fase 1 — rodar local + self-test
├── contracts/           # Fase 1 — API interna, webhook, SSE, mocks, juiz
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/                    # login, cadastro (fechado após 1ª org)
│   ├── (app)/                     # shell autenticado
│   │   ├── inbox/                 # US1 caixa de entrada 3 colunas
│   │   ├── pipeline/              # US2 kanban
│   │   ├── contacts/              # US2 lista/busca
│   │   ├── agent/                 # US3 comportamento + KB
│   │   ├── lab/                   # US4 Laboratório (execuções, relatório)
│   │   └── settings/              # US5 wizard WhatsApp · US6 templates · US7 equipe
│   └── api/
│       ├── health/                # healthcheck deploy
│       ├── auth/[...all]/         # Better Auth
│       ├── webhooks/wa/[webhookToken]/   # US5 webhook (GET verify + POST eventos)
│       ├── events/                # SSE (force-dynamic, heartbeat, catch-up)
│       ├── conversations/         # mensagens, envio, template, toggle IA
│       ├── contacts/ · pipeline/ · agent/ · kb/ · lab/ · templates/ · settings/
│       └── dev/
│           ├── wa-mock/           # harness Cloud API (404 em prod)
│           └── ai-mock/           # completions determinísticas (404 em prod)
├── components/                    # shadcn/ui + componentes de produto
├── lib/
│   ├── env.ts                     # validação Zod de variáveis
│   ├── crypto/                    # AES-256-GCM
│   ├── meta/                      # cliente Graph API próprio (+ templates)
│   ├── ai/                        # adaptador compatível com OpenRouter (chatJson<T>)
│   ├── db/                        # drizzle schema, cliente, tenant scope
│   └── auth/                      # Better Auth config + organization
└── server/
    ├── inbox/                     # ingest idempotente, send (guard is_test), window
    ├── ai/                        # agent pipeline, coalesce+lock, prompts, handoff
    ├── lab/                       # runner de execuções, personas, juiz
    ├── whatsapp/                  # credenciais, templates (sync de estados)
    └── events/                    # bus SSE in-process

scripts/
├── migrate.mjs                    # migrações no boot (esbuild)
└── seed/demo.mjs                  # seed Ferretería El Martillo (idempotente)

tests/
├── unit/                          # crypto, assinatura, tenant, window, parser, regex,
│                                  # mocks-prod-404, registro fechado, lab-sandbox, juiz
└── e2e/                           # roteiros do self-test (conduzidos via Playwright)

Dockerfile · docker-compose.yml · Caddyfile · INSTALL-IA.md · README.md · .env.example
```

**Structure Decision**: Monolito Next.js de um único pacote. Fronteiras de modificação
para agências: `src/lib/ai/` (trocar o cérebro), `src/lib/meta/` (canal), `src/lib/db/schema`
(campos), `src/server/ai/prompts.ts` (comportamento). Os mocks ficam sob `src/app/api/dev/`
com guard de produção único.

## Complexity Tracking

Sem violações constitucionais a justificar.
