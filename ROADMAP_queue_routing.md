# Vocero CRM — Roadmap: Sistema de Fila e Roteamento de Atendimento
## Sprint Q — Queue & Routing

> **Princípio:** Cada departamento é configurado independentemente.
> Nenhum valor de roteamento, tempo ou mensagem é fixo no código.
> O agente só vê as conversas que lhe foram atribuídas OU que pertencem
> a um departamento do qual é membro **depois que a fila roteou** (ver
> "Decisão de visibilidade" abaixo — é o ponto que mudou nesta revisão).

> **Revisão (2026-08-03):** este documento foi reescrito depois de uma
> auditoria contra o estado real do código, feita numa sessão em que
> também corrigimos a visibilidade de conversas por departamento
> (`src/lib/auth/require-permission.ts`, `src/server/inbox/queries.ts`,
> `src/server/inbox/ingest.ts`). A versão original assumia um modelo de
> visibilidade que **conflitava** com essa correção. As mudanças de fundo
> em relação à v1 estão marcadas com 🔧 ao longo do documento.

---

## 🔧 Decisão de visibilidade (resolve o conflito da v1)

A v1 deste roadmap assumia: *"a conversa só aparece para o agente APÓS
`assigned_to` ser definido... antes disso, fica em `conversation_queue`
e não aparece na caixa de entrada de nenhum agente (exceto admin)."*

Isso deixou de ser verdade quando corrigimos a visibilidade por
departamento: hoje, **qualquer membro de um departamento vê toda
conversa com aquele `department_id`, atribuída ou não** — foi uma
correção deliberada (o objetivo era "membro do departamento vê toda
mensagem do número do depto", sem precisar de atribuição individual).

Se a fila escrevesse `conversation.department_id` imediatamente na
ingestão (como qualquer conversa hoje), a fila viraria decorativa: todo
mundo do depto já veria a conversa antes de qualquer roteamento, dois
agentes poderiam responder a mesma conversa em paralelo, e o Modo B
(cliente escolhe o agente) perderia sentido — o agente já estaria vendo
a thread antes do cliente escolher.

**Resolução adotada:** um departamento com fila **ativa**
(`department.queue_enabled = true`) tem um comportamento diferente de
ingestão:

```
department.queue_enabled = false (default — comportamento atual)
  → ingest.ts grava conversation.department_id direto (sticky, como já
    é hoje). Membros do depto veem a conversa assim que ela existe.
    NENHUMA mudança para quem não ativar fila.

department.queue_enabled = true
  → ingest.ts NÃO grava conversation.department_id na ingestão.
  → Cria/atualiza uma linha em conversation_queue (status='waiting' ou
    'selecting', conforme routing_mode).
  → A conversa fica invisível na Caixa de Entrada normal para quem não
    tem conversations:view_all (ou seja, agentes comuns do depto NÃO
    veem ainda) — só aparece na tela dedicada "Fila" (admin do depto /
    owner / quem tem view_all).
  → Só quando queue/manager.ts (Modo A) ou a escolha do cliente + aceite
    do agente (Modo B) resolve o roteamento, o sistema grava
    conversation.department_id + conversation.assigned_to no MESMO
    UPDATE atômico — a partir daí a conversa aparece normalmente na
    Caixa de Entrada de quem foi designado (e de quem tem view_all do
    depto, se for esse o caso).
```

Isso **não exige nenhuma mudança** em `require-permission.ts` ou
`queries.ts` além do que já fizemos — só muda o *momento* em que
`ingest.ts` escreve `department_id`, condicionado a
`department.queue_enabled`. Departamentos sem fila continuam
funcionando exatamente como hoje.

---

## 🔧 Gaps encontrados na auditoria (precisam ser resolvidos, nesta ordem)

1. ✅ **Resolvido (Sprint Q2). `conversations:view_assigned` era um checkbox decorativo.** Existia em
   `src/lib/auth/permissions.ts` e aparece na UI de edição de membro, mas
   `resolvePermissions`/`requireConversationAccess`
   (`src/lib/auth/require-permission.ts`) nunca leem essa permissão — só
   checam a *ausência* de `conversations:view_all`. Hoje isso não causa
   bug visível porque o comportamento default (sem view_all → só vê o
   atribuído) já é o que `view_assigned` prometia. Mas antes de a fila
   depender de "agente só vê o que é dele" como regra de verdade, vale
   simplificar: ou remover `conversations:view_assigned` da lista de
   permissões (é redundante), ou implementar de fato. Recomendo remover
   — não é bloqueante para o Sprint Q1, mas é dívida a resolver antes do
   Q2.
2. **Push e SSE são broadcast de organização, sem "dono".**
   `sendPushToOrganization` (`src/server/push/send.ts`) documenta
   explicitamente "não há dono de conversa hoje" e o bus SSE
   (`src/server/events/bus.ts`) só tem canal por organização. O Sprint Q2
   (toast dirigido a um agente específico) precisa de
   `sendPushToMember(memberId, payload)` e um evento SSE com
   `targetMemberId` filtrado no cliente. Não existe hoje — a criar no Q2.
3. **Corrida no "Aceitar".** Dois agentes aceitando a mesma conversa da
   fila ao mesmo tempo precisa de um claim atômico
   (`UPDATE conversation_queue SET status='accepted' WHERE status='assigned' AND assigned_to=$1 RETURNING`),
   senão os dois "ganham". Já existe esse padrão exato em
   `src/server/auth/password-reset.ts::consumePasswordReset` — reaproveitar
   a mesma técnica no Sprint Q2.
4. **IA genérica vs. mensagem determinística do Modo B.**
   `maybeRunAgentTurn` (`src/server/ai/pipeline.ts`) roda automaticamente
   em toda mensagem individual (só é silenciado por `handoffAt`/
   `aiEnabled`), e depende de `OPENROUTER_API_TOKEN` estar configurado
   (Princípio II: IA é **opcional**). A saudação/menu do Modo B **não
   pode depender de LLM** — tem que ser um template determinístico
   (`selection_greeting` com `{{nome}}`, igual ao `config.message` do
   follow-up em `src/server/pipeline/followup-scheduler.ts`), disparado
   por `queue/selection.ts`, e precisa "vencer" `maybeRunAgentTurn` (rodar
   antes/no lugar dele quando há uma seleção pendente) independente de
   IA configurada ou não.
5. **Sandbox do Laboratório não mencionado na v1.** Nenhum fluxo pode
   tocar `conversation_queue`/notificações reais quando
   `conversation.is_test = true` — mesmo guardrail que já existe pro
   sender (`sandbox_violation`). A adicionar como condição de entrada em
   `queue/manager.ts` e `queue/selection.ts` desde o Sprint Q2.
6. **`business_hours` sem fuso horário.** Nem `organization` nem
   `department` têm timezone hoje. Um `jsonb` com `"08:00"` é ambíguo.
   Decisão adiada para o Sprint Q3 (quando o Cenário 6 é implementado) —
   a coluna é criada agora (nullable, sem uso) mas a UI de horário de
   funcionamento só entra quando essa decisão for tomada.
7. 🔧 **`agent_status` por membro, não por (membro, departamento).** A v1
   modelava `agent_status` com `department_id NOT NULL` (uma linha por
   membro *por depto*). Isso quebra para organizações sem departamento
   nenhum (o caso comum/default hoje) e não bate com o mockup de UI da
   própria v1, que mostra **um único seletor global** de status na
   sidebar (`[● Online ▾]`), não um por departamento. Nesta revisão,
   `agent_status` é uma linha por membro (status org-wide); a
   elegibilidade "está no depto certo" é resolvida separadamente via
   `member_department` no momento do roteamento. `max_conversations`
   também vira um teto global do agente, não por depto (pode ser
   refinado depois se precisar).

---

## Dois Modos de Roteamento (configurável por departamento)

```
Modo A — Automático
  Sistema distribui a conversa sem interação do cliente
  Bom para: alto volume, muitos agentes

Modo B — Seleção pelo Cliente
  IA saúda e pergunta com qual agente deseja falar
  Bom para: equipes menores, atendimento personalizado
```

---

## Schema (🔧 revisado)

```sql
-- Status de presença do agente — UMA linha por membro (org-wide, não por
-- departamento; ver gap #7 acima).
CREATE TABLE "agent_status" (
  "id" text PRIMARY KEY,
  "member_id" text NOT NULL UNIQUE REFERENCES "member"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'offline',
  -- offline | online | busy | away
  "max_conversations" integer NOT NULL DEFAULT 5,
  "current_conversations" integer NOT NULL DEFAULT 0,
  "last_seen_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Fila de atendimento
CREATE TABLE "conversation_queue" (
  "id" text PRIMARY KEY,
  "conversation_id" text NOT NULL REFERENCES "conversation"("id") ON DELETE CASCADE,
  "department_id" text NOT NULL REFERENCES "department"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'waiting',
  -- waiting | selecting | assigned | accepted | abandoned | expired
  "assigned_to" text REFERENCES "member"("id"),
  "assigned_at" timestamp,
  "accepted_at" timestamp,
  "timeout_at" timestamp,
  "attempt" integer NOT NULL DEFAULT 1,
  "position" integer,
  "selection_sent_at" timestamp,   -- quando IA enviou as opções (Modo B)
  "client_choice" text,            -- o que o cliente digitou (Modo B)
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Configurações de roteamento por departamento
ALTER TABLE "department"
  -- 🔧 opt-in explícito — sem isso, TODO departamento existente herdaria
  -- "fila ativa" com o default de routing_mode, quebrando o comportamento
  -- atual (violaria "sem quebrar o que existe", Sprint Q1 item 0).
  ADD COLUMN "queue_enabled" boolean NOT NULL DEFAULT false,

  -- Modo de roteamento
  ADD COLUMN "routing_mode" text NOT NULL DEFAULT 'automatic',
  -- automatic | client-selection

  -- Modo A — Automático
  ADD COLUMN "distribution_mode" text DEFAULT 'round-robin',
  -- round-robin | least-busy | first-available | manual

  -- Modo B — Seleção pelo cliente
  ADD COLUMN "selection_greeting" text,
  -- "Olá {{nome}}! Com qual atendente deseja falar?"
  ADD COLUMN "selection_format" text DEFAULT 'numbered',
  -- numbered (1. João) | letters (A. João)
  ADD COLUMN "selection_show_only_online" boolean DEFAULT true,
  ADD COLUMN "selection_timeout_seconds" integer DEFAULT 105,
  ADD COLUMN "selection_timeout_action" text DEFAULT 'auto-assign',
  -- auto-assign | queue | ai-assumes

  -- Compartilhado entre modos
  ADD COLUMN "accept_timeout_seconds" integer DEFAULT 120,
  ADD COLUMN "accept_timeout_action" text DEFAULT 'next-agent',
  -- next-agent | queue | ai-assumes
  ADD COLUMN "max_conversations_per_agent" integer DEFAULT 5,
  ADD COLUMN "max_queue_size" integer DEFAULT 50,

  -- Mensagens configuráveis (texto puro, sem depender de IA — gap #4)
  ADD COLUMN "queue_message" text,
  ADD COLUMN "no_agents_message" text,
  ADD COLUMN "offline_message" text,
  ADD COLUMN "transfer_message" text,
  ADD COLUMN "away_message" text,

  -- Horário de funcionamento (coluna criada agora; UI/lógica adiada — gap #6)
  ADD COLUMN "business_hours" jsonb;
```

---

## Fluxo Modo A — Automático

```
Nova mensagem chega no departamento (queue_enabled = true)
        ↓
queue/manager.ts verifica agentes online do dept (agent_status.status='online'
  JOIN member_department para confirmar que pertencem a este depto)
        ↓
Distribui conforme distribution_mode:
  round-robin     → próximo na fila circular
  least-busy      → agente com menos conversas
  first-available → primeiro a responder
  manual          → entra na fila, agente escolhe
        ↓
conversation_queue.status = 'assigned'
conversation_queue.timeout_at = now + accept_timeout_seconds
        ↓
Notifica agente (toast + badge + som — via sendPushToMember, gap #2)
        ↓
┌─ Agente responde antes do timeout ───────────────────┐
│  conversation_queue.status = 'accepted'              │
│  conversation.assigned_to = agente                   │
│  conversation.department_id = dept  ← 🔧 só agora     │
│  Pipeline → "Em conversa"                             │
└────────────────────────────────────────────────────────┘
        ↓
┌─ Timeout sem resposta ────────────────────────────────┐
│  Verifica accept_timeout_action:                      │
│  next-agent  → tenta próximo agente disponível         │
│  queue       → entra na fila geral                     │
│  ai-assumes  → IA assume temporariamente                │
└────────────────────────────────────────────────────────┘
        ↓
┌─ Nenhum agente disponível ────────────────────────────┐
│  Envia no_agents_message para o cliente                │
│  Notifica owner/admin do dept                           │
│  Conversa fica em fila de espera                        │
│  Quando agente ficar online → oferece conversa           │
└────────────────────────────────────────────────────────┘
```

---

## Fluxo Modo B — Seleção pelo Cliente (cenários completos)

```
CENÁRIO 1 — Cliente escolhe, agente aceita ✅
Nova mensagem
→ queue/selection.ts envia selection_greeting (texto puro, gap #4) com
   lista de agentes online do depto
   "Olá João! Com qual atendente deseja falar?
    1. Ana (disponível)
    2. Carlos (disponível)
    3. Maria (disponível)"
→ conversation_queue.status = 'selecting'
→ conversation_queue.selection_sent_at = now
→ Cliente responde "1" dentro do timeout
→ Direcionado para Ana
→ Ana notificada → responde → atendimento ativo
→ conversation.department_id + assigned_to gravados juntos ← 🔧
→ Pipeline → "Em conversa"

CENÁRIO 2 — Agente escolhido não responde ⚠️
→ Cliente escolheu Ana
→ Ana não responde em accept_timeout_seconds
→ Mensagem determinística: "Ana não está disponível no momento.
        Deseja falar com outro atendente?
        2. Carlos  3. Maria"
→ Cliente escolhe → attempt++ → repete
→ Se esgotar todos → CENÁRIO 4

CENÁRIO 3 — Cliente não escolhe (timeout) ⏱️
→ Opções enviadas, cliente não respondeu em selection_timeout_seconds
→ Verifica selection_timeout_action:
   auto-assign  → distribui automaticamente
   queue        → entra na fila com queue_message
   ai-assumes   → IA assume e tenta novamente mais tarde

CENÁRIO 4 — Todos ocupados/offline 🔴
→ Nenhum agente disponível para listar
→ Envia no_agents_message
   "No momento todos os atendentes estão ocupados.
    Tempo estimado: X min. Deseja aguardar?"
→ Cliente "Sim" → fila de espera
→ Cliente "Não" → pipeline → Perdido
→ Notifica owner/admin do dept

CENÁRIO 5 — Agente fica away durante atendimento 🟡
→ Ana vai para away no meio do atendimento
→ Sistema aguarda X min
→ Envia away_message
   "Sua atendente precisou se ausentar.
    Deseja aguardar o retorno ou falar com outro?"
→ Cliente "Outro" → lista agentes disponíveis → repete Modo B
→ Cliente "Aguardar" → conversa pausada, Ana notificada ao voltar
→ Transferência → envia transfer_message

CENÁRIO 6 — Fora do horário 🌙 (adiado — gap #6, timezone indefinido)
→ Verifica business_hours do departamento
→ Fora do horário → envia offline_message
→ Conversa salva
→ Ao iniciar o expediente → notifica agentes das conversas pendentes

CENÁRIO 7 — Cliente tenta falar com agente offline 🔴
→ selection_show_only_online = true
   → Lista só mostra agentes online
→ selection_show_only_online = false
   → Lista mostra todos com indicador de status
```

---

## Sandbox do Laboratório (gap #5 — obrigatório desde o Q2)

```typescript
// Toda entrada em queue/manager.ts e queue/selection.ts:
if (conversation.isTest) return; // Laboratório nunca entra na fila real
```

---

## Arquivos a criar/modificar

### Novos
```
drizzle/00XX_queue_routing.sql   (gerado via `pnpm db:generate`)
src/server/queue/
  manager.ts        — distribui conversas conforme routing_mode (Q2)
  scheduler.ts       — verifica timeouts a cada N segundos, mesmo padrão de
                        src/server/pipeline/followup-scheduler.ts (Q2)
  notifier.ts        — sendPushToMember + evento SSE com targetMemberId (Q2)
  selection.ts        — lógica Modo B (Q3)

src/server/presence/
  status.ts           — getMemberStatus/setMemberStatus (Q1)

src/app/api/presence/route.ts     — GET/PUT status do agente (Q1)
src/app/api/queue/
  route.ts                — GET fila do dept (admin) (Q2)
  [id]/assign/route.ts    — aceitar conversa manualmente (Q2)
  [id]/transfer/route.ts  — transferir conversa (Q2)
```

### Modificar
```
src/lib/db/schema.ts             — agentStatus, conversationQueue, colunas
                                    novas em department (Q1)
src/server/settings/departments.ts — updateDepartment aceita os campos de fila (Q1)
src/components/settings/departments-client.tsx — aba/seção "Fila e Roteamento" (Q1)
src/components/app-nav.tsx        — troca o "· Online" fixo por seletor real (Q1)

src/server/inbox/ingest.ts
  — se department.queueEnabled → NÃO grava department_id direto; cria/
    atualiza conversation_queue em vez de atribuir (Q2)

src/server/ai/pipeline.ts
  — no Modo B, cede a vez para queue/selection.ts antes de rodar o turno
    normal da IA (Q3)

src/components/inbox/
  — Toast de nova conversa com timer regressivo, botão Aceitar/Repassar,
    badge de fila (Q2)
```

---

## Ordem de implementação

### Sprint Q1 — Fundação (sem quebrar o que existe) ✅ nesta sessão
```
1. Migration: agent_status, conversation_queue, colunas em department
   (queue_enabled default false — ninguém é afetado até ativar)
2. Seletor de status do agente na sidebar (online/away/offline), manual
   por enquanto — troca automática por login/logout fica para o Q2,
   junto do scheduler (evita acoplar a mais um hook do Better Auth antes
   de a fila em si existir)
3. Tela de configuração do dept → seção "Fila e Roteamento": toggle
   "Ativar fila" + modo de roteamento — só salva, zero lógica de
   distribuição ainda (queue_enabled=true não faz NADA sozinho até o Q2)
```

### Sprint Q2 — Modo A funcional ✅ concluído nesta sessão
```
4. ✅ Resolvido gap #1: conversations:view_assigned removido de permissions.ts
   (nunca era lido em lugar nenhum — a ausência de view_all já bastava)
5. ✅ queue/manager.ts — round-robin (lastAssignedAt mais antigo primeiro) +
   first-available, claim atômico em distributeConversation/
   acceptQueuedConversation/declineQueuedConversation
6. ✅ ingest.ts — com queue_enabled, NÃO grava department_id na ingestão;
   cria conversation_queue e chama routeConversationToQueue. IA genérica
   (maybeRunAgentTurn) se cala enquanto a conversa está em fila não roteada
   (gap #4 parcial — falta só o Modo B em si, Sprint Q3)
7. ✅ notifier.ts — sendPushToMember (src/server/push/send.ts) + evento SSE
   "queue.assigned" com targetMemberId, filtrado no servidor
   (src/app/api/events/route.ts) antes de sair pela conexão (gap #2)
8. ✅ QueueToast (src/components/queue-toast.tsx) — timer regressivo até
   timeoutAt, botões Aceitar/Repassar, montado globalmente em app-nav.tsx
9. ✅ queue/scheduler.ts — mesmo padrão do followup-scheduler, tenta
   redistribuir 'waiting' a cada ciclo e aplica accept_timeout_action
   ('next-agent' redistribui na hora; 'queue'/'ai-assumes' devolvem pra
   fila e esperam o próximo ciclo — semântica completa fica pro Q3/Q4)
10. ✅ GET /api/queue (tela de fila: owner, quem tem view_all, ou admin do
    depto) + POST /api/queue/[id]/assign + /transfer
```

Sandbox do Laboratório (gap #5): aplicado — `ingest.ts` só chama
`routeConversationToQueue` quando `!conversation.isTest`. Testes:
`tests/unit/queue-manager.test.ts` (12) + `tests/unit/queue-scheduler.test.ts`
(5). Gate técnico completo (typecheck + lint + build + 227 testes) verde.

### Sprint Q3 — Modo B funcional ✅ concluído nesta sessão (Cenários 1-4)
```
11. ✅ queue/selection.ts — sendSelectionGreeting monta lista (numerada/
    letras) só com agentes online do depto, texto puro via renderMessage
    ({{nome}}) — nunca depende de LLM/IA (gap #4). Opções ficam congeladas
    em conversation_queue.selection_options (jsonb) no momento do envio,
    pra "1"/"Carlos" continuar significando a mesma pessoa mesmo que a
    disponibilidade mude antes da resposta chegar.
12. ✅ Cenário 2 (agente escolhido não responde) — handleSelectionAcceptTimeout
    reoferece as opções restantes, excluindo quem não respondeu; sem
    ninguém sobrando, cai no Cenário 4.
    ✅ Cenário 3 (cliente não escolhe) — handleSelectionTimeout aplica
    selection_timeout_action (auto-assign tenta na hora; queue/ai-assumes
    esperam o próximo ciclo, mesma simplificação do Modo A no Q2).
    ✅ Cenário 4 (sem ninguém online) — devolve a conversa pra 'waiting'
    (mecanismo de espera do Modo A) com um aviso ao cliente, em vez do
    diálogo sim/não completo do desenho original.
13. ⏸ Cenário 5 (away durante atendimento) — adiado pro Q4: exige monitorar
    mudança de status de agentes com conversas JÁ aceitas (fora do
    conversation_queue, que termina em 'accepted') — escopo de scheduler
    próprio, não coube nesta sessão sem apressar.
14. ⏸ Decisão de timezone + Cenário 6 (fora do horário, gap #6) — segue
    adiado; `business_hours` continua só schema, sem UI/lógica.
```

Refatoração de apoio: `manager.ts` ganhou `loadQueueRow`/
`assignConversationToAgent` (claim atômico compartilhado por Modo A e B),
`listDepartmentAgents` (nome + presença, pra montar a lista do Modo B) e
`findActiveQueueEntry` (ingest.ts usa pra saber se uma mensagem nova do
cliente é resposta a uma seleção em aberto, em vez de conversa nova).
`LOCAL_MEDIA_MARKER`/`serializeMessage`/`MEDIA_TYPES` saíram de
`ingest.ts` para `src/server/inbox/message-format.ts` — sem isso,
`ingest.ts → selection.ts → send.ts → ingest.ts` seria um ciclo de
imports (send.ts importava esses símbolos de ingest.ts).

Simplificações documentadas em `selection.ts` (não são bugs, são escopo
consciente do Q3): lista só mostra agentes online mesmo com
`selection_show_only_online=false` (Cenário 7, sem UI ainda, fica pro Q4);
resposta do cliente que não bate com nenhuma opção é ignorada, sem loop de
reprompt.

Testes: `tests/unit/queue-selection.test.ts` (13). Gate técnico completo
verde.

**UI pendente:** a tela de Configurações → Departamentos (Q1) só expõe
"Ativar fila" + "Modo de roteamento" — os campos finos do Modo B
(`selectionGreeting`, `selectionFormat`, `selectionTimeoutSeconds`,
`noAgentsMessage`, `selectionUnavailableMessage` etc.) não têm campo na UI
ainda; funcionam com os defaults hardcoded em `selection.ts`
(`DEFAULT_GREETING` etc.) até alguém expandir o formulário — os valores
já são lidos do banco quando presentes, só falta o formulário pra editá-los.

### Sprint Q4 — Polimento (parcial, concluído nesta sessão)
```
15. ✅ Cenário 7 (agente offline na lista) — sendSelectionGreeting/
    handleSelectionAcceptTimeout agora respeitam selectionShowOnlyOnline:
    false inclui offline com indicador "(offline)" no texto. Se o cliente
    escolher um deles, o timeout de aceite (Cenário 2) já reoferece
    sozinho — não precisou de um diálogo extra de "aguardar ou escolher
    outro" como o desenho original sugeria.
16. ✅ Modo least-busy (menos conversas em andamento, empate por
    round-robin) e manual (nunca auto-designa) em pickAgent.
    Modo manual precisa de alguém pegando a conversa manualmente — novo
    endpoint POST /api/queue/[id]/claim (claimQueuedConversation,
    reaproveitando o mesmo claim atômico de assignConversationToAgent) +
    GET /api/queue passou a incluir departamentos em modo manual pra
    QUALQUER membro do depto (não só admin/view_all), senão não haveria
    como um agente comum ver o que tem pra pegar.
17. ✅ Notificação de fila crítica — src/server/queue/critical-alert.ts:
    quando 'waiting' de um depto atinge max_queue_size, avisa (push)
    admins do depto + owners da org, com cooldown de 10 min em memória de
    processo (evita spam a cada tick do scheduler enquanto a fila
    continuar cheia).
18. ⏸ Relatórios (tempo médio de espera, taxa de abandono) — adiado: é
    trabalho de dashboard (queries agregadas + UI própria), escopo
    comparável ao dashboard que já existe pra WhatsApp — cabe melhor numa
    sessão dedicada a isso do que espremido no fim do Q4.
19. ✅ conversations:view_assigned já tinha sido removido no Q2 (item
    estava desatualizado neste roadmap).
```

🔧 **Gap descoberto ao implementar o item 16**: o modo `manual` só faz
sentido se o agente conseguir *ver* a fila pra escolher — mas até aqui só
existia a API (`GET /api/queue`), nenhuma tela. Criada
`src/app/(app)/queue/page.tsx` + `src/components/queue/queue-client.tsx`
(lista as entradas, botão "Pegar" em `waiting`) e um item "Fila" na
sidebar (`app-nav.tsx`). Isso também serve pra owner/admin acompanharem
`waiting`/`selecting`/`assigned` em qualquer modo, não só manual.

Testes: `tests/unit/queue-critical-alert.test.ts` (4) + extensões em
`queue-manager.test.ts` (+6: least-busy, manual, claimQueuedConversation)
e `queue-selection.test.ts` (+1: Cenário 7) e `queue-scheduler.test.ts`
(+3: dispatch Modo B, Cenário 3, checkCriticalQueues). Gate técnico
completo verde.

### Complemento — Formulário completo do Modo B + Cenário 6 ✅ concluído nesta sessão

A partir de um mockup visual (`vocero_modo_b_config.html`), foi construída
a tela de configuração completa que faltava:

- **`src/components/settings/department-queue-settings.tsx`** (novo) —
  substitui a seção mínima que existia em `departments-client.tsx`.
  Cobre: modo de distribuição (round-robin/least-busy/first-available/
  manual, faltava configurar isso pela UI — só existia no banco), toda a
  configuração do Modo B (saudação com preview ao vivo, formato
  numerado/letras, exibir só online ou todos), os dois timeouts + suas
  ações, `maxConversationsPerAgent`/`maxQueueSize`, as 6 mensagens
  automáticas (fila, sem agentes, fora do horário, transferência, agente
  ausente, agente indisponível — Cenário 2), e horário de funcionamento
  por dia da semana com fuso horário. Estado local com um botão "Salvar
  configurações da fila" (os toggles rápidos — ativar fila / modo de
  roteamento — continuam salvando na hora, como já era).
- **`PATCH /api/settings/departments/[id]`** — schema Zod estendido pra
  aceitar todos os campos acima (antes só aceitava `queueEnabled`/
  `routingMode`); `updateDepartment` generalizado pra qualquer coluna
  editável do departamento em vez de listar campo por campo.

**Gap #6 (timezone) resolvido**: `department.timezone` (texto IANA,
default `America/Sao_Paulo`, editável entre os 5 fusos brasileiros na UI)
+ `src/server/queue/business-hours.ts::isWithinBusinessHours` (usa
`Intl.DateTimeFormat` pra resolver dia/hora no fuso do depto — sem
dependência nova). Sem `business_hours` configurado, fica sempre aberto
(não trava quem nunca mexeu na aba). Sem suporte a intervalo overnight
(22h–02h) — simplificação documentada no arquivo.

**Cenário 6 (fora do horário) implementado**: `routeConversationToQueue`
verifica o horário na criação da entrada — fora dele, manda
`offline_message` (ou o default embutido) UMA vez e a conversa fica
"waiting"; `distributeConversation` e `sendSelectionGreeting` também
checam antes de agir, então nada é distribuído/perguntado fora do
expediente. Quando o horário abre, o próprio ciclo do scheduler (que já
retenta toda linha `waiting`) resolve sozinho — sem precisar de um estado
dedicado de "aguardando expediente" nem de detectar a transição.

Testes: `tests/unit/business-hours.test.ts` (7) + extensões em
`queue-manager.test.ts` (+6: Cenário 6 em `distributeConversation` e
`routeConversationToQueue`, com `vi.useFakeTimers()`).

**Gap descoberto, ainda não fechado**: `queue_message` (mensagem de "você
está na posição X da fila") nunca é enviado de fato — o campo existe, tem
UI, mas nem `handleSelectionTimeout`/`handleAcceptTimeout` com ação
`queue` nem nenhum outro ponto chama `sendText` com ele. Baixo esforço
pra fechar quando for a próxima sessão de fila.

**Ainda pendente (fora desta sessão):**
- Item 18 (relatórios de fila).
- Cenário 5 (away durante atendimento já aceito).
- Gap acima: `queue_message` nunca é efetivamente enviado.

---

## Regras que nunca mudam (hardcoded = proibido)

```
✗ NUNCA: if (dept.name === 'CCD') { ... }
✗ NUNCA: const TIMEOUT = 105;
✗ NUNCA: const MAX_AGENTS = 5;
✗ NUNCA: "Olá! Com qual atendente deseja falar?" (string fixa)

✓ SEMPRE: dept.selectionTimeoutSeconds
✓ SEMPRE: dept.maxConversationsPerAgent
✓ SEMPRE: dept.selectionGreeting (do banco)
✓ SEMPRE: dept.routingMode (do banco)
```
