# Feature Specification: Campanhas de disparo em massa

**Feature Branch**: `004-campanhas-disparo-massa`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 2 do roadmap do Vocero: campanhas de disparo em massa, em dois modos — oficial (Meta API com templates aprovados, sem risco de ban) e não oficial (canal Baileys/Evolution com texto livre, risco de ban assumido). Lista de destinatários via CSV. Intervalo entre envios configurável. Habilitado pela emenda de constituição v2.0.0 (Princípios II, VIII, IX)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Disparar uma campanha oficial com um modelo aprovado (Priority: P1)

Como operador, quero criar uma campanha que envie um modelo já aprovado pela Meta
para uma lista de contatos que envio por CSV, para reativar leads frios sem arriscar
o número (canal oficial, sem possibilidade de ban).

**Why this priority**: É o modo sem risco — o que qualquer operador pode usar
de início, e o que valida o fluxo completo (CSV → destinatários → disparo →
métricas) antes de habilitar o modo de risco.

**Independent Test**: Com pelo menos um modelo aprovado, criar uma campanha oficial,
enviar um CSV de 2-3 telefones, dispará-la, e verificar que cada destinatário recebe
uma mensagem tipo modelo (visível em sua conversa) e que o contador de
enviados/falhados da campanha se atualiza ao vivo.

**Acceptance Scenarios**:

1. **Given** pelo menos um modelo aprovado existe, **When** o operador cria uma
   campanha escolhendo o canal "Oficial" e esse modelo, **Then** o formulário exige
   um CSV com telefone na primeira coluna e, se o modelo tiver {{1}}, uma
   coluna para seu valor.
2. **Given** um CSV enviado, **When** o operador o confirma, **Then** é exibida
   uma pré-visualização com o total de destinatários detectados e as primeiras
   linhas.
3. **Given** uma campanha oficial em rascunho com destinatários carregados, **When**
   o operador a dispara, **Then** o sistema cria (ou reutiliza) o contato e a
   conversa de cada destinatário e envia o modelo pelo canal oficial,
   um por um.
4. **Given** uma campanha sendo disparada, **When** o operador abre seu detalhe,
   **Then** vê ao vivo quantos foram enviados, quantos falharam e quantos restam,
   sem recarregar a página.
5. **Given** um modelo não aprovado (pendente ou rejeitado), **When** o operador
   tenta criar uma campanha oficial com ele, **Then** o sistema impede com uma
   mensagem clara.

---

### User Story 2 - Disparar uma campanha não oficial com texto livre e variáveis (Priority: P2)

Como operador com o canal não oficial conectado, quero enviar uma mensagem de texto
livre com variáveis próprias ({{nome}}, {{empresa}}...) para uma lista de contatos,
para campanhas mais personalizadas quando aceito o risco de banimento desse número.

**Why this priority**: Requer o canal não oficial já conectado (Princípio II v2)
e é o modo de maior risco — depende de que o modo oficial (US1) já teste o
fluxo base de CSV/disparo/métricas.

**Independent Test**: Com o canal não oficial conectado, criar uma campanha não
oficial com uma mensagem que use uma variável nomeada, um intervalo de envio
configurado, enviar um CSV com essa coluna, confirmar o aviso de risco de banimento,
dispará-la, e verificar que cada mensagem sai com a variável já substituída pelo
valor dessa linha e que o envio respeita o intervalo configurado (não em rajada).

**Acceptance Scenarios**:

1. **Given** o operador escolhe o canal "Não oficial" ao criar a campanha, **When**
   isso ocorre, **Then** o sistema MUST exibir um aviso explícito de risco de
   banimento que o operador deve confirmar antes de continuar.
2. **Given** uma campanha não oficial, **When** o operador escreve a mensagem com
   `{{variavel}}` nomeadas, **Then** o sistema detecta automaticamente os
   nomes de variável usados e os usa para mapear as colunas do CSV (além
   da primeira coluna, que sempre é o telefone).
3. **Given** uma campanha não oficial em rascunho, **When** o operador configura o
   intervalo entre envios, **Then** esse valor MUST ser editável pelo operador (não
   há um valor fixo não configurável) e é realmente usado entre cada envio.
4. **Given** uma campanha não oficial sendo disparada, **When** isso ocorre, **Then**
   cada mensagem sai com as variáveis dessa linha já substituídas no texto.
5. **Given** o canal não oficial não está conectado, **When** o operador tenta
   criar uma campanha não oficial, **Then** o sistema impede com uma mensagem clara
   indicando que deve conectar o canal primeiro.

---

### User Story 3 - Acompanhar e cancelar uma campanha em andamento (Priority: P3)

Como operador, quero ver o histórico de campanhas com suas métricas e poder
cancelar uma que está em andamento, para ter controle se algo der errado no meio do
caminho (números errados, modelo incorreto, etc.).

**Why this priority**: É controle/observabilidade sobre o que já constroem US1 e
US2 — valioso mas não bloqueia demonstrar o disparo em si.

**Independent Test**: Disparar uma campanha com vários destinatários, cancelá-la
no meio do caminho, e verificar que ela para de enviar novas mensagens e seu estado
fica "cancelada" com a contagem do que já foi enviado até aquele ponto (o que já foi
feito não se perde).

**Acceptance Scenarios**:

1. **Given** a lista de campanhas da organização, **When** o operador a abre,
   **Then** vê nome, canal, status e métricas (total/enviados/falhados) de cada
   uma, mais recentes primeiro.
2. **Given** uma campanha com status "enviando", **When** o operador a cancela,
   **Then** ela para de processar destinatários pendentes (os já enviados não são
   revertidos) e seu status passa a "cancelada".
3. **Given** uma campanha já terminada (enviada ou cancelada), **When** o operador
   a abre, **Then** não há ação de "disparar" nem "cancelar" disponível — apenas o
   detalhe final.

### Edge Cases

- CSV sem a coluna de telefone ou com telefones mal formados: essas linhas são
  reportadas como inválidas na pré-visualização, sem bloquear as linhas válidas.
- Um telefone do CSV coincide com um contato que já existe: o contato e sua
  conversa são reutilizados (idempotente), sem duplicar.
- Falha o envio a um destinatário pontual (Meta ou gateway indisponível): a
  campanha continua com o restante; esse destinatário fica marcado como falho com
  o motivo.
- O operador fecha a aba enquanto a campanha está sendo enviada: o envio continua
  no servidor (não depende do navegador aberto); ao reabrir o detalhe, vê o
  progresso real.
- Duplo clique em "Disparar": uma campanha já em status "enviando" não pode ser
  disparada novamente.
- Campanha oficial cujo modelo é rejeitado ou desconectado DEPOIS de criá-la
  mas ANTES de dispará-la: o disparo detecta isso e o rejeita com mensagem clara,
  sem falhar silenciosamente destinatário por destinatário.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir criar uma campanha escolhendo um canal
  ("oficial" ou "não oficial"), sujeito a que esse canal esteja disponível na
  organização (modelo aprovado para oficial; canal não oficial conectado para
  não oficial).
- **FR-002**: Uma campanha oficial MUST estar associada a um modelo aprovado
  existente; se esse modelo usa {{1}}, a campanha MUST exigir de onde vem o
  valor dessa variável por destinatário.
- **FR-003**: Uma campanha não oficial MUST ter um corpo de mensagem de texto
  livre que pode incluir variáveis nomeadas `{{como_esta}}`; o sistema MUST
  detectar automaticamente esses nomes.
- **FR-004**: O sistema MUST aceitar um CSV onde a primeira coluna é o
  telefone e as demais são variáveis por nome de coluna, e MUST exibir uma
  pré-visualização (total de linhas válidas/inválidas, primeiras linhas) antes de
  confirmar.
- **FR-005**: Criar uma campanha não oficial MUST exigir que o operador confirme
  explicitamente um aviso de risco de banimento antes de poder salvá-la.
- **FR-006**: O intervalo entre envios de uma campanha não oficial MUST ser um
  campo editável pelo operador (nunca um valor fixo no código), com um valor
  padrão razoável.
- **FR-007**: Disparar uma campanha MUST processar seus destinatários um por um,
  criando ou reutilizando o contato e a conversa de cada um de forma
  idempotente (mesmo comportamento que o resto do CRM).
- **FR-008**: Uma falha de envio a um destinatário MUST ser registrada nesse
  destinatário (com motivo) e MUST NOT interromper o envio ao restante.
- **FR-009**: O sistema MUST expor o progresso de uma campanha em andamento
  (enviados/falhados/pendentes) ao vivo, sem que o operador precise recarregar
  a página.
- **FR-010**: O operador MUST poder cancelar uma campanha em status "enviando";
  ao cancelá-la, ela para de processar destinatários pendentes sem reverter o
  que já foi enviado.
- **FR-011**: Uma campanha já em status "enviando" MUST NOT poder ser disparada
  de novo (nem por duplo clique nem por outra ação).
- **FR-012**: O sistema MUST rejeitar o disparo de uma campanha oficial se seu
  modelo já não estiver aprovado no momento do disparo (foi rejeitado ou
  removido), e de uma campanha não oficial se o canal já não estiver conectado.
- **FR-013**: O sistema MUST listar as campanhas da organização com seu canal,
  status e métricas, ordenadas por data de criação decrescente.

### Key Entities

- **Campanha**: nome, canal (oficial/não oficial), referência ao modelo
  (oficial) ou corpo de mensagem com variáveis (não oficial), intervalo entre
  envios, status (rascunho/enviando/enviada/cancelada), contadores
  (total/enviados/falhados), pertence a uma organização.
- **Destinatário de campanha**: telefone, variáveis nomeadas dessa linha (JSON),
  contato associado (uma vez criado/reutilizado), status individual
  (pendente/enviado/falho), motivo da falha se aplicável, pertence a uma campanha.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador pode criar e disparar uma campanha oficial completa
  (escolher modelo, enviar CSV, confirmar, disparar) em menos de 2 minutos para
  uma lista de até 10 destinatários.
- **SC-002**: 100% dos destinatários de uma campanha — bem-sucedidos ou falhos —
  ficam refletidos nas métricas dessa campanha; nenhum se "perde" no
  processo.
- **SC-003**: Cancelar uma campanha em andamento interrompe novos envios em menos
  de um intervalo de espera configurado (nunca continua disparando depois de
  cancelada).
- **SC-004**: Zero mensagens em rajada pelo canal não oficial: o tempo entre dois
  envios consecutivos de uma mesma campanha nunca é menor que o intervalo
  configurado.

## Assumptions

- **Sem agendamento nesta iteração**: o roadmap original menciona "agendar ou
  disparar agora"; esta iteração implementa apenas disparo imediato. Agendar para
  uma data/hora futura exigiria um mecanismo de nova tentativa após reinício do
  processo (persistência do scheduler) que ainda não está resolvido no projeto
  — é documentado como escopo futuro explícito, não é improvisado pela metade.
- **Destinatários apenas por CSV nesta iteração**: o roadmap também menciona
  selecionar contatos do CRM filtrando por etapa/tag. Isso fica fora desta
  iteração por escopo — o CSV já cobre o caso de uso principal (lista externa)
  e evita construir um seletor de filtros de pipeline/tags pela metade.
  Pode ser adicionado depois reutilizando o mesmo modelo de "destinatário de
  campanha".
- **Variável única {{1}} em campanhas oficiais**: o modelo de templates deste
  projeto já limita os modelos a no máximo uma variável {{1}} (limitação v1,
  `validateBodyVariables`); as campanhas oficiais herdam essa mesma limitação,
  não a ampliam.
- **Envio no próprio processo Node** (Constituição II: sem filas externas), assim
  como o turno do agente e o runner do Laboratório já funcionam: o disparo é
  executado em segundo plano dentro do mesmo processo que serve o app, não em um
  worker externo.
- **Progresso ao vivo via o mesmo bus de eventos SSE** que já é usado pela caixa
  de entrada e o Laboratório (`campaign.run`), não uma tecnologia nova.
