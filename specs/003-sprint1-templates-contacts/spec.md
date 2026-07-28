# Feature Specification: Atalho de modelos e cadastro manual de contato

**Feature Branch**: `003-sprint1-templates-contacts`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 1 do roadmap do Vocero (frontend puro, risco zero, apenas canal já existente). História A: atalho '/' para inserir modelos no composer da caixa de entrada, com a primeira variável numerada pré-selecionada e editável, unificando o comportamento com os chips de acesso rápido já existentes. História B: completar o cadastro manual de contato via 'iniciar conversa' por telefone, terminando o trabalho já iniciado (sem commit) no repositório."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inserir um modelo aprovado escrevendo "/" (Priority: P1)

Como operador que atende conversas de WhatsApp, quero escrever "/" no campo
de resposta e escolher um modelo aprovado de uma lista, para não precisar lembrar
ou reescrever mensagens que já uso com frequência — e poder corrigir rapidamente a
parte personalizada (nome, número do pedido, etc.) antes de enviar.

**Why this priority**: É o pedido explícito do dono do produto para este sprint;
reduz atrito na resposta diária sem mexer em nada do envio já construído.

**Independent Test**: Com pelo menos um modelo aprovado na organização, abrir uma
conversa, escrever "/" no campo de resposta e verificar que aparece a lista de
modelos; selecionar um e verificar que o corpo aparece no campo com a primeira
variável destacada; escrever sobre ela e enviar — a mensagem sai como uma mensagem
normal pelo canal correto da conversa.

**Acceptance Scenarios**:

1. **Given** o campo de resposta vazio, **When** o operador escreve "/", **Then** é
   exibido um dropdown com os modelos aprovados da organização.
2. **Given** o dropdown aberto, **When** o operador continua escrevendo depois de
   "/" (ex.: "/promo"), **Then** a lista é filtrada para os modelos cujo nome
   contém esse texto.
3. **Given** o dropdown aberto com resultados, **When** o operador seleciona um
   modelo (com o mouse ou com o teclado), **Then** o campo de resposta é preenchido
   com o corpo do modelo e, se o corpo tiver uma variável ({{1}}, {{2}}...), essa
   variável fica destacada/selecionada de forma que escrever sobre ela a substitui.
4. **Given** um modelo inserido com sua variável selecionada, **When** o operador
   não toca em nada e apenas envia, **Then** a mensagem é enviada com o texto do
   modelo tal como está (incluindo o marcador de variável não substituído) — o envio
   não é bloqueado.
5. **Given** o dropdown aberto, **When** o operador pressiona Escape, **Then** o
   dropdown se fecha e o texto escrito até aquele momento permanece no campo.
6. **Given** o dropdown aberto sem nenhuma correspondência, **When** isso ocorre,
   **Then** é exibido um estado vazio indicando que não há modelos com esse nome.
7. **Given** o operador clica em um dos modelos de acesso rápido (chips) que
   já existem acima do campo de resposta, **When** isso ocorre, **Then** o
   comportamento de inserção e seleção de variável é o mesmo do atalho "/"
   (deixa de substituir a variável silenciosamente pelo nome do contato).

---

### User Story 2 - Iniciar uma conversa (e cadastrar o contato) escrevendo um telefone (Priority: P2)

Como operador, quero poder escrever o número de telefone de uma pessoa que ainda
não me escreveu e abrir/criar sua conversa a partir daí, para poder registrar e
contatar manualmente alguém sem esperar que essa pessoa escreva primeiro.

**Why this priority**: Completa um trabalho já iniciado no repositório (sem
commit); é de menor escopo que a História 1 e não bloqueia mais nada.

**Independent Test**: No buscador da lista de conversas, escrever um número
de telefone que não tenha conversa prévia, ver a opção "Iniciar conversa", tocar
nela, e verificar que uma nova conversa se abre com esse contato (visível na lista
e selecionada), sem recarregar a página.

**Acceptance Scenarios**:

1. **Given** o buscador da lista de conversas vazio de resultados por nome,
   **When** o operador escreve uma sequência que parece um telefone, **Then** aparece
   uma opção para iniciar conversa com esse número.
2. **Given** a opção "Iniciar conversa" visível, **When** o operador a seleciona,
   **Then** o contato é criado (se não existia) ou reutilizado (se já existia), sua
   conversa é criada ou reutilizada, a lista de conversas é atualizada, e a
   conversa fica aberta/selecionada.
3. **Given** um telefone que já tem contato e conversa existentes, **When** o
   operador usa "Iniciar conversa" com esse mesmo número, **Then** a conversa
   existente é aberta em vez de criar um duplicado.
4. **Given** uma falha de rede ou do servidor ao iniciar a conversa, **When** isso
   ocorre, **Then** a interface não trava — o botão volta ao estado normal e
   o operador pode tentar novamente.

### Edge Cases

- Organização sem nenhum modelo aprovado: o atalho "/" deve mostrar um estado
  vazio claro em vez de uma lista vazia sem explicação.
- Modelo com mais de uma variável ({{1}} e {{2}}): apenas a primeira variável fica
  pré-selecionada; as seguintes ficam como texto normal editável manualmente.
- O operador escreve "/" no meio de um texto que já vinha escrevendo (não como
  primeiro caractere): não é interpretado como atalho — evita quebrar mensagens
  que legitimamente contêm uma barra.
- Telefone escrito no buscador com formato livre (espaços, hífens): é normalizado
  antes de ser usado, assim como já faz o resto do produto.
- Duplo clique / duplo Enter em "Iniciar conversa": não deve criar duas conversas
  para o mesmo número (idempotente, assim como a ingestão de mensagens recebidas).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O campo de resposta MUST detectar quando o operador escreve "/" como
  primeiro caractere e exibir um dropdown de modelos aprovados da organização.
- **FR-002**: O dropdown MUST filtrar ao vivo pelo texto escrito depois de "/",
  contra o nome do modelo.
- **FR-003**: Selecionar um modelo (mouse ou teclado) MUST inserir seu corpo no
  campo de resposta.
- **FR-004**: Se o corpo inserido contiver uma variável numerada, essa variável
  MUST ficar selecionada como texto editável imediatamente após a inserção.
- **FR-005**: O envio da mensagem resultante MUST usar o mesmo caminho de envio
  que qualquer mensagem de texto livre (sem novos requisitos de canal ou endpoint).
- **FR-006**: Os modelos de acesso rápido (chips) existentes MUST se comportar
  igual ao atalho "/" ao serem inseridos (variável selecionada e editável, não
  substituída silenciosamente).
- **FR-007**: O dropdown MUST fechar com Escape sem perder o texto já escrito.
- **FR-008**: O buscador da lista de conversas MUST reconhecer uma entrada que
  parece um número de telefone e oferecer a opção de iniciar uma conversa com ele.
- **FR-009**: Confirmar "Iniciar conversa" MUST criar o contato se não existir, ou
  reutilizá-lo se já existir (por organização + telefone), de forma idempotente.
- **FR-010**: Confirmar "Iniciar conversa" MUST criar a conversa se não existir,
  ou reutilizá-la se já existir, e deixá-la selecionada na interface sem recarregar
  a página.
- **FR-011**: Uma falha ao iniciar a conversa MUST deixar a interface em um
  estado que permita tentar novamente (não travada).

### Key Entities

- **Modelo (existente)**: nome, idioma, categoria, corpo com variáveis numeradas,
  status de aprovação. Nenhum campo novo é adicionado.
- **Contato (existente)**: telefone, nome. É reutilizado tal como está.
- **Conversa (existente)**: vínculo com um contato, canal ativo. É reutilizada tal
  como está — esta feature não introduz nem modifica canais.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador pode inserir um modelo no campo de resposta em menos
  de 3 ações (escrever "/", escrever opcionalmente para filtrar, selecionar).
- **SC-002**: 100% dos modelos inseridos (por "/" ou por chip) deixam a primeira
  variável em estado editável/selecionado, sem exceções entre as duas vias de acesso.
- **SC-003**: Um operador pode iniciar uma conversa nova a partir de um telefone
  escrito manualmente em menos de 10 segundos, sem recarregar a página.
- **SC-004**: Zero conversas ou contatos duplicados gerados por usos repetidos de
  "Iniciar conversa" sobre o mesmo número.

## Assumptions

- **Escopo do "cadastro manual de contato"**: o roadmap original menciona
  "cadastro manual de contatos" sem especificar uma tela dedicada. Assume-se que
  completar o fluxo "Iniciar conversa" por telefone (já iniciado no repositório, em
  `conversation-list.tsx` / `route.ts` / `utils.ts`) atende a essa necessidade, em
  vez de construir um formulário separado de "novo contato" na seção Contatos —
  porque neste produto um contato existe para conversar por WhatsApp, e é o
  padrão que já está pela metade na árvore. Um formulário dedicado em
  Contatos fica fora do escopo deste sprint; pode ser reconsiderado se o dono
  pedir explicitamente mais adiante.
- **Modelos e canal não oficial**: a seleção de modelo apenas insere texto no
  campo de resposta; o envio subsequente já decide o canal (oficial/não oficial)
  pela conversa, sem mudanças nesta feature. O conceito de "modelo aprovado pela
  Meta" continua sendo exclusivo do canal oficial, mas nada impede usá-lo como
  texto base também em uma conversa pelo canal não oficial.
- Esta feature não mexe na Fase 2 (motor não oficial) nem na Fase 3 (mídias na
  caixa de entrada) do roadmap: ambas já estão implementadas no código atual.
