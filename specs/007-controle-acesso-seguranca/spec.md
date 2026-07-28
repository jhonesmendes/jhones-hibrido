# Feature Specification: Segurança & Controle de Acesso

**Feature Branch**: `007-controle-acesso-seguranca`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description: documento `seguranca_acesso.md` fornecido pelo dono — roles
simplificados (owner/admin/agent), permissões ajustáveis por membro, canais permitidos
por membro, convite por token, SMTP configurável pelo owner, recuperação de senha,
auditoria.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Base de controle de acesso (Priority: P1)

Como owner ou admin, quero que cada membro da equipe só possa fazer o que eu autorizei
(ver certas conversas, responder, mover pipeline, disparar campanhas etc.), para que um
atendente novo não tenha acesso irrestrito a dados ou ações sensíveis desde o primeiro
dia.

**Why this priority**: é o alicerce de tudo — sem verificação de permissão no
back-end, as demais histórias (tela de usuários, convites) não têm nada para configurar
de fato. Sem ela, qualquer membro autenticado hoje tem acesso equivalente a admin.

**Independent Test**: com dois membros de teste (um `agent` sem permissão
`campaigns:send`, outro com ela), confirmar que uma chamada para disparar campanha é
aceita para o segundo e rejeitada para o primeiro — testável via API, sem UI.

**Acceptance Scenarios**:

1. **Given** um membro com role `agent` e sem a permissão `conversations:view_all`,
   **When** ele tenta listar todas as conversas da organização, **Then** o sistema
   retorna apenas as conversas atribuídas a ele.
2. **Given** um membro com role `agent` sem a permissão `campaigns:send`, **When** ele
   tenta disparar uma campanha, **Then** o sistema recusa a ação com uma mensagem clara
   de permissão insuficiente.
3. **Given** um membro sem `can_view` liberado para o canal não oficial, **When** ele
   tenta abrir uma conversa desse canal, **Then** o acesso é negado.
4. **Given** o owner da organização, **When** ele executa qualquer ação, **Then** nunca é
   bloqueado por falta de permissão (owner sempre tem acesso total).

---

### User Story 2 - Tela de Usuários (gestão de equipe) (Priority: P1)

Como owner ou admin, quero uma tela onde vejo todos os membros da equipe e edito o
papel, status e permissões/canais de cada um, para não depender de mudanças manuais no
banco de dados.

**Why this priority**: sem uma UI, a US1 fica inacessível na prática para o dono do
negócio (não-técnico) — as duas P1 formam juntas o MVP mínimo utilizável desta feature.

**Independent Test**: como admin, abrir Configurações → Usuários, editar as permissões
de um agente existente e confirmar que a mudança realmente altera o comportamento
verificado na US1 (sem precisar de acesso ao banco).

**Acceptance Scenarios**:

1. **Given** a tela de Usuários, **When** o admin abre a lista, **Then** vê nome, email,
   role e status (ativo/inativo) de cada membro da organização.
2. **Given** o modal de edição de um membro, **When** o admin desmarca uma permissão e
   salva, **Then** o membro perde essa permissão imediatamente (sem precisar relogar).
3. **Given** um membro com role `agent`, **When** o admin tenta rebaixar o único `owner`
   da organização, **Then** o sistema impede (deve sempre existir ao menos um owner).
4. **Given** um membro marcado como inativo, **When** ele tenta logar, **Then** o acesso
   é negado com uma mensagem clara.

---

### User Story 3 - Convite por token (Priority: P2)

Como owner ou admin, quero gerar um link de convite com papel e permissões
pré-configurados, para adicionar um novo membro à equipe sem precisar de e-mail (SMTP)
nem de acesso ao painel de administração do banco.

**Why this priority**: depende da US1 (papéis/permissões) e da US2 (tela onde o link é
gerado), mas não depende de SMTP (US4) — por isso vem antes. Complementa a criação
direta já existente (owner define senha temporária na tela de equipe): o convite por
token não exige que o owner/admin conheça ou transmita uma senha, e é o único caminho
que um `admin` (não só `owner`) pode usar para trazer gente nova.

**Independent Test**: gerar um link de convite como admin, abrir em uma janela anônima,
criar a conta com nome+senha e confirmar que o novo membro já nasce com o papel e as
permissões definidas no convite.

**Acceptance Scenarios**:

1. **Given** a tela "Convidar membro", **When** o admin define papel, permissões, canais
   e expiração e gera o link, **Then** recebe uma URL copiável contendo um token único.
2. **Given** um link de convite válido, **When** um visitante o abre em `/register`,
   **Then** vê um formulário de nome + senha (sem precisar digitar email/token
   manualmente).
3. **Given** um link de convite já usado, **When** alguém tenta abri-lo de novo, **Then**
   vê uma mensagem de erro clara ("convite já utilizado").
4. **Given** um link de convite expirado, **When** alguém tenta usá-lo, **Then** vê uma
   mensagem de erro clara ("convite expirado") e o admin pode gerar um novo.
5. **Given** um convite restrito a um email específico, **When** alguém tenta se
   cadastrar com email diferente, **Then** o sistema recusa.

---

### User Story 4 - SMTP e recuperação de senha (Priority: P3)

Como owner, quero configurar um servidor SMTP próprio (opcional) para que a equipe
consiga recuperar a senha sozinha por email; e, quando eu não tiver SMTP configurado,
quero ver no painel quando alguém pediu redefinição de senha para poder gerar e enviar o
link manualmente.

**Why this priority**: é uma conveniência sobre um problema que já tem um caminho
manual (o owner sempre pode redefinir a senha de alguém via painel/token) — por isso
prioridade mais baixa que o alicerce de acesso e os convites.

**Independent Test**: sem SMTP configurado, solicitar "esqueci minha senha" como membro
e confirmar que o owner vê a solicitação pendente no painel e consegue gerar um link
funcional manualmente. Depois, configurar SMTP de teste e confirmar que o mesmo fluxo
passa a enviar o email automaticamente.

**Acceptance Scenarios**:

1. **Given** a tela Configurações → Email, **When** o owner preenche os dados de SMTP e
   clica em "Testar configuração", **Then** um email de teste chega na caixa do owner ou
   um erro claro é mostrado se a configuração estiver incorreta.
2. **Given** SMTP configurado e ativo, **When** um membro solicita "Esqueci minha
   senha", **Then** recebe um email com link de redefinição válido por 1 hora.
3. **Given** SMTP NÃO configurado, **When** um membro solicita "Esqueci minha senha",
   **Then** nenhum email é enviado, mas o owner vê uma notificação no painel com a
   solicitação pendente.
4. **Given** um link de redefinição expirado (>1h) ou já usado, **When** alguém tenta
   usá-lo, **Then** vê uma mensagem de erro clara.
5. **Given** uma senha SMTP salva, **When** qualquer tela ou log exibe a configuração,
   **Then** a senha nunca aparece em texto puro (mascarada ou omitida).

---

### User Story 5 - Auditoria (Priority: P4)

Como owner ou admin, quero ver um registro de quem fez o quê (login, convites,
mudanças de configuração, disparo de campanhas), para investigar problemas ou uso
indevido depois que já aconteceu.

**Why this priority**: é uma capacidade de observabilidade que não bloqueia o uso diário
da equipe — tem valor, mas é a menos urgente das cinco.

**Independent Test**: realizar uma ação auditável conhecida (ex.: convidar um membro) e
confirmar que ela aparece na tela de auditoria com autor, data e detalhes corretos.

**Acceptance Scenarios**:

1. **Given** uma ação crítica realizada (login, convite, canal criado, campanha
   disparada, configuração alterada), **When** ela ocorre, **Then** um registro de
   auditoria é criado com autor, ação, recurso e timestamp.
2. **Given** a tela de auditoria, **When** o owner/admin filtra por membro ou tipo de
   ação, **Then** vê apenas os registros correspondentes.
3. **Given** um membro sem papel owner/admin, **When** ele tenta acessar a tela de
   auditoria, **Then** o acesso é negado.

---

### Edge Cases

- Owner tenta se auto-rebaixar ou se desativar sendo o único owner → sistema impede,
  deve sempre restar ao menos um owner ativo.
- Token de convite ou de redefinição de senha reutilizado em uma corrida (duas abas
  abertas simultaneamente) → apenas o primeiro uso vence; o segundo recebe erro de
  "já utilizado".
- Membro perde uma permissão enquanto está com a aplicação aberta em outra aba → a
  próxima ação que exigir essa permissão é recusada pelo servidor (a UI pode continuar
  mostrando o botão até recarregar, mas o back-end é a fonte da verdade).
- SMTP configurado mas com credenciais erradas → "Testar configuração" MUST reportar o
  erro claro em vez de aparentar sucesso; o fluxo de recuperação de senha nunca falha
  silenciosamente (se o envio falhar, cai para o aviso ao owner no painel).
- Convite gerado por um admin que é removido/desativado antes de o convite ser usado →
  o convite continua válido (a autoria fica registrada, mas não é revogada em cascata).
- Contato/conversa atribuída a um agente que depois é desativado → a conversa permanece
  atribuída (histórico preservado); um admin pode reatribuir manualmente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST reconhecer exatamente três papéis por membro:
  `owner`, `admin`, `agent` — sem papel `viewer`.
- **FR-002**: O sistema MUST garantir que toda organização tenha sempre ao menos um
  membro com papel `owner` ativo (bloquear a última remoção/rebaixamento/desativação).
- **FR-003**: O sistema MUST permitir que owner/admin conceda ou revogue, por membro
  individual, cada permissão da lista fixa definida no código (conversas, pipeline,
  contatos, campanhas, relatórios, agente de IA).
- **FR-004**: O sistema MUST aplicar defaults de permissão por papel na criação do
  membro (owner e admin recebem todas as permissões; agent recebe um subconjunto
  operacional: ver conversas atribuídas, responder, ver/mover pipeline, ver contatos),
  permanecendo cada uma individualmente ajustável depois.
- **FR-005**: O sistema MUST permitir restringir, por membro, se ele pode ver e/ou
  enviar mensagens pelo canal oficial e, independentemente, pelo canal não oficial
  (cada organização tem no máximo um de cada — não é necessário granularidade por
  instância nomeada de canal).
- **FR-006**: O sistema MUST verificar a permissão correspondente no servidor antes de
  executar qualquer ação sensível (não confiar apenas na UI esconder o botão).
- **FR-007**: O sistema MUST permitir atribuir uma conversa a um membro específico, e
  um agente sem `conversations:view_all` MUST ver apenas as conversas atribuídas a ele.
- **FR-008**: O sistema MUST oferecer uma tela onde owner/admin listam todos os membros
  (nome, email, papel, status) e editam papel, status ativo/inativo, permissões e
  canais de qualquer membro exceto rebaixar/desativar o último owner.
- **FR-009**: O sistema MUST impedir o login de um membro marcado como inativo.
- **FR-010**: O sistema MUST permitir gerar um link de convite de uso único, contendo
  papel, permissões e canais iniciais pré-definidos, com expiração configurável
  (24h / 7 dias / 30 dias) e, opcionalmente, restrito a um email específico.
- **FR-011**: O sistema MUST validar o token de convite ao abrir `/register?token=...`
  e mostrar erro claro e específico para os casos: inválido, expirado, já usado, email
  não corresponde (quando restrito).
- **FR-012**: O sistema MUST criar a conta do novo membro, ao usar um convite válido,
  já com o papel/permissões/canais definidos no convite, e marcar o token como usado de
  forma atômica (nenhuma corrida deve permitir dois usos do mesmo token).
- **FR-013**: O convite por token é um caminho ADICIONAL, ao lado da criação direta
  já existente (owner define nome/email/senha temporária na tela de equipe), para
  trazer um novo membro sem precisar compartilhar senha manualmente — e o único que
  admin (não só owner) pode usar. O cadastro público aberto continua fechado após a
  primeira organização, como hoje.
- **FR-014**: O sistema MUST permitir que o owner configure um servidor SMTP próprio
  (host, porta, segurança, usuário, senha, remetente) e teste a configuração enviando
  um email de teste para si mesmo.
- **FR-015**: O sistema MUST cifrar a senha SMTP em repouso (mesmo padrão AES-256 já
  usado para outros segredos do produto) e nunca exibi-la em texto puro em nenhuma
  tela, log ou resposta de API.
- **FR-016**: O sistema MUST permitir que qualquer membro solicite redefinição de senha
  informando seu email.
- **FR-017**: O sistema MUST, quando SMTP estiver configurado e ativo, enviar um email
  com link de redefinição válido por 1 hora e de uso único.
- **FR-018**: O sistema MUST, quando SMTP NÃO estiver configurado (ou o envio falhar),
  notificar o owner no painel sobre a solicitação pendente, para que ele gere e envie o
  link manualmente — a solicitação nunca deve falhar silenciosamente sem deixar rastro
  para o owner.
- **FR-019**: O sistema MUST registrar um evento de auditoria (autor, ação, recurso,
  timestamp, IP quando disponível) para: login, convite gerado, convite usado, canal
  criado/removido, campanha disparada, alteração de configurações críticas (permissões,
  SMTP, papéis).
- **FR-020**: O sistema MUST oferecer uma tela de auditoria, restrita a owner/admin,
  filtrável por membro e por tipo de ação.
- **FR-021**: Toda tabela nova desta feature MUST levar `organization_id` (direta ou
  via `member_id`) e toda query MUST passar pelo helper `scoped()` existente — nenhuma
  exceção ao princípio de multi-tenancy do projeto.

### Key Entities

- **Member (existente, estendido)**: um usuário dentro de uma organização; papel
  (owner/admin/agent) e status ativo/inativo.
- **Permissão de membro**: concessão ou revogação individual de uma permissão nomeada
  para um membro específico, sobrepondo o default do papel.
- **Acesso a canal**: relação entre um membro e um tipo de canal (oficial ou não
  oficial — no máximo um de cada por organização hoje), com flags de visualizar
  e/ou enviar.
- **Atribuição de conversa**: vínculo entre uma conversa e o membro responsável por
  ela.
- **Token de convite**: credencial de uso único que carrega papel, permissões, canais
  iniciais, expiração e, opcionalmente, um email de destino; ao ser consumido, gera uma
  conta de membro.
- **Configuração de SMTP**: dados de conexão de um servidor de email pertencente ao
  próprio operador, usado para enviar convites (futuro) e emails de recuperação de
  senha; um por organização.
- **Token de redefinição de senha**: credencial de uso único e curta duração (1h)
  vinculada a um membro, usada para autorizar a troca de senha.
- **Registro de auditoria**: entrada imutável descrevendo uma ação realizada por um
  membro, com contexto suficiente para investigação posterior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um admin consegue restringir o acesso de um novo agente (papel +
  permissões + canais) em menos de 2 minutos, sem tocar em banco de dados ou código.
- **SC-002**: 100% das ações sensíveis (envio de mensagem, disparo de campanha,
  movimentação de pipeline, alteração de configuração) são recusadas no servidor quando
  o membro não tem a permissão correspondente — verificável por teste automatizado, não
  apenas pela UI.
- **SC-003**: Um novo membro consegue criar sua conta e começar a trabalhar em menos de
  1 minuto a partir de receber o link de convite, sem precisar de suporte técnico.
- **SC-004**: Um membro que esqueceu a senha recupera o acesso (via email automático ou
  via link manual do owner) sem precisar de intervenção no banco de dados.
- **SC-005**: Uma ação crítica realizada por qualquer membro aparece na tela de
  auditoria em até alguns segundos, com autor e horário corretos.
- **SC-006**: Em nenhum momento uma senha (de login ou de SMTP) aparece em texto puro
  em tela, log ou resposta de API — verificável por inspeção do código e por teste.

## Assumptions

- O plugin `organization` do Better Auth já usado no projeto continua sendo a base de
  autenticação/sessão; esta feature adiciona uma camada de permissões granulares por
  cima dele, sem substituir login/sessão/organização.
- "Registro fechado após a primeira organização" (regra já existente, FR-060 da
  spec 001) permanece válido; o convite por token é mais um caminho controlado para
  contorná-lo, ao lado da criação direta de conta já existente (`/api/settings/team`,
  owner-only, com senha temporária) — a US2 estende essa tela/rota em vez de
  substituí-la, adicionando papel `agent`/`admin`, permissões, canais e status.
- SMTP é uma integração OPCIONAL configurada e operada pelo próprio dono da
  organização (servidor de email dele, não um SaaS de terceiros embutido no produto).
  **Resolvido**: constituição emendada para 2.1.0 (MINOR, 2026-07-28), adicionando
  SMTP como terceira categoria opcional de dependência externa em runtime no
  Princípio II, análoga ao canal WhatsApp não oficial — confirmado contra o código
  real que nenhum client de e-mail nem hook de reset de senha existia antes desta
  feature.
- Rate limiting expandido e "logout de todos os dispositivos" (mencionados no documento
  de origem) ficam fora do escopo desta feature — tratados como follow-up futuro.
- A lista de permissões nomeadas é fixa em código nesta v1 (não editável pelo owner via
  UI) — apenas a concessão/revogação por membro é dinâmica.
- Convites e redefinição de senha usam tokens opacos (não JWT) armazenados/hasheados no
  banco, seguindo o mesmo padrão de outras credenciais de uso único já usadas no
  projeto (ex.: verificação do Better Auth).
