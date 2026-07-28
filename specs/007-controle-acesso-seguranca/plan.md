# Implementation Plan: Segurança & Controle de Acesso

**Branch**: `007-controle-acesso-seguranca` | **Date**: 2026-07-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-controle-acesso-seguranca/spec.md`

## Summary

Adiciona uma camada de permissões granulares por membro sobre o `organization`
plugin do Better Auth já em uso: papéis renomeados para `owner`/`admin`/`agent`,
permissões e acesso a canal (oficial/não oficial) ajustáveis individualmente,
atribuição de conversa a agente, convite por link/token (complementando — não
substituindo — a criação direta de conta que já existe em
`src/app/api/settings/team/route.ts`), SMTP opcional do próprio operador para
recuperação de senha (com fallback manual do owner quando não configurado), e
um log de auditoria das ações críticas. Constituição emendada para v2.1.0
(MINOR) para admitir SMTP como terceira categoria opcional de dependência
externa, ao lado do canal WhatsApp e do provedor LLM.

## Technical Context

**Language/Version**: TypeScript 5.7 estrito (`strict` + `noUncheckedIndexedAccess`), Next.js 15 App Router, React 19.

**Primary Dependencies**: Better Auth (`organization` plugin, já em uso) +
`nodemailer` (nova — único jeito realista de falar SMTP arbitrário do operador
em Node; sem SaaS de terceiro, só transporte). Zod para toda validação de
entrada. `src/lib/crypto` (AES-256-GCM, já existente) reusado para a senha
SMTP.

**Storage**: PostgreSQL via Drizzle. Tabelas novas: `member_permission`,
`member_channel`, `invite_token`, `smtp_config`, `password_reset_token`,
`audit_log`; coluna nova `assigned_to` em `conversation` (FK `member`,
nullable). `member.role` passa a usar os valores `owner`/`admin`/`agent`
(migração de dados: qualquer `member.role` atual diferente de `owner` vira
`agent`).

**Testing**: Vitest para a lógica pura e testável sem UI (resolução de
permissão efetiva por membro, validação de token de convite/reset,
degradação sem-SMTP, helper `scoped()` das tabelas novas). Playwright para os
fluxos de UI (US2 tela de Usuários, US3 registro via convite) conforme
Princípio IX.

**Target Platform**: Next.js self-hosted (mesmo runtime do resto do projeto);
nenhuma tabela nova precisa de runtime Node especial (sem dependência nativa
como o Baileys).

**Constraints**: `owner` nunca pode ficar sem representante (última
remoção/rebaixamento/desativação bloqueada). Verificação de permissão sempre
no servidor (nunca só esconder botão na UI). Envio de SMTP nunca bloqueia a
resposta ao usuário que solicitou o reset (se falhar, cai para o aviso ao
owner, não trava a requisição).

**Scale/Scope**: 5 user stories (P1×2, P2, P3, P4); ~15 permissões nomeadas
fixas em código; uma organização por instância (suposição já vigente em todo
o projeto).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Segurança de Dados**: senha SMTP cifrada em repouso com `lib/crypto`
  (mesmo padrão do token Meta e da sessão Baileys); tokens de convite/reset de
  senha são de uso único, curta duração para reset (1h) e nunca logados;
  `member_permission`/`member_channel`/`assigned_to` são todos escopados por
  `organization_id` (via `member_id` → `member.organization_id`). PASS.
- **II. Soberania (v2.1.0, emendada nesta feature)**: SMTP é a 3ª categoria
  agora permitida — opcional, operado pelo próprio dono, sem SaaS de terceiro
  embutido; sem SMTP configurado, o produto funciona normalmente (fallback
  manual). Nenhuma outra dependência externa nova. PASS.
- **III. Multi-tenancy**: toda tabela nova carrega `organization_id` direto
  (`invite_token`, `smtp_config`, `audit_log`) ou via `member_id` NOT NULL
  (`member_permission`, `member_channel`, `password_reset_token`); toda query
  passa por `scoped()`. PASS.
- **IV. Idempotência**: token de convite e de reset de senha são marcados
  `used`/consumidos dentro da mesma transação que cria a conta/troca a senha —
  sem duas contas nascendo do mesmo token numa corrida. PASS.
- **V. Qualidade Verificável**: gate típico (typecheck/lint/build/test). PASS.
- **VI. Specs Antes do Código**: este plano e spec.md precedem a
  implementação. PASS.
- **VII. Rastreabilidade**: duas correções feitas nesta própria fase de
  planejamento ficam documentadas em spec.md → Assumptions (FR-013 revisado:
  convite por token complementa, não substitui, a criação direta existente; e
  FR-005/Key Entities revisados: canal é por tipo, não por instância nomeada,
  porque o schema real só permite um canal oficial e um não oficial por
  organização). PASS.
- **VIII. Foco Vertical**: controle de acesso e segurança da própria
  operação da agência/negócio que roda a instância — não introduz nada fora
  do domínio de conversas/leads de WhatsApp, é infraestrutura de quem já usa
  o produto. PASS.
- **IX. Verificação ao Vivo**: US1 (permissão negada no servidor), US2 (UI de
  edição), US3 (fluxo de convite ponta a ponta), US4 (SMTP configurado E
  não-configurado, os dois caminhos) e US5 (auditoria) são todas
  comportamento observável e serão exercidas ao vivo antes de "Pronto",
  conforme o loop de autocorreção do CLAUDE.md.

Sem violações — não se aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-controle-acesso-seguranca/
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
├── lib/db/schema.ts                        # member_permission, member_channel,
│                                            # invite_token, smtp_config,
│                                            # password_reset_token, audit_log;
│                                            # conversation.assigned_to
├── lib/db/ids.ts                           # + prefixos novos (mp, mc, inv, smtp, prt, aud)
├── lib/auth/
│   ├── index.ts                            # member.role default "agent" (era "member")
│   ├── permissions.ts                      # NOVO: lista fixa PERMISSIONS + DEFAULT_PERMISSIONS
│   └── require-permission.ts               # NOVO: requirePermission(session, perm) — 403 se ausente
├── lib/mail/
│   └── smtp.ts                             # NOVO: sendMail() via nodemailer + smtp_config cifrado
├── server/auth/
│   ├── on-signup.ts                        # ajustar resolveMembership para os 3 papéis
│   ├── invite-tokens.ts                    # NOVO: gerar/validar/consumir invite_token
│   ├── password-reset.ts                   # NOVO: solicitar/consumir password_reset_token
│   └── audit.ts                            # NOVO: logAudit(...)
├── app/api/settings/
│   ├── team/route.ts                       # estendido: papel/status/permissões/canais no PATCH
│   ├── team/[memberId]/route.ts            # NOVO: PATCH edição de um membro
│   ├── invites/route.ts                    # NOVO: POST gerar convite
│   ├── smtp/route.ts                       # NOVO: GET/PUT config + POST test
│   └── audit/route.ts                      # NOVO: GET lista filtrável
├── app/api/auth/
│   ├── forgot-password/route.ts            # NOVO: solicitar reset
│   └── reset-password/route.ts             # NOVO: consumir token + trocar senha
├── app/register/page.tsx                   # existente (Better Auth) — passa a aceitar
│                                            # ?token=... e pré-preencher via invite_token
├── app/reset-password/page.tsx             # NOVO
├── app/(app)/settings/
│   ├── team/page.tsx                       # existente, componente estendido
│   └── email/page.tsx                      # NOVO (Configurações → Email, owner only)
├── app/(app)/audit/page.tsx                # NOVO (owner/admin only)
└── components/settings/
    ├── team-client.tsx                     # estendido: modal de edição, badge de status
    ├── invite-dialog.tsx                   # NOVO
    ├── smtp-client.tsx                     # NOVO
    └── audit-client.tsx                    # NOVO
```

**Structure Decision**: reutiliza o padrão `src/server/<domínio>/` e
`src/app/api/settings/<recurso>/` já usados no projeto. `team-client.tsx` e
sua rota são ESTENDIDOS, não recriados — preserva o fluxo de criação direta
de conta já em produção (spec 001, FR-061), evitando regressão. Nenhuma
tabela nova sai do padrão de `organization_id`/`scoped()`; `smtp_config` se
cifra com o mesmo `lib/crypto` do token Meta e da sessão Baileys.

## Complexity Tracking

*(vazio — não há violações a justificar)*
