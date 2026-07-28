# Vocero CRM — Guia para Claude

Vocero é um CRM de WhatsApp open source (MIT), self-hosted, com agente de IA e
Laboratório de autoavaliação. Uma instância = um negócio. Este arquivo orienta o
Claude Code (ou outro assistente) para operar e **modificar** este repositório —
o caso típico: uma agência adaptando o Vocero para um cliente.

## Stack

**Next.js 15 (App Router) + React 19** em monolito · TypeScript estrito
(`strict` + `noUncheckedIndexedAccess`) · Tailwind CSS (tema escuro próprio,
cor de destaque `#25D366`) · **PostgreSQL + Drizzle ORM** (migrações versionadas em
`drizzle/`, aplicadas ao INICIAR o container) · **Better Auth** + plugin
organization · **Zod** em toda entrada externa · nanoid com prefixos (`ct_`,
`cv_`, `msg_`…) · pnpm · Vitest (unit) + roteiros E2E em `tests/e2e/`
conduzidos com Playwright · Docker multi-stage (standalone, healthcheck
`/api/health`) · deploy no Coolify (Rota A) ou docker compose + Caddy (Rota B).

Tempo real via **SSE** (`/api/events`): heartbeat `: ping` ~25s, headers
anti-buffering, catch-up por refetch com `since=`. Sem WebSockets, sem filas
externas: o trabalho em segundo plano (agente, Laboratório) é in-process.

## Mapa do código (fronteiras de modificação)

| Quer mudar… | Mexa em… |
|---|---|
| O cérebro/provedor LLM | `src/lib/ai/` (adaptador compatível com OpenRouter, `chatJson<T>`) |
| O comportamento/prompt do agente | `src/server/ai/prompts.ts` |
| As ações que o agente pode tomar | `src/server/ai/actions.ts` + execução em `src/server/ai/pipeline.ts` |
| As personas ou o juiz do Laboratório | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| O canal WhatsApp oficial (Graph API) | `src/lib/meta/` (cliente único) + `src/server/whatsapp/` |
| O canal WhatsApp não oficial (motor Baileys nativo) | `src/server/baileys/` (conexão direta ao protocolo, sem gateway de terceiros) |
| Campanhas (disparo em massa, oficial e não oficial) | `src/server/campaigns/` + `src/lib/campaigns/` (roadmap em andamento) |
| Campos/tabelas | `src/lib/db/schema.ts` → `pnpm db:generate` → migração nova em `drizzle/` |
| A ingestão/envio de mensagens | `src/server/inbox/` (ingest idempotente, send com guard de sandbox, janela de 24h) |
| UI | `src/components/` + `src/app/(app)/` |

Os mocks do ambiente de testes vivem em `src/app/api/dev/` (wa-mock +
ai-mock) atrás de um gate único (`src/lib/dev-guard.ts`): 404 incondicional em
produção.

## Regras da constituição (não negociáveis)

Veja [.specify/memory/constitution.md](.specify/memory/constitution.md).

- **Soberania (II, v2.0.0)**: dependências de runtime SOMENTE canal WhatsApp —
  Cloud API oficial e/ou canal não oficial (Baileys/Evolution), coexistindo por
  organização — + provedor LLM compatível com OpenRouter opcional. PROIBIDO na
  v1 introduzir S3/R2, e-mail, Stripe, Google ou outros serviços externos. Auth e
  BD self-hosted. O canal não oficial é risco de conta, não fuga de
  soberania — é governado com guardrails (ver Princípio IX), não é proibido.
- **Foco Vertical (VIII, v2.0.0)**: admite-se disparo em massa (Campanhas,
  oficial e não oficial) como extensão de "converter conversas". Continua
  fora: scraping de números, fluxos visuais genéricos.
- **Segurança (I)**: segredos cifrados em repouso (AES-256-GCM, `lib/crypto`);
  jamais ao cliente nem a logs. O token do WhatsApp só mostra os últimos 4 dígitos.
- **Multi-tenancy (III)**: `organization_id` NOT NULL em toda tabela de domínio;
  toda query passa por `scoped()` de `src/lib/db/tenant.ts`.
- **Idempotência (IV)**: webhooks com dedup por `wa_message_id` UNIQUE; estados
  monotônicos; seeds e migrações re-executáveis.
- **Sandbox do Laboratório**: as conversas `is_test` JAMAIS tocam a API
  real — o sender lança exceção (não "conserte": é um guardrail).
- **Canal não oficial como feature (IX, v2.0.0)**: toda campanha/disparo pelo
  canal não oficial MUST advertir o risco de ban na UI antes de confirmar, e
  o intervalo entre envios MUST ser configuração editável, nunca um valor
  fixo no código.

## Variáveis de ambiente

Veja `.env.example` (cada uma com guia inline). As principais: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN` (segmento secreto do webhook), `META_APP_SECRET`
(opcional, assinatura), e para IA:

```bash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juez más barato
```

Para o self-test local existe também o modo de testes interno (mocks) —
veja `specs/001-vocero-core/quickstart.md`. Nunca ative mocks em produção.

## Gerenciamento de credenciais (obrigatório)

Quando uma feature precisar de uma variável/credencial nova: (1) adicione-a ao
`.env` como placeholder `REEMPLAZA_...` (append), (2) deixe um guia inline `#` de
como obtê-la, (3) resuma no chat e continue. `.env` está no gitignore; para
o deploy, as vars também vão na plataforma de hospedagem (runtime, não build).

## Definição de Pronto REFORÇADA (obrigatória)

"Typecheck + lint + build (+ tests)" é o piso, NÃO o teto. Uma feature não
está "Pronta" até rodar o **self-test de COMPORTAMENTO de ponta a ponta**
(Playwright + mocks: `WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock,
`OPENROUTER_BASE_URL` → ai-mock) e deixá-lo verde: fluxo real como usuário,
resultado observável, e o caminho infeliz degradando sem travar. Proibido
delegar o teste ao usuário. Se algo depender de um LLM/provedor externo,
todo turno tolera formato inesperado com extração robusta + retentativas — um
soluço do provedor nunca derruba o turno. Ao detectar uma falha: diagnostique,
corrija e reverifique você mesmo até ficar verde (loop de autocorreção).

Gate técnico:

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

Roteiros E2E por história em `tests/e2e/*.md`.

## Modo Objetivo — Loop SDD

Quando o dono dá uma META (não prompts passo a passo): Discover → Plan →
Execute → Verify → Iterate, de forma autônoma, voltando só com o objetivo
verificado ao vivo ou com um bloqueio real (decisão de produto, credenciais,
ação irreversível/custosa). Agrupe TODAS as perguntas bloqueantes no início.
O estado durável são os artefatos SDD em `specs/` (spec/plan/tasks) —
mantenha-os atualizados. Invocável como `/loop-sdd <objetivo>`.

## Memória persistente

Memória de arquivos em `memory/` (índice `memory/MEMORY.md`, carregado por
sessão). Persiste decisões, gotchas e correções; não duplique o que o
repo já registra. Os subagentes com `memory: project` usam
`.claude/agent-memory/`.

## Arquitetura de agentes

1. **Orquestrador** = a sessão principal do Claude Code (este CLAUDE.md + skill
   `loop-sdd`).
2. **Subagentes** (`.claude/agents/`): `deploy-ops` (deploy/logs/healthchecks,
   não escreve código de app) · `public-site-builder` (páginas públicas/legais
   e config de painéis externos).
