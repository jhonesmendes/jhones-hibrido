# Tasks: Vocero CRM — Núcleo v1

**Input**: Design documents from `/specs/001-vocero-core/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: A spec exige testes unitários enumerados (FR-080s / Definição de Hecho) e
self-test E2E conduzido com Playwright → SIM, são geradas tarefas de teste, colocadas dentro
da fase de sua história. Os E2E são roteiros em `tests/e2e/` que o agente conduz via
Playwright MCP (checkpoint de cada fase).

**Organization**: Fases por user story em ordem de prioridade da spec:
US1, US2 (MVP gate) → US3, US4, US5, US8 (núcleo P1) → US6 (P2) → US7 (P3) → Polish.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizável (arquivos distintos, sem dependências pendentes)
- **[Story]**: US1..US8 conforme spec.md

## Phase 1: Setup

**Purpose**: Projeto Next.js 15 inicializado com o stack fixado (DV-VC-14)

- [X] T001 Scaffold Next.js 15 App Router + React 19: package.json (pnpm fixado, `"type":"module"`, versões DV-VC-14), tsconfig.json (`strict` + `noUncheckedIndexedAccess`), next.config.ts (`output: 'standalone'`), src/app/layout.tsx + page.tsx mínimos
- [X] T002 [P] Tailwind CSS + shadcn/ui: tailwind.config.ts, src/app/globals.css com tema escuro premium próprio (acento `#25D366`), components.json, primitivas base em src/components/ui/
- [X] T003 [P] ESLint + scripts `typecheck`/`lint`/`build`/`test` em package.json, eslint.config.mjs
- [X] T004 [P] docker-compose.dev.yml com Postgres 16 local (porta 5432, volume)
- [X] T005 [P] Vitest: vitest.config.ts + tests/unit/smoke.test.ts
- [X] T006 .env.example com placeholders `REEMPLAZA_...` + guia inline por bloco (SEM `WA_MOCK_ENABLED`); verificar `.env` no .gitignore
- [X] T007 [P] src/lib/env.ts — getEnv() lazy+memoizada com Zod, BUILD_PLACEHOLDERS se `NEXT_PHASE === 'phase-production-build'` (DV-VC-10)
- [X] T008 [P] src/lib/db/ids.ts — nanoid com prefixos (ct_, cv_, msg_, ld_, stg_, cred_, agp_, kb_, tpl_, run_, case_)

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` verde no esqueleto

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: BD, auth, criptografia, cliente Graph, credenciais, bus SSE — nenhuma US pode começar sem isso

**⚠️ CRITICAL**: bloqueia todas as user stories

- [X] T009 Schema Drizzle completo em src/lib/db/schema.ts conforme data-model.md (~15 tabelas, `organization_id` NOT NULL + índices org-first, UNIQUEs: contact(org,phone), lead(contact_id), conversation parcial (org,contact) WHERE is_test=false, message(wa_message_id), meta_credentials(org / phone_number_id), agent_test_run parcial (org) WHERE status='running', template(org,name,language))
- [X] T010 drizzle.config.ts + migração inicial gerada em drizzle/ (`pnpm db:generate`, `pnpm db:migrate` com drizzle-kit para dev)
- [X] T011 src/lib/db/index.ts (cliente postgres-js) + src/lib/db/tenant.ts (helpers de escopo por organização, obrigatórios em toda query de domínio)
- [X] T012 Better Auth + plugin organization: src/lib/auth/index.ts, src/lib/auth/session.ts (helper requireSession → org ativa), src/app/api/auth/[...all]/route.ts
- [X] T013 Cadastro cria org + owner + etapas semente do pipeline (Novo→Em conversa→Interessado→Cliente[won]→Perdido[lost]) em src/server/auth/on-signup.ts
- [X] T014 Páginas (auth): src/app/(auth)/login/page.tsx + src/app/(auth)/register/page.tsx
- [X] T015 Shell autenticado src/app/(app)/layout.tsx: navegação lateral (Caixa de entrada, Pipeline, Contatos, Agente, Laboratório, Configuração), guard de sessão, tema escuro
- [X] T016 [P] src/lib/crypto/index.ts — AES-256-GCM (chave 32B a partir de ENCRYPTION_KEY base64, IV 12B, cipher/iv/tag separados) (DV-VC-05)
- [X] T017 [P] tests/unit/crypto.test.ts — roundtrip, tag inválida lança, chave malformada lança
- [X] T018 [P] src/lib/meta/client.ts — graphRequest tipado sobre `META_GRAPH_BASE_URL`/versão, MetaApiError, detecção 401/code 190/OAuthException → reconnect_required (DV-VC-13), normalizeRecipient MX 521→52 (DV-VC-12)
- [X] T019 [P] tests/unit/meta-client.test.ts — normalizeRecipient (521..13díg → 52+10, outros intactos) e mapeamento erro 190
- [X] T020 src/server/whatsapp/credentials.ts — salvar criptografado, getByPhoneNumberId, getByOrg, estado (connected / reconnect_required / none), last4
- [X] T021 src/server/events/bus.ts (EventEmitter in-process por org, publish após commit) + src/app/api/events/route.ts (SSE contrato sse.md: headers exatos, heartbeat 25s, force-dynamic) (DV-VC-01)
- [X] T022 [P] src/app/api/health/route.ts — `{ ok: true }` + check de BD
- [X] T023 src/lib/dev-guard.ts — gate dos mocks (`WA_MOCK_ENABLED==='true' && NODE_ENV !== 'production'` → se não 404) + tests/unit/dev-guard.test.ts (mocks em prod → 404)

**Checkpoint**: cadastro→login→shell navegável; /api/health ok; gate verde

---

## Phase 3: User Story 1 — Caixa de entrada de WhatsApp em tempo real (Priority: P1) 🎯 MVP

**Goal**: mensagens recebidas visíveis ≤2s via SSE; responder dentro da janela de 24h; dedup idempotente

**Independent Test**: com número conectado (mock), `POST wa-mock/inbound` → mensagem visível na caixa de entrada aberta ≤2s sem atualizar a página; responder → aparece no outbox do mock; mesmo waMessageId 2 vezes → uma única mensagem; janela fechada → input bloqueado com oferta de template

- [X] T024 [US1] src/app/api/webhooks/wa/[webhookToken]/route.ts — GET handshake (hub.mode/verify_token/challenge; segmento timing-safe vs META_WEBHOOK_VERIFY_TOKEN, se não → 404 sem efeitos) (contrato webhook.md)
- [X] T025 [US1] Webhook POST na mesma rota: ler body CRU, camada 2 assinatura `x-hub-signature-256` só se META_APP_SECRET (inválida → 401), responder 200 sempre, processar em `after()`, rotear por `metadata.phone_number_id` / `entry[].id` (DV-VC-02/03)
- [X] T026 [P] [US1] tests/unit/webhook.test.ts — assinatura válida/inválida/sem secret, segmento incorreto → 404 sem side effects
- [X] T027 [US1] src/server/inbox/ingest.ts — resolver org por phone_number_id, getOrCreateContact (UPSERT org+phone, coalesce nome), getOrCreateConversation (não-teste), inserir message `.onConflictDoNothing({target: wa_message_id}).returning()` → isNew gate, unread_count+last_inbound_at/last_message_at, mídia recebida = chip por tipo, publish SSE `message.new`/`conversation.updated`
- [X] T028 [US1] src/server/inbox/status.ts — statuses do webhook com upgrades monotônicos (pending<sent<delivered<read; failed sempre) + SSE `message.status`
- [X] T029 [P] [US1] tests/unit/ingest.test.ts — dedup por wa_message_id (2ª ingestão não redispara) e monotonicidade de status
- [X] T030 [US1] src/server/inbox/window.ts — janela de 24h desde last_inbound_at (isOpen, remaining) + tests/unit/window.test.ts (borda exata 24h)
- [X] T031 [US1] src/server/inbox/send.ts — **asserção rígida: conversa `is_test` → throw antes de qualquer chamada à Graph**; check da janela; enviar texto via lib/meta; persistir out+pending com wa_message_id devolvido; SSE
- [X] T032 [P] [US1] tests/unit/send-sandbox.test.ts — send com is_test lança e NÃO invoca o cliente Graph (spy)
- [X] T033 [US1] APIs: GET /api/conversations?since= (exclui is_test), GET/POST /api/conversations/[id]/messages (POST texto → 409 janela fechada), PATCH /api/conversations/[id] ({aiEnabled, reactivate}) em src/app/api/conversations/
- [X] T034 [US1] wa-mock completo sob src/app/api/dev/wa-mock/ — inbound (payload real assinado com META_APP_SECRET, POST loopback 127.0.0.1, overrides waMessageId/timestamp), status, template-status, graph/[...path] (messages→outbox+wamid.mock, GET número com token `-invalid`→401 code 190, message_templates→PENDING), outbox GET/DELETE (contrato mocks.md)
- [X] T035 [US1] UI caixa de entrada 3 colunas em src/app/(app)/inbox/ — lista de conversas (avatar iniciais cor estável, badge não lidas, hora), thread (balões in/out, estados ✓, chips de mídia, marca `ai_generated`), painel do contato (dados, etapa, toggle IA, notas)
- [X] T036 [US1] src/components/use-events.ts — hook EventSource: assinatura tipada, no `open` após reconexão refetch com `since=` (catch-up do contrato sse.md)
- [X] T037 [US1] Janela na UI: indicador de tempo restante; fechada → composer bloqueado oferecendo templates aprovados (estado vazio se não houver) em src/app/(app)/inbox/
- [X] T038 [US1] Roteiro E2E tests/e2e/us1-inbox.md + executá-lo com Playwright: cadastro→conectar mock→inbound visível ≤2s→responder→outbox→dedup→janela vencida (timestamp override) → 409 + composer bloqueado

**Checkpoint**: US1 funcional E2E contra wa-mock

---

## Phase 4: User Story 2 — Contatos e pipeline kanban (Priority: P1) 🎯 MVP

**Goal**: contato+lead auto-registrados na primeira mensagem; kanban drag&drop persistente

**Independent Test**: inbound de número novo → aparece em Contatos e como card em "Novo"; arrastar para outra etapa → persiste após recarregar

- [X] T039 [US2] Auto-registro de lead na primeira conversa (etapa "Novo", position no final) integrado em src/server/inbox/ingest.ts
- [X] T040 [US2] APIs contatos: GET (?q= busca nome/telefone) / POST / PATCH (notas, arquivar) em src/app/api/contacts/
- [X] T041 [US2] APIs pipeline: CRUD etapas (DELETE exige moveTo; âncoras won/lost não excluíveis), PATCH /api/pipeline/leads/[id] {stageId, position} em src/app/api/pipeline/
- [X] T042 [P] [US2] UI contatos src/app/(app)/contacts/ — tabela com busca, edição de notas, arquivar, link para conversa
- [X] T043 [US2] UI kanban src/app/(app)/pipeline/ com @dnd-kit — colunas por etapa, cards (nome, última mensagem, tempo), drag&drop persiste via PATCH, gestão de etapas
- [X] T044 [P] [US2] tests/unit/tenant.test.ts — queries de contatos/conversas/leads jamais cruzam organization_id
- [X] T045 [US2] Roteiro E2E tests/e2e/us2-pipeline.md + executá-lo: auto-registro, drag persiste após reload, busca

**Checkpoint 🎯 GATE MVP**: US1+US2 E2E verdes ANTES de qualquer linha de US3+

---

## Phase 5: User Story 3 — Agente de IA com ações tipadas (Priority: P1)

**Goal**: agente responde com KB, uma ação tipada por turno, handoff confiável

**Independent Test**: com ai-mock, inbound → resposta do agente marcada IA; "quero falar com um humano" → handoff (IA off + conversa destacada); intenção de compra → lead para "Interessado"

- [X] T046 [US3] src/lib/ai/index.ts — adaptador compatível com OpenRouter: chatJson<T> (3 tentativas, instrução STRICT ao repetir, extractJson fence/chaves balanceadas, Zod, erro tipado, jamais logar key), envs com defaults (JUDGE_MODEL = MODEL); sem token → capability off (DV-VC-06)
- [X] T047 [P] [US3] tests/unit/ai-adapter.test.ts — extractJson (fence, texto ao redor, JSON sujo), retentativa diante de inválido, saída erro tipada sem exceção
- [X] T048 [US3] APIs: GET/PUT /api/agent/profile, CRUD /api/kb + GET /api/kb/size em src/app/api/agent/ e src/app/api/kb/
- [X] T049 [US3] UI src/app/(app)/agent/ — seção Comportamento (nome, tom, instruções, toggle global) + seção Knowledge base (entradas qa/block, contador de tamanho); estado vazio claro sem OPENROUTER_API_TOKEN
- [X] T050 [US3] src/server/ai/prompts.ts — builder do system prompt (comportamento + KB + etapas + regras de ação JSON) e prompt do juiz com marcador `[JUEZ]`
- [X] T051 [US3] src/server/ai/actions.ts — AgentAction (contrato ai.md), execução server-side: move_stage fuzzy contra etapas da org (sem match → degradar reply/none), update_lead → nota, handoff → flags na conversa
- [X] T052 [US3] src/server/ai/handoff.ts — regex de respaldo ANTES do LLM + tests/unit/handoff.test.ts (matches positivos + **"somos 4 pessoas" NÃO combina**)
- [X] T053 [US3] src/server/ai/pipeline.ts — coalesce Map {timer,running,pending} por conversa (AGENT_COALESCE_MS, 6s prod / 0 lab), lock, re-run se pending, condições (IA global+conversa on, sem handoff), janela fechada/erro persistente → handoff automático (reason ventana|error), mensagens enviadas ai_generated, SSE (DV-VC-07)
- [X] T054 [US3] ai-mock src/app/api/dev/ai-mock/chat/completions/route.ts — despacho por conteúdo (contrato mocks.md: [JUEZ]→veredictos fixos, frase humano→handoff, compra→move_stage Interessado, default reply eco), shape OpenRouter, controlado por dev-guard
- [X] T055 [US3] Roteiro E2E tests/e2e/us3-agent.md + executá-lo contra ai-mock: reply IA, handoff por frase (+ badge e toggle off), move_stage reflete no kanban, sem token → estados vazios

**Checkpoint**: agente E2E verde com ai-mock

---

## Phase 6: User Story 4 — Laboratório de auto-avaliação (Priority: P1) ⭐

**Goal**: 6 personas roteirizadas contra o pipeline REAL em sandbox, juiz LLM, relatório acionável com sugestões de 1 clique

**Independent Test**: lançar execução com ai-mock → 6 casos com progresso ao vivo → relatório com score + achado `fuera_de_kb` vermelho → aplicar sugestão → executar novamente → score sobe; outbox do wa-mock permanece VAZIO

- [X] T056 [US4] src/server/lab/personas.ts — 6 personas fixas roteirizadas (comprador_decidido, pregunton_precios, cliente_enojado, fuera_de_kb, pide_humano, errores_modismos; 4–5 mensagens cada; sem LLM)
- [X] T057 [US4] src/server/lab/runner.ts — execução in-process fire-and-forget: criar run+6 cases, por caso criar conversa `is_test=true` + contato sintético, turnos sequenciais (mensagem → pipeline real debounce 0 → aguardar resposta), fim do roteiro ou handoff → juiz; progresso SSE `lab.run`; timeout 10 min → failed (DV-VC-08)
- [X] T058 [US4] src/server/lab/judge.ts — UMA chamada por conversa via chatJson (Verdict de ai.md), retentativas do adaptador, inválido no final → case judge_failed (visível, excluído do score); score = round(100*(verdes+0.5*amarillos)/casos_con_veredicto)
- [X] T059 [US4] src/instrumentation.ts — no boot marcar runs `running` órfãos → failed
- [X] T060 [US4] APIs: POST /api/lab/runs (409 se houver running pelo índice parcial UNIQUE), GET /api/lab/runs (histórico + delta score), GET /api/lab/runs/[id] (detalhe+progresso), POST /api/lab/suggestions/apply ({caseId,hallazgoIndex,pregunta,respuesta} → kb_entry) em src/app/api/lab/
- [X] T061 [US4] UI src/app/(app)/lab/ — botão lançar + subtítulo "Sandbox interno — não envia mensagens reais", progresso ao vivo (SSE), relatório (score 0-100, cards de achado por tipo com evidência, botão "Adicionar ao conhecimento" 1 clique), transcripts por persona, histórico com delta
- [X] T062 [P] [US4] tests/unit/judge.test.ts — saída inválida do juiz → retentativa → judge_failed excluído do denominador do score
- [X] T063 [P] [US4] tests/unit/lab-sandbox.test.ts — a execução completa jamais invoca o cliente Graph (spy sobre lib/meta)
- [X] T064 [US4] Roteiro E2E tests/e2e/us4-lab.md + executá-lo (SEMPRE ai-mock): execução→relatório→aplicar sugestão→re-run fecha o loop com score maior; outbox do wa-mock vazio no final

**Checkpoint**: Laboratório E2E verde e determinístico

---

## Phase 7: User Story 5 — Conexão do número (Priority: P1)

**Goal**: wizard direto/agência com "testar conexão" antes de salvar; webhook autenticado em duas camadas

**Independent Test**: wizard com IDs mock → testar conexão ok → salvar → estado conectado (last4); token `-invalid` → erro claro SEM salvar; página mostra URL completa do webhook e estado da camada de assinatura

- [X] T065 [US5] POST /api/settings/whatsapp/test — valida token↔número via `GET {phoneNumberId}?fields=display_phone_number,verified_name` (NÃO persiste; MetaApiError → mensagem acionável) em src/app/api/settings/whatsapp/test/route.ts
- [X] T066 [US5] GET/PUT /api/settings/whatsapp — salvar (revalidar → criptografar → upsert; depois `POST {WABA_ID}/subscribed_apps` best-effort DV-VC-04) / estado (connected, display number, last4, reconnect_required) em src/app/api/settings/whatsapp/route.ts
- [X] T067 [US5] GET /api/settings/webhook — URL completa `{APP_BASE_URL}/api/webhooks/wa/{token}`, verify token, estado camada 2 (META_APP_SECRET configurado ou aviso informativo) em src/app/api/settings/webhook/route.ts
- [X] T068 [US5] UI wizard src/app/(app)/settings/whatsapp/ — passos: (1) origem do token explicada em ambos os modos (direto: app própria da Meta; agência: Tech Provider com override por WABA), (2) WABA ID + Phone Number ID + token, (3) testar conexão (gate), (4) salvar + dados do webhook para colar na Meta; banner reconnect_required
- [X] T069 [US5] Tratamento de reconnect_required transversal: envios bloqueados com erro tipado + banner em Settings (tocar src/server/inbox/send.ts e settings UI)
- [X] T070 [P] [US5] tests/unit/credentials.test.ts — salvar criptografa (sem texto plano na linha), resposta da API só last4, 190 em teste → erro mapeado sem persistir
- [X] T071 [US5] Roteiro E2E tests/e2e/us5-connect.md + executá-lo: caminho feliz + token inválido + info do webhook visível

**Checkpoint**: núcleo conectável E2E; agente+lab+caixa de entrada operando sobre credenciais do wizard

---

## Phase 8: User Story 8 — Instalação em 15 minutos (Priority: P1)

**Goal**: Rota A (Coolify+MCP guiada por INSTALL-IA.md) e Rota B (compose+Caddy); seed demo; docs públicas

**Independent Test**: `DOMAIN=localhost docker compose up -d --build` → https://localhost serve, cadastro→demo→caixa de entrada funcional, SSE ≤2s através do Caddy

- [X] T072 [US8] scripts/migrate.mjs (drizzle migrator, max:1, onnotice silencioso, MIGRATIONS_DIR relativo) + bundle esbuild no build do Docker + script pnpm `db:migrate:prod` (DV-VC-11)
- [X] T073 [US8] Dockerfile multi-stage node:22-alpine — corepack pnpm, build standalone, `CMD ["sh","-c","node migrate.mjs && node server.js"]`, HEALTHCHECK /api/health start-period 40s
- [X] T074 [US8] docker-compose.yml (app + postgres16 + caddy com `{$DOMAIN}`, healthchecks, depends_on condition) + Caddyfile (reverse_proxy, sem buffering extra)
- [X] T075 [US8] Seed "Ferretería El Martillo": scripts/seed/demo.mjs + POST /api/seed/demo + botão na UI (só BD de domínio vazia) — ~8 contatos MX, conversas com cotações MXN, pipeline populado, KB preenchida com lacunas INTENCIONAIS (garantias e devoluções), 1 execução de Laboratório de exemplo salva; idempotente (DELETE org demo por ordem de FKs)
- [X] T076 [US8] INSTALL-IA.md — guia para que uma IA (Claude Code + Coolify MCP) instale sozinha: pergunta SÓ domínio, token OpenRouter (opcional) e rota A/B; gera segredos com openssl; cria app+Postgres no Coolify; termina indicando que o WhatsApp se conecta em Settings
- [X] T077 [US8] README.md completo — pitch, features (Laboratório PRIMEIRO), instalação A/B, conexão do número (modo direto e **checklist de 5 passos do modo agência com diagrama de texto** + limitação de templates e sua sync), conformidade Meta (5 pontos), FAQ, roadmap, licença MIT, placeholders `[LINKS-KEVIN]`
- [X] T078 [P] [US8] LICENSE (MIT) + revisão de metadata pública do package.json (name vocero-crm, license MIT)
- [X] T079 [US8] Reescrever CLAUDE.md do repo para o usuário final (agência que modifica com Claude Code): stack real sem colchetes, fronteiras de modificação (lib/ai, lib/meta, schema, prompts), regras da constituição II endurecida (sem regra S3), envs com exemplo OPENROUTER_JUDGE_MODEL, metodologia de verificação
- [X] T080 [US8] Checkpoint E2E compose: build+up, https://localhost, cadastro→seed→inbound mock→**SSE ≤2s através do Caddy**, healthchecks verdes, logs sem segredos

**Checkpoint**: NÚCLEO NÃO NEGOCIÁVEL completo (US1–US5 + US8) — candidato a merge

---

## Phase 9: User Story 6 — Templates (Priority: P2)

**Goal**: criar template com `{{1}}`, aprovação Meta (webhook + sync), enviar com janela fechada

**Independent Test**: criar template → pending; wa-mock template-status APPROVED → badge aprovado; conversa com janela fechada → enviar template com variável → aparece no outbox com components

- [X] T081 [US6] src/server/whatsapp/templates.ts — create na Meta (`POST {WABA_ID}/message_templates`), countVariables (`/\{\{\s*(\d+)\s*\}\}/g`, máx 1), renderBody, buildSendComponents, syncTemplates pull (`GET {WABA_ID}/message_templates`, match por waTemplateId ou name+language), erros tipados → HTTP (DV-VC-15)
- [X] T082 [US6] APIs GET/POST /api/templates + POST /api/templates/sync; roteamento de `message_template_status_update` por `entry[].id` no webhook (upsert estado) em src/app/api/templates/ e webhook route
- [X] T083 [US6] UI templates em src/app/(app)/settings/templates/ — form (nome, idioma, categoria, body com um `{{1}}`), lista com badges de estado, botão Sincronizar (cobre modo agência), nota da limitação
- [X] T084 [US6] POST /api/conversations/[id]/messages/template ({templateId, variable}; só approved, valida variável) + integração no composer de janela fechada (T037) em src/app/api/conversations/ e inbox UI
- [X] T085 [P] [US6] tests/unit/templates.test.ts — countVariables (0, 1, {{2}} inválida, espaços), validação de envio (não aprovada → erro, variável faltando → erro)
- [X] T086 [US6] Roteiro E2E tests/e2e/us6-templates.md + executá-lo: ciclo completo criar→aprovar (mock)→enviar em janela fechada→outbox com components

**Checkpoint**: SEGUNDO ANEL completo

---

## Phase 10: User Story 7 — Multiusuário mínimo (Priority: P3)

**Goal**: cadastro fechado após a 1ª org; owner cria contas de equipe; rate limit de auth

**Independent Test**: 2º cadastro → bloqueado com mensagem clara; com ALLOW_SIGNUP=true → permitido; owner cria membro (email+senha temporária) e este entra; 11 logins falhados seguidos → 429

- [X] T087 [US7] Gate de cadastro: existe uma org → signup desabilitado salvo `ALLOW_SIGNUP=true` (server-side em on-signup/route + UI do cadastro) + tests/unit/registration.test.ts
- [X] T088 [US7] GET/POST /api/settings/team — listar membros; criar conta (owner only, email + senha temporária, papel member) via Better Auth admin API em src/app/api/settings/team/route.ts
- [X] T089 [P] [US7] UI equipe src/app/(app)/settings/team/ — lista, form de criação com senha temporária mostrada uma vez
- [X] T090 [US7] Rate limiter in-process por IP (janela deslizante 10 tentativas/10min → 429) aplicado a endpoints de auth em src/lib/rate-limit.ts + tests/unit/rate-limit.test.ts
- [X] T091 [US7] Roteiro E2E tests/e2e/us7-team.md + executá-lo: cadastro fechado, escape ALLOW_SIGNUP, criação e login de membro

**Checkpoint**: todas as user stories funcionais

---

## Phase 11: Polish, Verificação final e Entrega

**Purpose**: gate completo, self-test integral, smoke real condicional, higiene de repo público, merge

- [X] T092 Gate técnico completo verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` (todos os unit tests enumerados na spec presentes e verdes)
- [X] T093 Execução integral do self-test E2E: todos os roteiros tests/e2e/us1..us7 contra `pnpm dev` E verificação-chave repetida contra compose+Caddy (SSE ≤2s, webhook, seed) — caminhos infelizes incluídos
- [X] T094 Smoke test real CONDICIONAL (há credenciais Meta reais no .env): conexão real do número, webhook real (ou override), 1 recebida/enviada real, 1 execução de Laboratório com modelo real via OpenRouter — documentar evidência
- [X] T095 Auditoria de vazamentos OBRIGATÓRIA: `git log -p` + working tree, grep por nomes privados, domínios internos e caminhos de máquina local; hits no histórico → reescrever histórico antes de reportar; verificar .mcp.json/.claude sem dados privados
- [X] T096 [P] Capturas de tela para README em docs/screenshots/ (caixa de entrada, kanban, Laboratório-relatório, wizard) — DIFERÍVEL
- [X] T097 Lista "pendente de verificação humana" + relatório final (verde com evidência / diferido com instruções / roadmap) no chat
- [X] T098 Merge `001-vocero-core` → `main` (merge normal, manter branch — OK explícito já dado), validar com /speckit-git-validate, deixar `main` ativa

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → bloqueia todo o resto
- **US1 (3)** → **US2 (4)**: 🎯 GATE MVP — E2E verdes antes de US3+
- **US3 (5)** → **US4 (6)**: o Laboratório consome o pipeline real do agente
- **US5 (7)**: independente após Foundational (T020 credenciais); seu E2E usa wa-mock (T034)
- **US8 (8)**: requer US1–US5 para o checkpoint compose completo; T072–T074 podem começar antes
- **US6 (9)**: requer webhook (US1) e credenciais (US5); composer fechado integra com T037
- **US7 (10)**: só Foundational (auth)
- **Polish (11)**: tudo o anterior

### Story Dependencies notáveis

- T039 (lead auto-create) toca ingest.ts de US1 → sequencial após T027
- T084 (enviar template) completa o estado vazio deixado por T037
- T053 (pipeline agente) é a dependência forte de T057 (runner do lab)

### Parallel Opportunities

- Setup: T002–T005, T007, T008 em paralelo após T001
- Foundational: T016–T019, T022 em paralelo; T009→T010→T011 sequencial
- Unit tests marcados [P] em paralelo com a UI de sua fase
- T042 (contatos UI) ∥ T043 (kanban); T072–T074 ∥ US6/US7

---

## Implementation Strategy

1. **MVP primeiro**: Fases 1–4 → gate US1+US2 E2E verde (parar e validar).
2. **Núcleo P1**: Fases 5–8 em ordem (agente → lab → conexão → instalação); checkpoint E2E ao final de cada uma; commit atômico por fase.
3. **Anéis**: Fase 9 (US6), Fase 10 (US7) — diferíveis só se o orçamento se esgotar, reportando.
4. **Entrega**: Fase 11 completa; merge para main só com núcleo verde verificado.

## Notes

- Todo texto de produto em português neutro; tema escuro próprio com acento #25D366.
- Mocks só sob src/app/api/dev/ com dev-guard; `WA_MOCK_ENABLED` jamais no .env.example.
- Repo público: zero segredos/nomes privados em código, seeds, docs e commits.
- E2E do Laboratório SEMPRE contra ai-mock (determinismo); smoke real à parte (T094).
