# Implementation Plan: Atalho de modelos e cadastro manual de contato

**Branch**: `003-sprint1-templates-contacts` | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-sprint1-templates-contacts/spec.md`

## Summary

Duas histórias de UI puras sobre o composer da caixa de entrada e a lista de
conversas, sem novos endpoints, tabelas nem mudanças de canal:

- **US1**: atalho "/" no composer que abre um dropdown de modelos aprovados
  (reutiliza `GET /api/templates`, já existe), insere o corpo e deixa a primeira
  variável numerada selecionada/editável. É unificado com os chips de acesso
  rápido existentes (mesmo comportamento de inserção).
- **US2**: terminar a integração já iniciada (sem commit) de "iniciar conversa"
  por telefone — conectar `onStartConversation` em `inbox-client.tsx` com o
  `POST /api/conversations` que já existe na árvore.

Nenhuma dependência, tabela ou rota nova é adicionada.

## Technical Context

**Language/Version**: TypeScript 5.7 (strict + noUncheckedIndexedAccess), React 19

**Primary Dependencies**: Next.js 15 App Router, Tailwind, lucide-react — todas já no projeto

**Storage**: PostgreSQL via Drizzle — sem mudanças de schema neste sprint

**Testing**: Vitest (unit, se aplicável) + roteiro E2E Playwright com mocks (`tests/e2e/`)

**Target Platform**: Web (navegador), self-hosted

**Project Type**: Monolito Next.js — frontend + rotas de API no mesmo projeto

**Performance Goals**: N/A (interação de UI local, sem novas chamadas de rede além das já existentes)

**Constraints**: Não modificar o envio de mensagens nem o roteamento por canal; reutilizar `sendText`/`sendTemplate` tal como existem

**Scale/Scope**: 2 componentes de UI existentes modificados (`composer.tsx`, `conversation-list.tsx` + `inbox-client.tsx`); 0 endpoints novos (o `POST /api/conversations` já existe sem commit)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Segurança de Dados**: sem mudanças de segredos/credenciais. PASS.
- **II. Soberania**: nenhuma dependência externa é adicionada nem o canal não oficial é tocado. PASS.
- **III. Multi-tenancy**: `POST /api/conversations` já é scoped por `session.organizationId`
  (usa `scoped()` e os helpers `getOrCreateContact`/`getOrCreateConversation`, que já
  recebem `organizationId`). PASS.
- **IV. Idempotência**: `getOrCreateContact`/`getOrCreateConversation` já usam
  `onConflictDoNothing` sobre índices únicos existentes (`contact_org_phone_uq`,
  `conversation_org_contact_real_uq`) — tentativas repetidas/duplo clique não duplicam. PASS.
- **V. Qualidade Verificável**: gate typecheck+lint+build+test se aplica sem exceção. PASS
  (pendente de execução).
- **VI. Specs Antes do Código**: este plano e sua spec precedem a implementação. PASS.
- **VII. Rastreabilidade**: a interpretação de "cadastro manual de contato" (sem
  formulário dedicado em Contatos) fica documentada em `spec.md` → Assumptions. PASS.
- **VIII. Foco Vertical**: ambas as histórias servem diretamente para atender/organizar
  conversas de WhatsApp de um negócio; não é broadcast nem scraping. PASS.
- **IX. Verificação ao Vivo**: self-test E2E obrigatório antes de declarar "Feito" —
  exercitar o atalho "/" e "Iniciar conversa" no navegador (Playwright + mocks),
  incluindo o caminho infeliz (sem modelos aprovados; falha de rede em "Iniciar
  conversa"). Pendente de execução na Fase de implementação.

Sem violações — Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/003-sprint1-templates-contacts/
├── plan.md              # This file
├── spec.md              # Feature spec
├── tasks.md             # Phase 2 output (/speckit-tasks)
└── checklists/
    └── requirements.md
```

Não são gerados `research.md` / `data-model.md` / `contracts/`: não há incógnitas
técnicas para investigar (stack e padrões já estabelecidos no repositório), não há
entidades novas, e não há contratos de API novos — ambas as histórias reutilizam
endpoints e tabelas existentes tal como estão.

### Source Code (repository root)

```text
src/
├── components/
│   └── inbox/
│       ├── composer.tsx           # US1: atalho "/" + unificar chips
│       ├── conversation-list.tsx  # US2: já tem o WIP de "Iniciar conversa"
│       └── inbox-client.tsx       # US2: conectar onStartConversation
├── app/api/conversations/
│   └── route.ts                   # US2: POST já existe (WIP sem commit)
└── lib/
    └── utils.ts                   # US2: normalizePhoneInput já existe (WIP)
```

**Structure Decision**: Monolito existente, sem novos diretórios. Todas as
mudanças caem dentro de `src/components/inbox/` (US1 e metade da US2) e uma
conexão pontual em `inbox-client.tsx` (o resto da US2). Zero arquivos novos de
código de produto.

## Complexity Tracking

*(vazio — não há violações a justificar)*
