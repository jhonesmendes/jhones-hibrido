---

description: "Lista de tarefas do Sprint 1: atalho de modelos + cadastro manual de contato"

---

# Tasks: Atalho de modelos e cadastro manual de contato

**Input**: Design documents from `specs/003-sprint1-templates-contacts/`

**Prerequisites**: plan.md, spec.md

**Tests**: Nenhum teste unitário novo é solicitado (a spec não os exige); a
verificação é o self-test E2E ao vivo do Princípio IX, executado pelo implementador.

**Organization**: Tarefas agrupadas por história de usuário.

## Phase 1: Setup

- [X] T001 Confirmar que o ambiente instala e compila antes de mexer no código
  (`corepack pnpm install`, reparar qualquer corrupção de `node_modules`)

---

## Phase 2: User Story 1 - Atalho "/" para modelos (Priority: P1) 🎯 MVP

**Goal**: Escrever "/" no composer abre um dropdown de modelos aprovados;
selecionar um insere o corpo com a primeira variável numerada selecionada/editável.
Os chips de acesso rápido existentes passam a se comportar da mesma forma.

**Independent Test**: Ver spec.md § User Story 1 → Independent Test.

### Implementation for User Story 1

- [X] T010 [US1] Em `src/components/inbox/composer.tsx`: extrair uma função
  `applyTemplate(t: TemplateDto)` que (a) faz `setText(t.body)`, (b) após o próximo
  render, foca o textarea e seleciona o intervalo da primeira variável numerada
  (`/\{\{\s*\d+\s*\}\}/`) com `setSelectionRange`, ou posiciona o cursor no final se
  não houver variável, (c) executa `autogrow()`.
- [X] T011 [US1] Alterar o `onClick` dos chips de acesso rápido existentes para
  usar `applyTemplate(t)` em vez de substituir `{{1}}` pelo nome do contato
  silenciosamente.
- [X] T012 [US1] Adicionar estado local para o dropdown: detectar quando `text`
  corresponde a `/^\/(\S*)$/` (barra como primeiro caractere, ainda sem espaços) e
  derivar a lista filtrada de `templates` (já carregadas) por `name` (contains,
  case-insensitive).
- [X] T013 [US1] Renderizar o dropdown (reutilizando o estilo visual dos chips /
  `TemplateSender`) sobre o textarea quando há correspondência de "/": lista de
  resultados com nome + categoria + preview curto do corpo; estado vazio ("Nenhum
  modelo encontrado") quando o filtro não corresponde a nenhum.
- [X] T014 [US1] Navegação por teclado dentro do dropdown: ArrowUp/ArrowDown movem
  um índice destacado; Enter com o dropdown aberto seleciona o destacado (em vez
  de enviar a mensagem); Escape fecha o dropdown sem apagar o texto.
- [X] T015 [US1] Clique em um item do dropdown também dispara `applyTemplate(t)` e
  fecha o dropdown.
- [X] T016 [US1] Confirmar que quando `templates` está vazio (organização sem
  modelos aprovados) escrever "/" mostra um estado vazio explicativo, não um
  dropdown vazio.

**Checkpoint**: US1 funcional e testada ao vivo de forma independente.

---

## Phase 3: User Story 2 - Completar cadastro manual de contato (Priority: P2)

**Goal**: Terminar o WIP existente para que escrever um telefone no buscador da
caixa de entrada permita iniciar/abrir sua conversa.

**Independent Test**: Ver spec.md § User Story 2 → Independent Test.

### Implementation for User Story 2

- [X] T020 [US2] Em `src/components/inbox/inbox-client.tsx`: implementar
  `startConversation(phone: string): Promise<boolean>` com `useCallback` — `POST
  /api/conversations` com `{ phone }`, em caso de sucesso `await refetchConversations()`,
  `select(conversation.id)` e retorna `true`; em caso de falha retorna `false` (não
  lança) para que `ConversationList` saiba se deve manter o texto de busca.
- [X] T021 [US2] Passar `onStartConversation={startConversation}` para `<ConversationList
  .../>` em `inbox-client.tsx` (hoje falta e quebra o build).
- [X] T022 [US2] Verificar que `POST /api/conversations` (já na árvore, sem commit)
  compila e respeita o schema Zod (`contactId` XOR `phone`+`name` opcional) — não
  requer mudanças se o WIP já estiver correto, apenas confirmar com o gate técnico.
- [X] T023 [US2] (encontrado durante o self-test E2E, não estava no plano original)
  O botão «Iniciar conversa» já existia computado (`startButton`) em
  `conversation-list.tsx` mas nunca era renderizado — adicionado à árvore. Além
  disso, uma falha de rede limpava o texto de busca da mesma forma (perdendo a
  possibilidade de tentar novamente, violando FR-011): o contrato de
  `onStartConversation` foi alterado para retornar `boolean` e só limpar a busca em
  caso de sucesso.

**Checkpoint**: US2 funcional e testada ao vivo de forma independente; o build não
falha mais pela prop ausente.

---

## Phase 4: Polish

- [X] T030 [P] Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`
- [X] T031 Self-test E2E ao vivo (Princípio IX) de ambas as histórias contra `pnpm dev` +
  Postgres local + mocks (`WA_MOCK_ENABLED=true`), agente de IA desativado de
  propósito (fora do escopo deste sprint). Cobre caminho feliz e infeliz (sem
  modelos aprovados, falha de rede em «Iniciar conversa»). 18/18 asserções aprovadas.

## Dependencies & Execution Order

- Setup (T001) bloqueia todo o resto.
- US1 (T010-T016) e US2 (T020-T022) são independentes entre si — sem dependências
  cruzadas de arquivos (US1 mexe em `composer.tsx`; US2 mexe em `inbox-client.tsx`).
- T011 depende de T010 (reutiliza `applyTemplate`).
- T013-T015 dependem de T012 (estado do dropdown).
- Polish (T030-T031) depende de que ambas as histórias estejam implementadas.

## Notes

- Sem novas tarefas de testes automatizados: a spec não os exige e o padrão de
  verificação deste projeto é o self-test E2E ao vivo (Princípio IX), não
  cobertura unitária por história.
- Zero tarefas de criação de arquivos novos de produto — todo o trabalho é edição
  de arquivos existentes.
