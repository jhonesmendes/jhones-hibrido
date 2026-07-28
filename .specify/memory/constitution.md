<!--
RELATÓRIO DE IMPACTO DE SINCRONIZAÇÃO
==================
Versão: 2.0.0 → 2.1.0

Mudanças:
  - Princípio II "Soberania / Self-Hosted" → EXPANDIDO (aditivo, não
    incompatível): a lista fechada de dependências externas em runtime ganha
    uma TERCEIRA categoria, ao lado do canal WhatsApp e do provedor LLM:
    (3) um servidor SMTP opcional, configurado e operado pelo próprio dono da
    organização (o servidor de e-mail que ele já possui/contrata, não um SaaS
    de e-mail transacional de terceiro embutido no produto). Usado
    exclusivamente para convites de membro e recuperação de senha
    (feature 007-controle-acesso-seguranca); sem SMTP configurado, o produto
    MUST degradar para um fluxo manual (owner gera/envia o link pelo painel),
    nunca travar. A proibição de serviços de e-mail transacional de terceiros
    embutidos (SendGrid/Resend/Postmark ou equivalente) como dependência
    obrigatória do produto permanece — o que muda é abrir espaço para um
    serviço que o próprio operador já possui, seguindo o mesmo padrão já
    usado para o canal WhatsApp não oficial (adaptador próprio, credenciais
    do operador, nunca hardcoded, sempre cifradas — Princípio I).
  - Princípios I, III, IV, V, VI, VII, VIII e IX: íntegros (sem mudança
    semântica); a Restrição de Plataforma "Cifragem em repouso" já cobre a
    senha SMTP sem precisar de texto novo.
  - Governança: Ratificada em 2026-07-09 / Última Emenda em 2026-07-28.

Bump: MINOR (2.0.0 → 2.1.0) — adição aditiva de uma terceira categoria
opcional à lista de dependências externas do Princípio II; nada existente foi
redefinido, removido ou tornado incompatível (o próprio texto anterior já
enquadrava o canal não oficial como precedente para "serviço que roda na
infraestrutura do operador, não SaaS de terceiro").

Validado contra o código real antes de escrever esta emenda: não existe
nenhum client de e-mail (nodemailer ou equivalente) no projeto hoje; não há
hook `sendResetPassword`/similar configurado no plugin `emailAndPassword` do
Better Auth (`src/lib/auth/index.ts`) — ou seja, recuperação de senha não tem
caminho automático funcional hoje, confirmando a lacuna. `src/lib/crypto`
(`encryptSecret`/`decryptSecret`, AES-256-GCM) já é genérico o bastante para
cifrar a senha SMTP sem mudança — é o mesmo helper reusado pelo auth-state do
Baileys.

Templates dependentes:
  - .specify/templates/plan-template.md — ✅ compatível (Constitution Check
    genérico; não requer mudanças).
  - .specify/templates/spec-template.md — ✅ compatível.
  - .specify/templates/tasks-template.md — ✅ compatível.
  - CLAUDE.md — ⚠ PENDENTE: mencionar SMTP/e-mail como dependência externa
    opcional na lista de variáveis de ambiente quando a feature
    007-controle-acesso-seguranca for implementada.

TODOs adiados: nenhum.
-->

# Constituição do Vocero CRM

Vocero CRM é um CRM de WhatsApp com agente de IA, open source (MIT), self-hosted e
gratuito, projetado para que agências de IA o implantem no VPS de seus
clientes: uma instância = um negócio. Esta constituição define as regras não
negociáveis do produto. Aplica-se a todas as fases do fluxo de trabalho (specify,
plan, tasks, implement). Qualquer conflito entre uma decisão de implementação e
esta constituição SE RESOLVE A FAVOR desta constituição.

## Core Principles

### I. Segurança de Dados em Primeiro Lugar (NÃO NEGOCIÁVEL)

A proteção de dados é a primeira responsabilidade do sistema, acima de
velocidade de entrega ou conveniência de desenvolvimento.

- Tokens, credenciais e segredos sensíveis NUNCA são expostos ao cliente (navegador,
  app, respostas de API) nem são escritos em logs, traces ou mensagens de erro.
- Todo segredo é armazenado cifrado em repouso. As chaves de cifragem são geridas
  fora do código-fonte e fora do controle de versões.
- Se o produto é multi-tenant, todo dado de um tenant está isolado dos demais:
  nenhuma consulta, endpoint ou tarefa em segundo plano deve retornar ou modificar dados
  de um tenant diferente do solicitante. O isolamento se aplica por padrão.

**Rationale**: Um vazamento de credenciais ou um cruzamento de dados entre clientes é uma
falha catastrófica e irreversível; preveni-la sempre custa menos do que remediá-la.

### II. Soberania / Self-Hosted (ENDURECIDO)

Vocero CRM opera completamente sobre a infraestrutura do operador. A lista de
dependências externas em runtime é FECHADA:

- Dependências externas permitidas em runtime, SOMENTE:
  1. **Canal WhatsApp**, em um ou ambos os modos, coexistindo por organização:
     a. **WhatsApp Cloud API** (Meta Graph API) — o canal oficial, sem risco
        de banimento, limitado a templates aprovados fora da janela de 24h.
     b. **Canal WhatsApp não oficial** — conexão direta tipo WhatsApp Web
        (Baileys) ou via Evolution API como variante de deployment, atrás de um
        adaptador dedicado próprio (`src/server/whatsapp/baileys/` ou
        equivalente). Habilita texto livre e disparo em massa, com o risco de
        banimento do número por conta do operador (ver Princípio IX).
  2. **O provedor LLM**, opcional, acessado EXCLUSIVAMENTE através do adaptador
     compatível com OpenRouter (`OPENROUTER_BASE_URL` / `OPENROUTER_MODEL`). Sem token
     configurado, o produto funciona como CRM sem agente de IA.
  3. **Servidor SMTP**, opcional, configurado e operado pelo próprio dono da
     organização — o servidor de e-mail que o operador já possui ou contrata
     por conta própria (informado via tela de Configurações), não um SaaS de
     e-mail transacional de terceiro embutido no produto (SendGrid, Resend,
     Postmark ou equivalente). Usado exclusivamente para convites de novo
     membro e recuperação de senha. Sem SMTP configurado, o produto MUST
     degradar para um fluxo manual (o owner gera e envia o link de
     redefinição de senha pelo painel) — nunca travar nem exigir SMTP como
     pré-requisito de uso da instância. A senha SMTP segue a mesma cifragem
     em repouso que os demais segredos (Princípio I).
- **PROIBIDO na v1**: armazenamento de objetos externo (S3/R2), serviços de
  e-mail transacional de terceiros (SendGrid, Resend, Postmark ou equivalente)
  como dependência embutida do produto, Stripe ou outro billing, e serviços do
  Google. Qualquer feature que os exija fica fora do escopo da v1.
- O instalador só precisa de: um VPS com Coolify ou Docker, um domínio, e
  credenciais do canal WhatsApp escolhido (Meta e/ou sessão do canal não
  oficial), (opcional) um token do OpenRouter e (opcional) os dados de um
  servidor SMTP próprio. Nada mais.
- As funções core —autenticação e banco de dados— rodam self-hosted (Better
  Auth + PostgreSQL próprios da instância).
- As integrações externas permitidas são isoladas atrás de adaptadores dedicados
  (cliente Graph API próprio; adaptador do canal não oficial; adaptador LLM)
  para não acoplar o domínio a elas. O domínio (conversas, pipeline,
  agente) não distingue o canal, exceto onde o comportamento observável
  difere (janela de 24h e templates só se aplicam ao canal oficial).

**Rationale**: O produto é dado de graça para que agências o implantem em VPS de
clientes; cada dependência externa adicional é um custo, um ponto de falha e uma
fuga de soberania que quebra a promessa de "grátis e seu". O canal não oficial não
introduz um serviço de terceiros novo — continua rodando dentro da
infraestrutura do operador — por isso amplia as opções de canal sem
quebrar a soberania; seu custo é o risco de conta, não de infraestrutura, e
por isso é governado com guardrails explícitos (Princípio IX) em vez de
ser proibido. O mesmo raciocínio vale para o SMTP opcional: é o operador quem
possui e paga por esse servidor, não o produto contratando um SaaS em nome
dele — por isso soma como terceira categoria em vez de violar a lista fechada.

### III. Multi-Tenancy Real

O sistema atende organizações independentes a partir de uma única instância lógica.
No Vocero, cada instância atende a UM negócio, mas o modelo de dados é
multi-tenant real (organização do plugin de auth) para manter o isolamento
exigível e não fechar a porta a evoluções.

- Cada organização (tenant) gerencia seus próprios usuários, papéis e permissões.
- O identificador de tenant (`organization_id`) é um parâmetro de primeiro nível no
  modelo de dados e na camada de acesso a dados, não um campo opcional adicionado a
  posteriori. Toda tabela de domínio o traz NOT NULL e indexado org-first.

**Rationale**: Multi-tenancy projetado desde o início evita reescritas custosas e
torna cumprível o isolamento do Princípio I.

### IV. Idempotência em Integrações Externas

Todo evento recebido de um sistema externo (webhooks, callbacks, notificações de
terceiros) é processado de forma idempotente.

- Receber o mesmo evento duas ou mais vezes NÃO duplica efeitos observáveis (mensagens
  reenviadas, registros duplicados, ações do agente repetidas).
- Cada evento recebido é identificado de forma única (p. ex. `wa_message_id` UNIQUE)
  e seu processamento é registrado para detectar e descartar retentativas.

**Rationale**: Os provedores externos reenviam entregas por design; sem
idempotência, as retentativas corrompem dados e geram ações duplicadas.

### V. Qualidade Verificável Antes de "Pronto" (NÃO NEGOCIÁVEL)

Nenhuma tarefa é considerada terminada sem passar por verificação.

- "Pronto" requer, no mínimo: verificação de tipos, lint e build; e testes onde
  se apliquem ao escopo da tarefa.
- O que NÃO puder ser verificado automaticamente é marcado explicitamente como
  "pendente de verificação humana"; não é reportado como concluído sem essa marca.
- Não se reporta uma tarefa como terminada descrevendo que "deveria funcionar": ou passa
  na verificação, ou se declara seu estado real (incluindo falhas).

**Rationale**: A verificação automática é a única definição de "pronto" que não
depende de otimismo.

### VI. Specs Antes de Código

Nenhuma feature é implementada sem uma especificação prévia.

- A especificação descreve o comportamento observável pelo usuário, não a
  implementação.
- A ordem do fluxo é specify → plan → tasks → implement; o código de uma feature
  não começa antes de existir sua spec.
- Correções triviais e mudanças sem comportamento observável novo (typos,
  formatação, refactors internos sem mudança de contrato) estão isentas.

**Rationale**: Especificar o comportamento observável antes de codificar previne
retrabalho e mantém alinhadas todas as fases do fluxo.

### VII. Rastreabilidade de Decisões

As decisões tomadas sem contexto suficiente são documentadas para revisão humana.

- Quando uma decisão é tomada com informação incompleta ou suposições não confirmadas,
  é registrada de forma visível (no spec, no plan, no PR ou um marcador
  `NEEDS CLARIFICATION` / TODO com responsável), não é enterrada no código.
- As suposições que condicionam o comportamento são explicitadas para que um
  humano possa revisá-las e revertê-las.

**Rationale**: As decisões implícitas sob incerteza são a principal fonte
de dívida oculta; torná-las visíveis permite corrigi-las a tempo.

### VIII. Foco Vertical — CRM de Conversas e Leads de WhatsApp

É um CRM de conversas e leads de WhatsApp que as agências implantam para
negócios. Não é um construtor visual de fluxos genérico nem ferramenta de scraping.
O que não ajudar a *atender, organizar e converter conversas de WhatsApp de UM
negócio* é rejeitado.

- O modelo de dados e os fluxos MUST refletir esse domínio: contatos que escrevem
  por WhatsApp, conversas com janela de 24h (canal oficial), leads em um
  pipeline, um agente de IA que atende com o conhecimento do negócio e escala para
  humanos.
- WhatsApp (Cloud API e/ou canal não oficial, Princípio II) é o canal; o produto
  é o CRM. Admite-se disparo em massa (Campanhas) como extensão de "converter
  conversas" — captar e reativar leads em escala — em dois modos: oficial
  (templates aprovados Meta API, sem risco de ban) e não oficial (texto livre,
  risco de ban assumido pelo operador, com os guardrails do Princípio IX).
  Scraping de números e construtores de fluxos visuais genéricos não relacionados
  a conversas/leads de WhatsApp ficam FORA do escopo da v1.
- Toda feature MUST servir à agência que implanta ou ao negócio que opera UMA
  instância. O que sirva apenas a uma plataforma centralizada (billing, planos,
  multi-instância) fica FORA.

**Rationale**: Um foco vertical explícito mantém o modelo de dados alinhado com o
negócio real e dá um critério claro para aceitar ou rejeitar escopo. Admitir
Campanhas não dilui o foco: continua sendo conversão de leads de WhatsApp de UM
negócio, só que iniciada em massa pelo operador em vez de uma a uma.

### IX. Verificação de Comportamento ao Vivo (NÃO NEGOCIÁVEL)

Complementa o Princípio V. TODA feature com comportamento observável —UI web,
mensageria, API ou integração externa— é verificada exercendo esse comportamento como
faria um usuário real antes de ser declarada "Pronta". O gate técnico (Princípio V) é
o piso, não o teto.

- **Self-test + loop pelo implementador (self-improvement loop).** Após implementar,
  quem implementa executa o self-test E2E —caminho feliz E caminho infeliz (degradação
  sem travar)— e, se algo falhar, diagnostica, corrige e reverifica ele mesmo até ficar
  verde. Não se entrega trabalho verificado pela metade nem se delega o teste funcional ao
  dono. O único delegável à verificação humana é o que é intrinsecamente não verificável
  por ferramentas (julgamento visual, aprovação de terceiro), marcado explicitamente.
- **A interface real é conduzida.** Navegador via Playwright para features de UI; a linha
  do canal (p. ex. uma API de WhatsApp de teste) para mensageria; chamadas à API
  onde essa seja a superfície. Não basta tipos/lint/build, nem que um endpoint
  retorne 2xx, nem inspecionar o banco de dados: observa-se o resultado voltado ao
  usuário.
- **Local primeiro, nuvem depois.** Se o comportamento pode ser reproduzido em `localhost`
  —incluindo integrações externas via túnel (p. ex. ngrok + handshake do webhook a partir
  do painel do provedor)—, SHOULD ser testado ali antes de fazer o deploy. O deploy para a nuvem
  se reserva para o que o ambiente local não conseguir reproduzir, porque o deploy consome tempo
  e reduz a agilidade do ciclo.
- **Guardrails com ferramentas não oficiais.** Quando o teste usar ferramentas não
  oficiais vinculadas a um número/conta real, MUST respeitar regras duras: enviar somente a
  destinatários de uma allowlist, NUNCA mensagens em rajada (anti-flood obrigatório), e
  minimizar o volume. A integridade da conta do operador é um ativo a proteger, em
  linha com o Princípio I.
- **Guardrails do canal não oficial como feature de produto.** O canal não oficial
  (Princípio II) já não é apenas ferramenta de teste interno: é uma capacidade que o
  operador usa contra seu próprio número real. Toda superfície que dispare mensagens por esse
  canal (Campanhas ou outra) MUST: (a) advertir o risco de banimento na UI, de forma explícita,
  antes de o operador confirmar o disparo; (b) expor o intervalo entre envios como
  configuração editável pelo operador, NUNCA como valor fixo no código; (c) aplicar o
  mesmo anti-flood/minimização usado em testes internos também em produção.

**Rationale**: O gate técnico não detecta que um agente "ficou calado", que um cartão não
chegou como uma única mensagem, ou que um botão de UI não disparou nada — isso só aparece
exercendo o fluxo real. E o valor do passo não está só em detectar a falha, mas em
fechá-la: o implementador itera até ficar verde em vez de devolver trabalho pela metade. Testar
localmente primeiro mantém o ciclo ágil; e sem guardrails duros, um teste com
ferramentas não oficiais poderia provocar um banimento irreversível.

## Restrições de Plataforma e Segurança

Estas restrições derivam dos Princípios I e II e são verificáveis em revisão:

- **Gestão de segredos**: os segredos são injetados via configuração de ambiente ou um
  gestor de segredos; nunca são comprometidos ao controle de versões.
- **Cifragem em repouso**: credenciais e dados sensíveis são armazenados cifrados; o
  armazenamento em texto claro de segredos é uma violação.
- **Fronteira de tenant**: a camada de acesso a dados exige o identificador
  de tenant; qualquer acesso que possa omiti-lo requer justificativa explícita.
- **Isolamento de integrações**: as dependências de APIs externas são acessadas
  através de adaptadores dedicados (cliente Graph API próprio, adaptador LLM
  compatível com OpenRouter), não dispersas pelo domínio.
- **Instância pública endurecida**: as rotas de mock/desenvolvimento retornam 404
  incondicional em produção; o registro se fecha após a primeira organização
  (salvo habilitação explícita); os ambientes de teste internos JAMAIS alcançam a
  API real do WhatsApp.

## Fluxo de Desenvolvimento e Portões de Qualidade

- **Ordem do fluxo**: specify → plan → tasks → implement. Cada fase consome o
  artefato da anterior.
- **Portão constitucional (Constitution Check)**: o plan de cada feature avalia o
  cumprimento destes princípios antes da Fase 0 e é reavaliado após o design da
  Fase 1. As violações são registradas e justificadas em Complexity Tracking ou são
  eliminadas.
- **Portão de qualidade (Definição de "Pronto")**: tipos + lint + build verdes, e
  testes onde se apliquem; o que não for verificável automaticamente é marcado como pendente de
  verificação humana (Princípio V). Para features com comportamento observável voltado
  ao usuário, "Pronto" exige também o self-test de comportamento ao vivo executado pelo
  implementador, com seus guardrails (Princípio IX).
- **Rastreabilidade**: decisões sob incerteza e suposições são documentadas de forma
  visível (Princípio VII), não em comentários enterrados.

## Governance

Esta constituição é a autoridade máxima do projeto. Prevalece sobre qualquer outra
prática, convenção ou preferência; diante de um conflito, a constituição vence.

- **Procedimento de emenda**: toda emenda é proposta por escrito descrevendo a
  mudança e sua motivação, é aprovada pelo responsável do projeto e é registrada no
  controle de versões junto com o Sync Impact Report atualizado.
- **Política de versionamento** (semantic versioning da constituição):
  - **MAJOR**: eliminação ou redefinição incompatível de um princípio ou da
    governança.
  - **MINOR**: adição de um princípio/seção nova ou expansão material.
  - **PATCH**: esclarecimentos, correções de redação e refinamentos não semânticos.
- **Revisão de cumprimento**: cada PR e cada revisão de design verificam o
  cumprimento destes princípios. A complexidade que viole um princípio deve
  ser justificada; caso contrário, deve ser eliminada.
- **Propagação**: ao emendar a constituição, revisam-se e, se necessário, atualizam-se
  os templates dependentes (plan, spec, tasks).

**Version**: 2.1.0 | **Ratified**: 2026-07-09 | **Last Amended**: 2026-07-28
