# Feature Specification: Vocero CRM — Núcleo v1 (001-vocero-core)

**Feature Branch**: `001-vocero-core`

**Created**: 2026-07-09

**Status**: Draft

**Input**: Vocero CRM: CRM de WhatsApp com agente de IA, open source (MIT), self-hosted e
gratuito, projetado para que agências de IA o implantem no VPS de seus clientes (uma
instância = um negócio). Inclui caixa de entrada em tempo real, contatos + pipeline kanban,
agente de IA configurável com knowledge base, Laboratório de auto-avaliação do agente,
conexão do número de WhatsApp (direta ou modo agência), templates limitados,
multiusuário mínimo e instalação guiada em 15 minutos.

## Contexto de produto

- **Usuário primário**: a agência de automação/IA que implementa o CRM para um
  negócio cliente e o estende com ferramentas de IA (o código deve ser legível e
  modificável; fronteiras limpas, adaptadores, specs publicadas).
- **Usuário secundário**: o negócio que opera o CRM no dia a dia (dono e sua equipe).
- **Uma instância = um negócio**: cada implantação atende a um único negócio em seu
  próprio VPS/domínio. Sem billing, sem multi-tenant de plataforma.
- O repositório será público (MIT) e um vídeo será seu instalador oficial; a qualidade
  do texto em português neutro, os estados vazios e a estética importam como features.
- Origem dos padrões testados: **projeto de referência privado em produção** (portam-se
  padrões, não se copia código nem design).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Caixa de entrada de WhatsApp em tempo real (Priority: P1)

Como operador do negócio, vejo todas as conversas de WhatsApp do meu número em uma
caixa de entrada de 3 colunas (lista de conversas / thread de mensagens / painel do contato),
onde as mensagens recebidas aparecem sem recarregar a página, posso responder texto, ver
o estado das minhas mensagens (enviado/entregue/lido) e saber quando a janela de 24 horas
está fechada e o que fazer a respeito.

**Why this priority**: Sem caixa de entrada funcional não há CRM: é a superfície principal
de trabalho diário do negócio e o requisito de toda história posterior.

**Independent Test**: Com o número conectado (ou o ambiente de testes interno), enviar
uma mensagem recebida e vê-la aparecer na caixa de entrada aberta em ≤2 segundos sem
recarregar; responder pelo painel e ver o estado da mensagem progredir.

**Acceptance Scenarios**:

1. **Given** a caixa de entrada aberta no navegador, **When** chega uma mensagem recebida
   de um número novo, **Then** a conversa aparece na lista sem recarregar a página em
   ≤2 segundos, com o nome do perfil do remetente e o texto da mensagem.
2. **Given** uma conversa aberta, **When** o operador escreve e envia uma
   resposta, **Then** a mensagem aparece na thread e seu estado progride
   (enviado → entregue → lido) conforme chegam as confirmações.
3. **Given** uma conversa cuja última mensagem recebida tem mais de 24 horas,
   **When** o operador a abre, **Then** o campo de texto está bloqueado com uma
   explicação visível da janela de 24 horas e é oferecido o envio de um template
   aprovado (ver US6).
4. **Given** a caixa de entrada aberta e uma interrupção breve da conexão, **When** a
   conexão é restabelecida, **Then** a caixa de entrada recupera as mensagens que chegaram
   durante o intervalo sem intervenção do usuário (reconexão com recuperação).
5. **Given** uma mensagem recebida com conteúdo multimídia (imagem, áudio, documento),
   **When** aparece na thread, **Then** é exibido um indicador do tipo de conteúdo
   (v1 não mostra o conteúdo multimídia completo).
6. **Given** qualquer contato sem foto, **When** é exibido em lista/thread/kanban,
   **Then** seu avatar são suas iniciais sobre uma cor estável (sempre a mesma cor
   para o mesmo contato).

---

### User Story 2 - Contatos e pipeline kanban (Priority: P1)

Como operador do negócio, cada pessoa que escreve fica registrada automaticamente
como contato (com o nome do seu perfil, editável) e posso organizar minhas oportunidades
em um quadro kanban com etapas configuráveis, arrastando cartões entre etapas, além
de buscar contatos, adicionar notas e arquivar de forma reversível.

**Why this priority**: É a metade "CRM" do produto: converte conversas em um
pipeline de vendas operável.

**Independent Test**: Receber uma mensagem de um número novo → verificar que o contato
e seu lead existem; arrastar o cartão para outra etapa → recarregar → a posição persiste.

**Acceptance Scenarios**:

1. **Given** uma mensagem recebida de um número desconhecido, **When** é processada,
   **Then** o contato é criado com o nome do perfil de WhatsApp (editável) e um lead na
   primeira etapa do pipeline.
2. **Given** o quadro kanban com as etapas semeadas (Novo → Em conversa →
   Interessado → Cliente → Perdido), **When** o operador arrasta um cartão para outra
   etapa, **Then** a mudança persiste após recarregar a página.
3. **Given** um cartão do kanban, **When** o operador o observa, **Then** mostra
   contato, última atividade e um link direto que abre sua conversa na caixa de entrada.
4. **Given** as etapas configuráveis, **When** o operador as edita nas configurações,
   **Then** pode renomear/reordenar/adicionar etapas, e as âncoras "ganho" e "perdido"
   continuam existindo.
5. **Given** a visão de lista de contatos, **When** o operador busca por nome ou
   telefone, **Then** vê resultados filtrados; pode editar notas e arquivar/desarquivar
   um contato sem perder seu histórico.

---

### User Story 3 - Aba "Agente": comportamento + knowledge base (Priority: P1)

Como negócio, configuro um agente de IA com nome, tom, instruções, regras de
escalonamento e saudação, e dou a ele conhecimento (pares pergunta/resposta e blocos de
texto livre). O agente responde aos clientes com esse comportamento e conhecimento,
atualiza o lead, o move de etapa quando corresponde, e escala para um humano quando o
cliente pede, quando o próprio agente decide, ou quando há um erro ou a janela
está fechada.

**Why this priority**: O agente de IA é o diferencial do produto e o motor de
conversão; sem ele, Vocero é apenas uma caixa de entrada.

**Independent Test**: Com o provedor de IA de teste interno, enviar uma mensagem
recebida e verificar que o agente responde com sua configuração; enviar "quero falar
com um humano" e verificar o handoff (badge + IA silenciada).

**Acceptance Scenarios**:

1. **Given** o agente ativado com comportamento e KB configurados, **When** chega uma
   mensagem recebida com uma pergunta coberta pelo KB, **Then** o agente responde na
   conversa com uma resposta marcada como gerada por IA.
2. **Given** uma conversa onde o cliente demonstra intenção de compra, **When** o
   agente detecta isso, **Then** pode mover o lead de etapa e/ou atualizar seus dados, e
   a mudança se reflete no kanban.
3. **Given** um cliente que escreve "quero falar com um humano" (ou variantes dessa
   intenção), **When** o agente processa a mensagem, **Then** ocorre o handoff: a
   conversa mostra um badge visível, a IA fica silenciada nessa conversa e não
   volta a responder até que um humano a reative.
4. **Given** a frase "somos 4 pessoas" em uma mensagem, **When** é avaliada a detecção
   de intenção de escalonamento de respaldo, **Then** NÃO dispara o handoff (verificado
   com teste unitário do padrão de respaldo).
5. **Given** o toggle global do agente desligado (ou o toggle de uma conversa),
   **When** chega uma mensagem, **Then** o agente não responde no âmbito desligado.
6. **Given** que NÃO há provedor de IA configurado, **When** o usuário abre as
   abas Agente ou Laboratório, **Then** vê um estado vazio explicativo ("Configure seu
   provedor de IA…") com link para configuração e ações desabilitadas; o sistema
   jamais usa o provedor de teste interno como substituto fora do ambiente de
   desenvolvimento.
7. **Given** o editor do knowledge base, **When** o conteúdo se aproxima do limite de
   contexto do modelo, **Then** um contador de tamanho mostra um aviso (v1 injeta o
   KB completo no prompt; o limite é documentado honestamente).
8. **Given** várias mensagens seguidas do mesmo cliente em poucos segundos, **When** o
   agente processa, **Then** responde UMA única vez ao conjunto (agrupamento) e nunca
   processa dois turnos simultâneos da mesma conversa (bloqueio por conversa).
9. **Given** um erro do provedor de IA ou resposta com formato inesperado, **When**
   ocorre em um turno, **Then** o sistema tolera a falha (extração robusta +
   retentativas) e um único soluço do provedor nunca derruba o turno nem marca erro na
   primeira vez; se a falha persistir, a conversa escala para humano (caso de erro).

---

### User Story 4 - Laboratório: o agente se testa sozinho (Priority: P1)

Como agência, antes de entregar a instância (e após cada mudança do knowledge
base) executo uma avaliação automática onde 6 clientes simulados conversam com o
agente real em um ambiente interno que jamais toca o WhatsApp, um juiz independente avalia
cada conversa, e recebo um relatório com score, achados com evidência e sugestões
que posso aplicar com um clique ao knowledge base — e ao executar novamente vejo se
melhorei.

**Why this priority**: É a peça estelar e o diferencial do produto: converte
"espero que o bot funcione" em um ciclo mensurável de melhoria.

**Independent Test**: Com o provedor de IA de teste interno: executar uma avaliação →
verificar que as 6 conversas simuladas existem como conversas de teste, que
nenhuma tocou a API do WhatsApp, que o relatório mostra score e ao menos um achado com
sugestão aplicável; aplicá-la → executar novamente → o histórico mostra 2 execuções com
delta.

**Acceptance Scenarios**:

1. **Given** a aba Laboratório com provedor de IA configurado, **When** o usuário
   clica em "Executar avaliação", **Then** uma execução é lançada em segundo plano e a UI
   mostra o progresso sem bloquear a navegação.
2. **Given** uma execução em andamento, **When** é executada, **Then** 6 personas
   ROTEIRIZADAS fixas (comprador decidido, questionador de preços, cliente irritado,
   pergunta fora do knowledge base, pede um humano, escreve com erros e gírias)
   conversam sequencialmente com o agente REAL (mesmo pipeline da US3) em conversas
   marcadas como teste; cada conversa termina ao esgotar seu roteiro ou no primeiro
   handoff.
3. **Given** o ambiente de testes do Laboratório, **When** qualquer conversa de
   teste tenta enviar uma mensagem real de WhatsApp, **Then** o envio é bloqueado por
   uma asserção rígida do sistema (exceção; coberto por teste unitário) — o Laboratório
   é 100% interno e sua UI o declara de forma permanente ("Sandbox interno — não envia
   mensagens reais").
4. **Given** as 6 conversas encerradas, **When** o juiz avalia, **Then** há
   exatamente UMA avaliação por conversa (6 por execução) com veredito
   verde/amarelo/vermelho e achados tipados (alucinação / fora do KB / deveria ter
   escalado / tom) com evidência e sugestão opcional.
5. **Given** a execução concluída, **When** o usuário abre o relatório, **Then** vê um
   score global 0–100 (% ponderado de conversas verdes), cartões de achado com
   evidência, e sugestões aplicáveis com um clique que pré-preenchem uma entrada do KB
   para editar e salvar.
6. **Given** uma sugestão aplicada ao KB, **When** o usuário executa a avaliação
   novamente, **Then** o histórico mostra ambas as execuções com o delta de score em
   relação à anterior.
7. **Given** uma execução em andamento, **When** o usuário tenta lançar outra, **Then**
   o sistema o impede (máximo 1 execução concorrente por organização).
8. **Given** uma execução que ultrapassa o tempo máximo (10 minutos) ou um reinício
   do servidor com execuções ativas, **When** ocorre, **Then** a execução fica marcada
   como falha — nunca "executando" para sempre.

---

### User Story 5 - Conexão do número: direta ou modo agência (Priority: P1)

Como agência (ou negócio direto), conecto o número de WhatsApp da instância a partir de
um wizard em Configuração → WhatsApp: colo o WABA ID, Phone Number ID e token; o sistema
valida que o token corresponde ao número antes de salvar (criptografado); e obtenho a URL
completa do webhook pronta para copiar no painel da Meta (modo direto) ou para o
override do meu backend de agência (modo Tech Provider). O CRM consome o token — NÃO
implementa o Embedded Signup.

**Why this priority**: Sem conexão do número não existe o produto em produção; e o
modo agência é a razão de ser do projeto (agências implantando por cliente).

**Independent Test**: Completar o wizard contra o ambiente de testes interno (token
válido → salva criptografado; token inválido → erro claro sem salvar); verificar que o
webhook responde ao handshake de verificação na URL com token na rota e rejeita
segmentos incorretos com 404.

**Acceptance Scenarios**:

1. **Given** o wizard de conexão, **When** o usuário cola WABA ID, Phone Number ID e
   token e clica em "testar conexão", **Then** o sistema valida token↔número contra a
   API da Meta ANTES de salvar; se for válido, salva o token criptografado e mostra o
   estado conectado; se não (p. ex. token expirado), mostra um erro claro e NÃO salva.
2. **Given** a conexão salva, **When** o usuário vê o painel, **Then** vê a URL
   COMPLETA do webhook pronta para copiar (inclui o token de verificação como segmento
   da rota, construída sobre o domínio público https da instância).
3. **Given** o webhook público, **When** a Meta (ou o backend da agência) faz o
   handshake de verificação GET com o token correto, **Then** responde o challenge;
   **When** qualquer POST chega com o segmento de token incorreto, **Then** responde
   404 sem nenhum efeito no sistema.
4. **Given** o segredo de assinatura do app configurado (opcional, recomendado no modo
   direto), **When** chega um POST com assinatura inválida, **Then** responde 401 e não
   processa; **Given** que NÃO está configurado, **Then** o webhook funciona protegido
   pela URL secreta e Configuração mostra um aviso informativo (não um erro).
5. **Given** o wizard, **When** o usuário o lê, **Then** distingue as DUAS origens
   do token: (a) modo direto — app da Meta próprio do negócio (token de usuário do
   sistema; aí convém configurar também o segredo de assinatura); (b) modo agência
   (Tech Provider) — o token é obtido pelo backend da agência ao completar SEU Embedded
   Signup, sem segredo de assinatura.
6. **Given** o README, **When** a agência segue o checklist de modo agência, **Then**
   encontra os 5 passos exatos com diagrama de texto: (1) implantar a instância
   primeiro, (2) Embedded Signup + token exchange no backend da agência,
   (3) configurar o override do callback para a URL do wizard com o verify token desta
   instância (em nível de WABA), (4) registrar o número se aplicável, (5) colar
   credenciais no wizard e testar a conexão. A sintaxe do override é verificada contra a
   documentação oficial da Meta antes de ser publicada.

---

### User Story 6 - Templates de WhatsApp limitados (Priority: P2)

Como operador, crio templates de mensagem (nome, idioma, categoria, corpo com UMA
variável), envio-os para aprovação da Meta, vejo seu estado sincronizado (pendente /
aprovado / rejeitado com motivo), e posso enviar um template aprovado a partir da caixa
de entrada quando a janela de 24 horas está fechada.

**Why this priority**: Completa o ciclo da janela de 24h da US1 (sem templates, as
conversas frias são um beco sem saída), mas o CRM funciona sem ela para
conversas ativas.

**Independent Test**: Criar um template contra o ambiente de testes → estado pendente
→ simular o evento de aprovação → estado aprovado → abrir uma conversa com janela
fechada → enviar o template → verificar o envio na caixa de saída simulada.

**Acceptance Scenarios**:

1. **Given** a aba Templates, **When** o usuário cria um template (nome,
   idioma, categoria, corpo com uma variável `{{1}}`), **Then** é enviado para aprovação
   da Meta e fica em estado pendente.
2. **Given** um template pendente, **When** chega o evento de mudança de estado da
   Meta (aprovado ou rejeitado), **Then** o estado é atualizado na UI; se foi
   rejeitado, o motivo é exibido.
3. **Given** uma conversa com janela de 24h fechada, **When** o operador abre o
   seletor de templates oferecido pela caixa de entrada, **Then** pode escolher um
   template APROVADO, preencher o valor da variável, e enviá-lo; a mensagem sai
   corretamente e aparece na thread.
4. **Given** o escopo v1, **Then** variáveis múltiplas e exclusão de templates ficam
   no roadmap (documentado).

---

### User Story 7 - Multiusuário mínimo (Priority: P3)

Como dono do negócio, me cadastro como o primeiro usuário (criando a organização) e
crio contas para minha equipe em Configuração (email + senha temporária), sem
sistema de convites nem emails. Após a primeira organização, o cadastro
público fica fechado.

**Why this priority**: O negócio pode operar com uma única conta; a equipe mínima é
uma melhoria incremental.

**Independent Test**: Cadastrar o primeiro usuário → org criada; tentar um segundo
cadastro público → desabilitado; criar conta de equipe em Configuração → login
funciona.

**Acceptance Scenarios**:

1. **Given** uma instância recém-instalada sem organizações, **When** o primeiro
   usuário se cadastra, **Then** são criadas sua conta e a organização, e ele fica como
   proprietário.
2. **Given** uma organização existente, **When** outra pessoa tenta se cadastrar pela
   página pública, **Then** o cadastro está desabilitado com mensagem clara (salvo
   se o operador habilitar explicitamente a variável de escape).
3. **Given** o proprietário em Configuração → Equipe, **When** cria uma conta com email
   e senha temporária, **Then** o novo usuário pode iniciar sessão com essa
   senha.
4. **Given** os formulários de login/cadastro, **When** recebem tentativas repetidas
   abusivas a partir de um IP, **Then** aplica-se limitação de taxa.

---

### User Story 8 - Instalação em 15 minutos (Priority: P1)

Como agência, instalo o Vocero no VPS do meu cliente em ~15 minutos seguindo o README:
pela Rota A (painel Coolify guiado por um assistente de IA com o arquivo INSTALL-IA.md)
ou pela Rota B (docker compose com HTTPS automático). Ao terminar, o sistema me indica
explicitamente que a conexão do WhatsApp é feita depois, em Configuração →
WhatsApp.

**Why this priority**: A instalação É o produto (o vídeo é o instalador oficial);
se não instala de primeira, o projeto falha em seu propósito.

**Independent Test**: Em um diretório temporário, clonar o repositório e seguir o README
da Rota B literalmente (modo de testes interno) até ver a caixa de entrada funcionando.

**Acceptance Scenarios**:

1. **Given** um VPS com Coolify e o arquivo INSTALL-IA.md, **When** o assistente de IA
   o executa com o MCP do Coolify, **Then** implanta o banco de dados e o app,
   configura domínio e variáveis, e verifica o healthcheck — perguntando ao usuário
   APENAS: domínio (obrigatório), token do OpenRouter (opcional) e rota A ou B; os
   segredos ele mesmo gera.
2. **Given** um VPS com Docker (sem Coolify), **When** o usuário segue a Rota B,
   **Then** `docker compose up` sobe app + banco de dados + proxy com HTTPS automático
   usando a variável `DOMAIN`, com healthchecks nos três serviços.
3. **Given** a instalação concluída, **When** finaliza, **Then** o instalador diz
   explicitamente: "acesse Configuração → WhatsApp para conectar seu número; lá você
   verá a URL exata do webhook" — a conexão do WhatsApp NÃO é parte da implantação.
4. **Given** o banco de dados vazio na primeira inicialização, **When** o usuário
   entra, **Then** vê um estado vazio com o botão "Carregar dados de demonstração"
   que popula o negócio demo ("Ferretería El Martillo": ~8 contatos, conversas
   realistas em MXN, leads no kanban, knowledge base preenchida com 1–2 lacunas
   INTENCIONAIS —garantias e devoluções— e uma execução de Laboratório de exemplo
   salva).
5. **Given** o README público, **When** uma agência o lê, **Then** encontra: o que é
   (com captura de tela) → para quem → features (Laboratório primeiro) → requisitos →
   apontar o domínio para a VPS → instalação A e B → configuração da Meta passo a passo
   → modo agência (checklist de 5 passos + diagrama + nota de segurança do token na URL)
   → configuração da IA → conformidade com as políticas da Meta (5 pontos, incluindo
   que o Laboratório é 100% interno) → FAQ de erros comuns → roadmap → licença MIT →
   créditos.

---

### Edge Cases

- **Webhook**: evento duplicado (mesmo ID de mensagem) → uma única mensagem
  persistida; segmento de token incorreto → 404 sem efeitos; assinatura inválida
  (quando o segredo está configurado) → 401; payloads de eventos não suportados
  (reações, stickers) → são ignorados sem erro.
- **Janela de 24h**: exatamente no limite; conversa sem nenhuma mensagem recebida
  (iniciada por template); o agente NUNCA envia texto livre com a janela fechada.
- **Agente**: provedor fora do ar ou resposta não parseável → retentativa com extração
  robusta; falha persistente → escalonamento para humano; mensagens em rajada → uma
  única resposta agrupada; dois webhooks simultâneos da mesma conversa → o bloqueio
  evita duplo turno.
- **Laboratório**: execução interrompida por reinício → marcada como falha ao
  arrancar; segunda execução simultânea → rejeitada; juiz devolve formato inválido →
  retentativa e, se persistir, o caso fica marcado sem veredito (não trava a
  execução).
- **Wizard**: token válido, mas de outro número → erro claro; instância sem domínio
  público ainda → a URL do webhook é exibida com o valor configurado e um aviso.
- **Kanban**: arrastar para a mesma etapa; contato arquivado com lead ativo; exclusão
  de uma etapa com leads (reatribuição exigida).
- **Cadastro**: dois cadastros simultâneos em instância vazia → apenas um cria a
  organização.
- **Instalação**: variáveis faltando ao arrancar → mensagem de erro clara (validação
  de ambiente), não um crash críptico.

## Requirements *(mandatory)*

### Functional Requirements

**Caixa de entrada (US1)**

- **FR-001**: O sistema MUST exibir uma caixa de entrada de 3 colunas: lista de
  conversas, thread de mensagens e painel do contato.
- **FR-002**: As mensagens recebidas MUST aparecer na caixa de entrada aberta sem
  recarregar, em ≤2 segundos desde seu recebimento, por meio de um canal de eventos do
  servidor que funcione atrás de proxies HTTP padrão e sem exigir um servidor
  personalizado.
- **FR-003**: O canal de tempo real MUST reconectar-se sozinho após uma interrupção e
  recuperar as mensagens do intervalo sem intervenção do usuário.
- **FR-004**: O operador MUST poder enviar respostas de texto pelo painel, com
  estados visíveis da mensagem (enviado / entregue / lido) atualizados por eventos.
- **FR-005**: O sistema MUST tornar visível o estado da janela de 24 horas; com
  janela fechada MUST bloquear o campo de texto, explicar o motivo e oferecer o envio
  de template aprovado.
- **FR-006**: As mensagens recebidas multimídia MUST ser exibidas como indicador de
  tipo (v1); os avatares MUST ser iniciais com cor estável por contato.

**Contatos e pipeline (US2)**

- **FR-010**: Todo remetente novo MUST ficar registrado automaticamente como contato
  (nome do perfil, editável) com um lead na primeira etapa.
- **FR-011**: O kanban MUST suportar arrastar e soltar com persistência, etapas
  configuráveis (semeadas: Novo → Em conversa → Interessado → Cliente → Perdido) e
  âncoras de ganho/perdido.
- **FR-012**: Cada cartão MUST mostrar contato, última atividade e link direto para
  sua conversa.
- **FR-013**: A visão de lista MUST oferecer busca, notas por contato e arquivamento
  reversível.

**Agente (US3)**

- **FR-020**: A aba Agente MUST ter duas seções: Comportamento (nome, tom,
  instruções, regras de escalonamento, saudação) e Knowledge base (entradas
  pergunta/resposta + blocos de texto livre, com CRUD e contador de tamanho com aviso
  ao se aproximar do limite de contexto).
- **FR-021**: O agente MUST responder usando comportamento + KB completos (v1 injeta
  todo o KB; o limite é documentado), e MUST executar no máximo uma ação tipada por
  turno: `none | reply | update_lead | move_stage | handoff`, com saída estruturada
  validada.
- **FR-022**: O handoff MUST disparar em 3 casos: o cliente pede (detecção do
  modelo + padrão de respaldo por intenção que NÃO dispara com "somos 4 pessoas"),
  o modelo decide, ou erro/janela fechada. Após o handoff: badge visível + IA
  silenciada nessa conversa até reativação explícita.
- **FR-023**: O agente MUST ter toggle global e por conversa.
- **FR-024**: As mensagens em rajada MUST ser agrupadas em um único turno (debounce) e
  cada conversa MUST ter bloqueio que impeça turnos concorrentes.
- **FR-025**: O provedor de IA MUST ser acessado apenas por meio do adaptador
  compatível com OpenRouter (URL base, modelo e modelo do juiz configuráveis por
  ambiente; o modelo do juiz por padrão é o modelo principal); a saída do modelo MUST
  ser tolerada com extração robusta e retentativas — um único soluço do provedor nunca
  derruba o turno.
- **FR-026**: Sem token de IA configurado, as abas Agente e Laboratório MUST mostrar
  estado vazio explicativo com ações desabilitadas; o provedor de teste interno
  NUNCA é fallback fora do desenvolvimento.

**Laboratório (US4)**

- **FR-030**: O Laboratório MUST executar 6 personas roteirizadas fixas (sequências
  predefinidas de 4–5 mensagens, sem LLM para o cliente simulado) contra o agente real
  (mesmo pipeline da US3) em conversas marcadas como teste, com agrupamento de
  mensagens desativado (debounce em 0) e turnos sequenciais.
- **FR-031**: As conversas de teste MUST ter proibido alcançar a API do
  WhatsApp: o componente de envio MUST lançar uma exceção se tentar (asserção
  rígida com teste unitário).
- **FR-032**: Um juiz independente MUST avaliar cada conversa com UMA chamada (6 por
  execução), recebendo transcript completo + KB + comportamento, e devolver um veredito
  estruturado e validado: verde/amarelo/vermelho + achados tipados (alucinação /
  fora_do_kb / deveria_ter_escalado / tom) com evidência e sugestão opcional
  (pergunta/resposta).
- **FR-033**: O relatório MUST mostrar score global 0–100 (% ponderado de conversas
  verdes), cartões de achado com evidência, e sugestões aplicáveis com um clique que
  pré-preenchem uma entrada do KB para editar e salvar; o histórico MUST listar
  execuções com delta de score em relação à anterior (sem gráficos na v1).
- **FR-034**: A execução MUST ser em segundo plano dentro do processo (sem fila
  externa), com progresso consultável, timeout global de 10 minutos → falha, máximo 1
  execução concorrente por organização (bloqueio no banco de dados), e execuções
  "executando" órfãs ao arrancar → falha.
- **FR-035**: A UI do Laboratório MUST declarar de forma permanente que é um sandbox
  interno que não envia mensagens reais.

**Conexão do número (US5)**

- **FR-040**: O wizard MUST capturar WABA ID, Phone Number ID e token; MUST validar
  token↔número contra a API da Meta antes de salvar; e MUST salvar o token
  criptografado em repouso.
- **FR-041**: O webhook MUST viver em uma rota que inclui o token de verificação como
  segmento secreto; o handshake GET MUST validar o token; todo POST com segmento
  incorreto MUST responder 404 sem efeitos.
- **FR-042**: A verificação de assinatura MUST se aplicar apenas se o segredo do app
  estiver configurado (assinatura inválida → 401); sem segredo, Configuração MUST
  mostrar aviso informativo (não erro) de que a proteção é por URL secreta.
- **FR-043**: O painel MUST mostrar a URL COMPLETA do webhook pronta para copiar,
  construída sobre o domínio público https configurado.
- **FR-044**: O wizard MUST explicar as duas origens do token (modo direto com app
  próprio / modo agência Tech Provider via Embedded Signup da agência com override do
  callback); o CRM MUST NOT implementar Embedded Signup.
- **FR-045**: O README MUST incluir o checklist de modo agência de 5 passos com
  diagrama de texto e nota de segurança sobre o token na URL, com a sintaxe do override
  verificada contra a documentação oficial da Meta.

**Templates (US6)**

- **FR-050**: O sistema MUST permitir criar templates (nome, idioma, categoria,
  corpo com exatamente uma variável), enviá-los para aprovação e refletir seu estado
  (pendente/aprovado/rejeitado com motivo) sincronizado pelo evento de mudança de
  estado.
- **FR-051**: A partir de uma conversa com janela fechada, o operador MUST poder
  escolher um template aprovado, preencher a variável e enviá-lo; a mensagem MUST ser
  registrada na thread.

**Multiusuário (US7)**

- **FR-060**: O primeiro cadastro MUST criar usuário + organização (proprietário); com
  uma organização existente o cadastro público MUST estar fechado salvo variável de
  escape explícita.
- **FR-061**: O proprietário MUST poder criar contas de equipe (email + senha
  temporária) em Configuração, sem emails nem convites.
- **FR-062**: Login e cadastro MUST ter limitação de taxa por IP.

**Instalação (US8)**

- **FR-070**: O repositório MUST implantar limpo no Coolify como app Docker (imagem
  multi-etapa, migrações ao arrancar, healthcheck em `/api/health`, banco de dados
  como serviço separado), guiado por `INSTALL-IA.md` para um assistente de IA com o MCP
  do Coolify.
- **FR-071**: `INSTALL-IA.md` MUST perguntar apenas domínio (obrigatório), token do
  OpenRouter (opcional) e rota A ou B; MUST gerar os segredos ele mesmo (incluído o
  token de verificação do webhook que define a rota); e MUST terminar indicando que a
  conexão do WhatsApp é feita em Configuração → WhatsApp.
- **FR-072**: A Rota B MUST ser um `docker-compose.yml` com app + banco de dados +
  proxy com HTTPS automático (variável `DOMAIN`), URL de banco de dados interna e
  healthchecks nos três serviços.
- **FR-073**: O README MUST seguir a estrutura completa definida na US8 cenário 5,
  em português neutro.
- **FR-074**: `.env.example` MUST conter todas as variáveis com placeholders
  `REEMPLAZA_...`, guia inline e comando de geração de cada segredo; a variável do
  modo de testes interno MUST NOT aparecer nele.
- **FR-075**: Com banco de dados vazio, a UI MUST oferecer "Carregar dados de
  demonstração" (também via script e variável), semeando o negócio demo com as lacunas
  intencionais do KB e uma execução de Laboratório de exemplo, de forma idempotente.

**Segurança de instância pública (transversal, cada regra com teste unitário)**

- **FR-080**: As rotas do ambiente de testes interno (mock de WhatsApp e de IA) MUST
  responder 404 incondicional em produção.
- **FR-081**: O cadastro MUST fechar-se após a primeira organização (salvo escape) e
  login/cadastro MUST ter limitação de taxa (= FR-060/FR-062).
- **FR-082**: O Laboratório MUST ter bloqueado o acesso à API real do WhatsApp
  (= FR-031).
- **FR-083**: O webhook MUST rejeitar segmento de token incorreto com 404 e, com
  segredo configurado, assinatura inválida com 401 (= FR-041/FR-042).
- **FR-084**: Todo evento recebido MUST ser processado de forma idempotente (ID de
  mensagem único; duplicado → sem efeitos adicionais).
- **FR-085**: Todo dado de domínio MUST estar isolado por organização; nenhuma
  consulta sem escopo de tenant.

### Key Entities

- **Organização / usuários** (do sistema de auth): `user`, `session`, `account`,
  `verification`, `organization`, `member`, `invitation` (esta última sem UI na v1).
- **contact**: pessoa que escreve por WhatsApp; nome do perfil editável, telefone,
  notas, arquivamento; pertence a uma organização.
- **pipeline_stage**: etapa configurável do kanban com ordem e âncoras ganho/perdido.
- **lead**: oportunidade de um contato; referência à sua etapa; última atividade.
- **conversation**: thread com um contato; inclui marca `is_test` (Laboratório), estado
  de handoff e toggle de IA.
- **message**: mensagem recebida/enviada; ID de WhatsApp único (idempotência), estados,
  marca de gerado por IA, tipo de conteúdo.
- **meta_credentials**: conexão do número (WABA ID, Phone Number ID único, token
  criptografado, estado).
- **agent_profile**: comportamento do agente (nome, tom, instruções, regras de
  escalonamento, saudação, toggle global).
- **kb_entry**: entrada do knowledge base (pergunta/resposta ou bloco livre).
- **template**: template de WhatsApp (nome, idioma, categoria, corpo, estado, motivo
  de rejeição, ID externo).
- **agent_test_run**: execução do Laboratório (score, estado, início/fim).
- **agent_test_case**: caso por persona (transcript, veredito, achados, sugestões).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma mensagem recebida aparece na caixa de entrada aberta em ≤2 segundos
  sem recarregar, tanto em desenvolvimento quanto atrás do proxy da instalação Rota B.
- **SC-002**: Uma agência pode completar a instalação (Rota A ou B) em ~15 minutos
  até ver a tela de login, sem tocar em código.
- **SC-003**: O fluxo completo do Laboratório (executar → relatório com ≥1 achado
  acionável → aplicar sugestão → executar novamente → delta visível) se completa sem
  intervenção técnica e sem que nenhuma mensagem simulada saia para o WhatsApp.
- **SC-004**: 100% dos eventos recebidos duplicados não gera efeitos duplicados;
  100% dos POST ao webhook com token de rota incorreto responde 404 sem efeitos.
- **SC-005**: Com a janela de 24h fechada, 100% das tentativas de envio de texto
  livre (humano ou agente) fica bloqueado, e o envio de template aprovado funciona.
- **SC-006**: Um cliente simulado que pede um humano produz handoff em 100% dos
  casos da avaliação; a frase "somos 4 pessoas" nunca o produz (teste).
- **SC-007**: Todo o texto de produto visível está em português neutro; o repositório
  público não contém segredos nem referências privadas (auditoria de vazamentos em
  verde).
- **SC-008**: Instância sem token de IA: caixa de entrada, kanban, templates e conexão
  funcionam 100%; Agente e Laboratório mostram seu estado vazio explicativo.

## Assumptions

- A equipe do negócio opera em português; v1 não inclui i18n.
- v1: multimídia recebida apenas como indicador de tipo; RAG do KB, personas
  configuráveis do Laboratório, variáveis múltiplas de templates, analytics, broadcast
  e Instagram ficam no roadmap do README.
- A aprovação real de templates pela Meta demora horas/dias; o produto reflete o
  estado pendente honestamente.
- O modo agência assume o caso típico de uma WABA por cliente (override em nível de
  WABA).
- A instância roda em um VPS com domínio próprio e HTTPS (requisito da Meta para
  webhooks).
- O ambiente de testes interno (mock de WhatsApp + mock de IA) existe apenas para
  desenvolvimento e verificação; jamais disponível em produção.

## Out of Scope (v1)

Marketing em massa / broadcast, construtor visual de fluxos, scraping, Instagram,
email/notificações externas, billing/planos, S3/armazenamento externo, Embedded
Signup próprio (consome-se o da agência), analytics de templates, multimídia
completa, RAG, convites por email, i18n.
