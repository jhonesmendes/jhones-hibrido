---

description: "Task list: Segurança & Controle de Acesso"
---

# Tasks: Segurança & Controle de Acesso

**Input**: Design documents from `specs/007-controle-acesso-seguranca/`

**Prerequisites**: plan.md, data-model.md, spec.md

**Tests**: unitários para tudo que é lógica pura e testável sem UI (resolução
de permissão efetiva, tokens de convite/reset, degradação sem SMTP). Os
fluxos de UI (US2, US3, US4) são exercidos ao vivo com Playwright no Polish —
diferente da feature 006, nada aqui depende de um telefone real, então **não
há passo de verificação humana não-automatizável nesta feature**.

## Phase 1: Setup

- [X] T001 `pnpm add nodemailer` + `pnpm add -D @types/nodemailer` (via
  `corepack pnpm`, ver Notes).
- [X] T002 Migração em `src/lib/db/schema.ts` (ver data-model.md): coluna
  `member.is_active boolean NOT NULL DEFAULT true`; tabelas novas
  `member_permission`, `member_channel`, `invite_token`, `smtp_config`,
  `password_reset_token`, `audit_log`; coluna `conversation.assigned_to`.
  Migração de dado incluída no mesmo SQL: `UPDATE member SET role = 'agent'
  WHERE role <> 'owner'`. `drizzle-kit generate` reproduziu o mesmo prompt
  interativo de rename-detection (histórico de `unofficial_channel`) — SQL
  escrito à mão (`drizzle/0007_access_control.sql`) + journal atualizado à
  mão, mesmo padrão de 0005/0006. `pnpm db:migrate` aplicado com sucesso
  contra o Postgres local (docker-compose.dev.yml).
- [X] T003 `src/lib/db/ids.ts`: prefixos novos — `memberPermission: "mp"`,
  `memberChannel: "mc"`, `inviteToken: "inv"`, `smtpConfig: "smtp"`,
  `passwordResetToken: "prt"`, `auditLog: "aud"`.

**Checkpoint**: schema migrado, dependências instaladas.

---

## Phase 2: Foundational (bloqueia todas as user stories)

- [X] T010 `src/lib/auth/permissions.ts`: `PERMISSIONS` (15 chaves fixas, ver
  data-model.md) + `DEFAULT_PERMISSIONS` por papel (`owner`/`admin` = tudo,
  `agent` = subconjunto operacional).
- [X] T011 `src/lib/auth/require-permission.ts`: `resolvePermissions`,
  `requirePermission`, e também `resolveChannelAccess`/`requireChannelAccess`
  e `requireConversationAccess` (escopo expandido em relação ao task
  original — a US1 precisava dos três, não só de permissão nomeada).
  `SessionContext` ganhou `memberId` (`src/lib/auth/session.ts`,
  `src/server/auth/on-signup.ts`); `ForbiddenError` plugado em
  `withAuth` (`src/lib/api.ts`) → 403 automático.
- [X] T012 `src/server/auth/audit.ts`: `logAudit(...)` — nunca lança (log
  falho não derruba a ação real).
- [X] T013 `src/lib/auth/index.ts`: hook `before` bloqueia `/sign-in/email`
  quando `is_active === false`; hook `after` já registra `user.login` na
  auditoria (adiantado da US5, reaproveitando a mesma passada pelo arquivo).
  `is_active` também é reavaliado em `requireSession()` a cada requisição —
  não só no login (edge case do spec.md: sessão já aberta perde acesso na
  próxima chamada). `role: "member"` → `"agent"` no POST de
  `settings/team/route.ts`.

**Checkpoint**: base de permissão/auditoria pronta para as user stories
consumirem.

---

## Phase 3: User Story 1 - Base de controle de acesso (Priority: P1) 🎯 MVP

- [X] T020 [US1] `src/app/api/campaigns/[id]/send/route.ts`:
  `requirePermission(session, "campaigns:send")` antes de disparar.
- [X] T021 [US1] `src/app/api/pipeline/leads/[id]/route.ts` (mover de
  estágio): `requirePermission(session, "pipeline:move")`.
- [X] T022 [US1] `src/app/api/conversations/route.ts` GET: sem
  `conversations:view_all`, filtra por `assigned_to = session.memberId`.
- [X] T023 [US1] `src/app/api/conversations/[id]/route.ts`,
  `.../messages/route.ts` e `.../messages/template/route.ts`: sem
  `conversations:view_all` E `assigned_to !== session.memberId` → 403
  (`requireConversationAccess`).
- [X] T024 [US1] Implementado no nível de rota, não em `send.ts` (mais
  correto: `send.ts`/`sendText` também é chamado por IA/follow-up/campanhas,
  que não têm um "membro" agindo) — `requireChannelAccess` plugado em
  `.../messages/route.ts` e `.../messages/template/route.ts` antes de
  enviar.
- [X] T025 [US1] [P] `tests/unit/permissions.test.ts` — 16 testes: defaults
  por papel, overrides, `requirePermission`, `requireConversationAccess`,
  `resolveChannelAccess`/`requireChannelAccess`.
- [X] T026 [US1] [P] Consolidado dentro de `permissions.test.ts` (mesmo setup
  de mock de DB) em vez de um arquivo separado — cobre liberado-por-padrão e
  bloqueado por `canView`/`canSend`.
- [X] T027 [US1] `assigned_to` setável via `PATCH /api/conversations/[id]`
  (ver T032) — decisão: atribuição manual pelo admin/owner via US2, não
  "atribuir ao primeiro que responde" automaticamente (não pedido no spec).

**Independent Test**: dois membros de teste (um sem `campaigns:send`, outro
com), chamada à API confirma aceite/recusa — sem UI.

**Checkpoint**: nenhuma ação sensível passa sem a permissão correspondente,
verificável por teste automatizado (SC-002).

---

## Phase 4: User Story 2 - Tela de Usuários (Priority: P1)

- [X] T030 `src/server/auth/member-management.ts` (`updateMember` — extraído
  da rota para ser testável, padrão do projeto: rota fina, lógica em
  `server/`) + `src/app/api/settings/team/[memberId]/route.ts` PATCH:
  atualiza `role`/`is_active`/permissões/canais; bloqueia rebaixar/desativar
  o último `owner` ativo (`409 last_owner`); só `owner` mexe em outro
  `owner` (`403`).
- [X] T031 `src/app/api/settings/team/route.ts` GET: inclui `isActive`,
  permissões resolvidas (todas as 15 chaves) e acesso a canal (oficial +
  não oficial) de cada membro.
- [X] T032 [US2] `src/app/api/conversations/[id]/route.ts` PATCH: aceita
  `assignedTo` (requer `conversations:assign`, verificado só quando o campo
  é enviado).
- [X] T033 [US2] `src/components/settings/team-client.tsx`: modal de edição
  (overlay simples, mesmo padrão de `stage-manager.tsx` — projeto não tem
  Dialog/Select/Checkbox como componentes de UI) — select de papel, toggle
  ativo/inativo, checkboxes de permissão, checkboxes de canal (ver/enviar ×
  oficial/não oficial).
- [X] T034 [US2] [P] `tests/unit/member-management.test.ts` — 11 testes:
  bloqueio de último-owner (rebaixar/desativar), só-owner-mexe-em-owner,
  membro inexistente, permissões/canais corretamente convertidos em
  insert/delete conforme batem ou não com o default.

**Independent Test**: como admin, editar as permissões de um agente
existente e confirmar que a US1 reflete a mudança sem relogar.

**Checkpoint MVP — verificado ao vivo em 2026-07-28** (servidor dev real,
Postgres local, HTTP real via curl com cookies de sessão reais — sem
navegador disponível nesta sessão, então a renderização visual do modal
FICA PENDENTE de verificação humana/Playwright; a lógica de servidor, que é
onde mora todo o comportamento de segurança, foi 100% exercitada):

| # | Cenário | Resultado |
|---|---|---|
| 1 | Agent sem `campaigns:send` → disparo de campanha recusado | 403 forbidden |
| 2 | Agent com `pipeline:move` (default) → ação passa da checagem de permissão | 422 (erro de negócio, não 403) |
| 3 | Owner concede `campaigns:send` via PATCH → efeito imediato sem relogar | 403 vira 404 (passou a checagem) |
| 4 | GET /api/settings/team reflete a permissão concedida | OK |
| 5 | Agent sem `conversations:view_all` → só vê a conversa atribuída a ele | 1 de 2 conversas |
| 6 | Agent tenta abrir conversa não atribuída | 403 forbidden |
| 7 | Agent abre a conversa atribuída | 200 OK |
| 8 | Owner desativa agent → sessão já aberta perde acesso na próxima chamada | 401 "Conta desativada" |
| 9 | Agent desativado tenta logar de novo | 403 "Conta desativada — fale com o administrador" |
| 10 | Owner tenta se auto-rebaixar sendo o único owner ativo | 409 last_owner |
| 11 | Owner tenta se autodesativar sendo o único owner ativo | 409 last_owner |
| 12 | Canal oficial bloqueado (`canSend:false`) → envio de mensagem recusado | 403 "Acesso negado ao canal oficial" |
| 13 | Admin (não-owner) tenta editar um `owner` | 403 "Só o proprietário gerencia outros proprietários" |

13/13 em verde. Achado durante o self-test: `withAuth` (`src/lib/api.ts`)
sobrescrevia a mensagem de `UnauthorizedError` sempre para "Não autenticado",
escondendo o motivo real ("Conta desativada") de quem já tinha sessão aberta
— corrigido para repassar `err.message`.

---

## Phase 5: User Story 3 - Convite por token (Priority: P2)

- [X] T040 [US3] `src/server/auth/invite-tokens.ts`: `createInviteToken`,
  `checkInviteToken` (leitura, não consome — usada pelo GET público e como
  fail-fast antes de criar a conta), `consumeInviteToken` atômico (`UPDATE
  ... WHERE used_at IS NULL` + `returning`, dentro da mesma transação do
  insert de `member` — se a claim falhar, o insert é revertido).
- [X] T041 [US3] `src/app/api/settings/invites/route.ts` POST (owner/admin).
- [X] T042 [US3] `InviteDialog` dentro de `team-client.tsx` (não um arquivo
  separado — mesmo padrão de `EditMemberDialog` já usado nesse componente):
  papel/email opcional/expiração + link copiável. Permissões/canais
  iniciais NÃO expostos nesta v1 (corte de escopo consciente: o convite usa
  o default do papel; ajuste fino continua disponível depois via US2).
- [X] T043 [US3] `src/app/(auth)/register/page.tsx`: com `?token=`, mostra
  `InviteRegisterForm` (checa via GET `/api/auth/invite`, e-mail
  pré-preenchido e travado quando o convite é restrito); sem token, mantém
  o formulário público de sempre. Rotas novas: `GET /api/auth/invite`
  (checagem pública) e `POST /api/auth/accept-invite` (cria a conta via
  `signUpEmail` com `asResponse:true` para repassar os cookies de sessão,
  consome o convite, `logAudit("invite.used")`).
- [X] T044 [US3] [P] `tests/unit/invite-tokens.test.ts` — 11 testes: geração,
  as 4 checagens (inválido/expirado/usado/válido), consumo com
  permissões/canais iniciais, email_mismatch, corrida (claim falha).

**Independent Test**: gerar link como admin, abrir em janela anônima, criar
conta, confirmar papel/permissões corretos.

**Checkpoint — verificado ao vivo em 2026-07-28** (mesmo método do MVP: HTTP
real + cookies reais, sem navegador):

| # | Cenário | Resultado |
|---|---|---|
| 1 | Owner gera convite restrito a um e-mail | 201, URL com token |
| 2 | GET público de checagem do convite | 200, `{email, role}` corretos |
| 3 | Aceitar com e-mail diferente do restrito | 422 `email_mismatch` |
| 4 | Aceitar com o e-mail certo | 201, cookie de sessão setado |
| 5 | Sessão do convidado funciona de verdade (API real) | 200 |
| 6 | Member criado já com o papel do convite | `role=agent` no banco |
| 7 | Reusar o mesmo token (e-mail já cadastrado) | 422, mas expôs um bug (ver achado) |
| 8 | Reusar o mesmo token (e-mail novo, após o fix) | 422 `used`, **sem** criar user órfão |
| 9 | Token inexistente | 422 `invalid` |

**Achado corrigido durante o self-test**: no cenário 7, com um e-mail NOVO
(não duplicado) reusando um token já gasto, o `signUpEmail` do Better Auth
criava a conta de autenticação (`user`) ANTES de `consumeInviteToken`
descobrir que o token já fora usado — deixando um `user` órfão, sem
`member`, sem organização (dead-end de login). Corrigido com uma checagem
rápida (`checkInviteToken`) ANTES de criar a conta (evita o caso comum) +
limpeza best-effort do `user` órfão no `catch` (cobre a corrida genuína
residual, onde dois aceites acontecem quase simultâneos). Reverificado ao
vivo: já não cria órfão.

---

## Phase 6: User Story 4 - SMTP e recuperação de senha (Priority: P3)

- [ ] T050 [US4] `src/lib/mail/smtp.ts`: `sendMail(organizationId, { to,
  subject, html/text })` — busca `smtp_config` ativo, decifra a senha
  (`lib/crypto`), monta transporte `nodemailer`, envia; lança erro tipado
  claro se não configurado ou se o envio falhar (nunca falha silenciosa).
- [ ] T051 [US4] `src/app/api/settings/smtp/route.ts`: GET (dados mascarados,
  sem senha em claro), PUT (salva cifrado, owner only), POST `?action=test`
  (envia e-mail de teste para o owner, retorna erro claro se falhar).
- [ ] T052 [US4] `src/components/settings/smtp-client.tsx` +
  `src/app/(app)/settings/email/page.tsx`: formulário + botão "Testar
  configuração" + Salvar (owner only).
- [ ] T053 [US4] `src/server/auth/password-reset.ts`:
  `requestPasswordReset(email)` (cria `password_reset_token`, 1h; tenta
  `sendMail`; se SMTP ausente/falhar, registra o pedido pendente para o
  owner ver — sem expor se o email existe, resposta genérica sempre);
  `consumePasswordReset(token, newPassword)` atômico + troca a senha via
  Better Auth.
- [ ] T054 [US4] `src/app/api/auth/forgot-password/route.ts` POST +
  `src/app/api/auth/reset-password/route.ts` POST.
- [ ] T055 [US4] `src/app/reset-password/page.tsx`: formulário de nova senha
  a partir do token da URL, erro claro se expirado/usado.
- [ ] T056 [US4] Painel do owner: lista de solicitações de reset pendentes
  sem SMTP (reaproveita `team-client.tsx` ou card dedicado) com ação "gerar
  link" (reexpõe a URL de `reset-password` para o owner copiar/enviar
  manualmente).
- [ ] T057 [US4] [P] `tests/unit/password-reset.test.ts`: token válido,
  expirado (>1h), já usado, consumo atômico.
- [ ] T058 [US4] [P] `tests/unit/smtp.test.ts`: transporte mockado —
  sucesso, credenciais inválidas (erro claro), SMTP inativo/ausente
  (degrada sem lançar para o chamador de request-reset).

**Independent Test**: sem SMTP, solicitar reset como membro, confirmar que o
owner vê a solicitação e gera um link funcional; com SMTP de teste
configurado, confirmar envio automático.

**Checkpoint**: recuperação de senha funcional nos dois caminhos (US4).

---

## Phase 7: User Story 5 - Auditoria (Priority: P4)

- [ ] T060 [US5] Encaixar `logAudit(...)` nos pontos já existentes: login
  (hook `after` de `/sign-in/email` em `src/lib/auth/index.ts`), conexão/
  desconexão de canal (`src/server/baileys/manager.ts`,
  `src/app/api/settings/channels/route.ts`, rota de credenciais Meta),
  disparo de campanha (`src/app/api/campaigns/[id]/send/route.ts`, já tocado
  em T020), mudança de permissões/papel/status (T030), mudança de SMTP
  (T051).
- [ ] T061 [US5] `src/app/api/settings/audit/route.ts` GET: filtra por
  `memberId`/`action`, paginado, owner/admin only.
- [ ] T062 [US5] `src/components/settings/audit-client.tsx` +
  `src/app/(app)/audit/page.tsx`: lista filtrável, acesso restrito no
  server component.
- [ ] T063 [US5] [P] `tests/unit/audit.test.ts`: `logAudit` grava os campos
  corretos; rota GET filtra corretamente por membro/ação.

**Independent Test**: convidar um membro (T041) e confirmar que aparece na
tela de auditoria com autor/data corretos.

**Checkpoint**: as 5 histórias completas em código.

---

## Phase 8: Polish

- [ ] T070 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm
  build && pnpm test`.
- [ ] T071 Self-test de comportamento ao vivo (Princípio IX, Playwright):
  US1 (chamada de API sem permissão → 403 real), US2 (editar permissão na
  UI e confirmar efeito), US3 (gerar convite → abrir em janela anônima →
  criar conta → confirmar papel), US4 caminho A (sem SMTP → solicitar reset
  → aviso aparece para o owner → link manual funciona) e caminho B (SMTP de
  teste configurado → reset chega por e-mail), US5 (ação auditável aparece
  na tela). Todos os caminhos são automatizáveis nesta feature — nenhum
  depende de hardware externo.

## Dependencies & Execution Order

- Setup (T001-T003) bloqueia tudo.
- Foundational (T010-T013) bloqueia todas as user stories — é a base de
  permissão/auditoria que elas consomem.
- US1 (T020-T027) é o alicerce verificável por API; US2 (T030-T034) depende
  de US1 (edita o que US1 verifica) — juntas formam o MVP.
- US3 (T040-T044) depende de US1 (papel/permissões) e US2 (onde o convite é
  gerado na UI), mas não de US4 (SMTP).
- US4 (T050-T058) é independente de US3 — só depende do Foundational
  (`lib/crypto` já existe) e do schema (T002).
- US5 (T060-T063) depende de todas as anteriores existirem para ter o que
  auditar, mas tecnicamente só precisa do Foundational (T012) — os pontos de
  chamada em T060 referenciam código de US1/US3/US4.
- Polish depende das 5 histórias.

## Notes

- Estende, não substitui: `src/app/api/settings/team/route.ts` +
  `team-client.tsx` (criação direta de conta, spec 001 FR-061) continuam
  funcionando lado a lado do convite por token (US3).
- Reaproveita: `lib/crypto` (senha SMTP), `scoped()` (todas as tabelas
  novas), `withAuth`/`requireSession` (base de toda rota).
- `member_channel` não tem `channel_id` — o schema real só permite um canal
  oficial e um não oficial por organização (ver data-model.md).
- Nenhuma parte desta feature depende de hardware externo ou aprovação de
  terceiro — diferente da feature 006 (Baileys), tudo é automatizável em
  Playwright/Vitest; não há um "T-último" de verificação humana obrigatória.
