# Feature Specification: Motor WhatsApp não oficial nativo (Baileys)

**Feature Branch**: `006-motor-baileys-nativo`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "A aplicação está usando Evolution, WPPConnect e WAHA — ferramentas de terceiros. Vamos mudar isso para que seja interno, sem terceiros: o próprio Vocero será o motor completo da API não oficial. A tela de conexão precisa ser refeita para atender o próprio motor. Assim evitamos delay ou problemas de travamento."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conectar o número não oficial sem um gateway externo (Priority: P1)

Como operador, quero conectar meu número de WhatsApp não oficial escaneando um QR
diretamente no Vocero, sem instalar nem configurar um gateway externo (Evolution,
WPPConnect ou WAHA), para ter um único sistema do qual depender.

**Why this priority**: É a porta de entrada para tudo o mais — sem conexão não
há canal não oficial para usar.

**Independent Test**: Abrir Configurações → Canal não oficial, iniciar a
conexão, ver o QR gerado pelo próprio Vocero, escaneá-lo com um WhatsApp
real, e verificar que o estado passa para "Conectado" com o número exibido, sem
exigir nenhuma URL/instância/API key de terceiros.

**Acceptance Scenarios**:

1. **Given** nenhum canal não oficial conectado, **When** o operador abre a
   tela de conexão, **Then** ele vê um botão para iniciar a conexão — sem
   campos de provedor, URL de gateway, instância ou API key.
2. **Given** a conexão iniciada, **When** o motor gera o QR, **Then** a UI
   o exibe ao vivo (sem recarregar a página) em poucos segundos.
3. **Given** o QR escaneado com um WhatsApp real, **When** o pareamento é
   concluído, **Then** o estado passa para "Conectado" e mostra o número, ao vivo.
4. **Given** um canal já conectado, **When** o operador escolhe desconectar,
   **Then** a sessão é encerrada e apagada de forma que reconectar exige um QR
   novo (não fica uma sessão fantasma).

---

### User Story 2 - Enviar e receber mensagens de texto pelo motor nativo (Priority: P1)

Como negócio com o canal não oficial conectado, quero que enviar e receber
mensagens de texto por WhatsApp funcione exatamente como antes (mesma
caixa de entrada, mesmo pipeline, mesmos leads), mas sem passar por um servidor gateway
intermediário.

**Why this priority**: É o propósito do canal — sem isso, conectar (US1) não
serve para nada.

**Independent Test**: Com o canal conectado, enviar uma mensagem de texto a partir
da caixa de entrada para um número real e verificar que chega ao WhatsApp do destinatário;
responder a partir desse WhatsApp real e verificar que a mensagem aparece na
caixa de entrada do Vocero em tempo real, com o contato/conversa/lead criados
igual a hoje.

**Acceptance Scenarios**:

1. **Given** uma conversa cujo canal ativo é "não oficial", **When** o
   operador envia uma mensagem de texto, **Then** ela sai pelo motor nativo — sem
   chamar nenhum serviço externo.
2. **Given** uma mensagem de texto recebida de um contato pelo número não
   oficial, **When** o motor a recebe, **Then** ela é ingerida com o mesmo
   pipeline idempotente já existente (contato, conversa, lead, turno do
   agente se aplicável) — igual a se viesse de qualquer outro canal.
3. **Given** uma conversa de teste do Laboratório (`is_test`), **When**
   se tenta enviar por esse canal, **Then** o envio real continua proibido
   (mesmo guardrail de sandbox já existente).
4. **Given** o canal não está conectado, **When** se tenta enviar, **Then**
   o sistema rejeita com uma mensagem clara (mesmo comportamento de hoje
   diante de "canal não conectado").

---

### User Story 3 - O motor reconecta sozinho ao reiniciar o servidor (Priority: P2)

Como negócio que já conectou seu número, quero que um reinício do servidor (um
deploy, por exemplo) não me obrigue a escanear o QR de novo, para não depender
de alguém ficar olhando a tela toda vez que o app reiniciar.

**Why this priority**: Sem isso, cada deploy quebraria a conexão — inaceitável
para o uso real de um negócio, mas não bloqueia demonstrar US1/US2 primeiro.

**Independent Test**: Com o canal conectado, reiniciar o processo do servidor
e verificar que, sem intervenção manual, o estado volta a "Conectado" (ou
"Conectando…" brevemente) sem pedir um QR novo.

**Acceptance Scenarios**:

1. **Given** uma organização com sessão já pareada, **When** o servidor
   inicia, **Then** o motor tenta restabelecer essa sessão automaticamente.
2. **Given** a sessão já não é válida no WhatsApp (o operador a encerrou pelo
   celular), **When** o servidor tenta restabelecê-la, **Then** o estado
   fica "Desconectado" com clareza (não fica "conectando" para sempre).

### Edge Cases

- Duas organizações distintas conectam números distintos ao mesmo tempo: cada
  uma tem sua própria sessão e socket, sem se cruzarem (multi-tenant real).
- O operador fecha a aba enquanto o QR está na tela: o motor continua
  esperando o pareamento do lado do servidor; ao reabrir a tela, vê o
  mesmo QR vigente ou um novo se tiver vencido.
- Mensagens de grupos ou de difusão (broadcast) recebidas: são ignoradas (este
  produto é 1 negócio → seus contatos, não grupos — mesmo escopo já aplicado
  pelos adaptadores atuais).
- Mensagem de mídia (imagem, áudio, documento) recebida: é baixada, decifrada
  e salva (ver Assumptions) — é pré-visualizada igual ao canal oficial.
- Falha de rede com os servidores do WhatsApp durante o envio: é reportada
  como falha de envio normal (mesmo tipo de erro já tratado), não trava o
  processo nem o restante das organizações.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir iniciar a conexão do canal não
  oficial sem pedir URL de gateway, provedor, instância nem API key de
  terceiros — apenas a ação de conectar.
- **FR-002**: O sistema MUST gerar o código QR de pareamento por si mesmo
  (conexão direta ao protocolo do WhatsApp) e exibi-lo na UI ao vivo.
- **FR-003**: O estado de conexão (desconectado/conectando/conectado + número)
  MUST refletir-se na UI em tempo real, sem que o operador precise
  recarregar a página.
- **FR-004**: O sistema MUST persistir a sessão pareada de forma que
  sobreviva a um reinício do processo, cifrada em repouso (mesmo padrão de
  todas as demais credenciais do projeto).
- **FR-005**: O envio e o recebimento de mensagens de texto pelo canal não
  oficial MUST funcionar sem depender de nenhum servidor ou serviço externo —
  tudo dentro do próprio processo do Vocero.
- **FR-006**: O recebimento de mensagens MUST reaproveitar o mesmo pipeline de
  ingestão idempotente já existente (contato/conversa/lead/agente), sem
  duplicar essa lógica.
- **FR-007**: O guardrail de sandbox (conversas `is_test` nunca tocam um
  canal real) MUST continuar valendo sem exceção.
- **FR-008**: O sistema MUST tentar restabelecer automaticamente, ao
  iniciar o processo, a sessão de cada organização que já estava conectada.
- **FR-009**: Desconectar MUST encerrar a sessão por completo (não deixa
  reconectar sem um QR novo).
- **FR-010**: Todo o código dos adaptadores de terceiros (Evolution,
  WPPConnect, WAHA) e seu webhook público MUST ser eliminado do projeto — não
  fica como opção alternativa nem como fallback.

### Key Entities

- **Sessão do canal não oficial** (substitui o "canal" atual): uma por
  organização; credenciais de pareamento com o WhatsApp cifradas em repouso, número
  conectado, estado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador consegue ir de "sem canal não oficial" a "conectado
  e enviando mensagens" sem instalar nem configurar nenhum software adicional
  fora do Vocero.
- **SC-002**: O estado de conexão na UI reflete a realidade dentro de 1-2
  segundos de uma mudança real (conectado/desconectado/QR novo) — não minutos.
- **SC-003**: Um reinício do servidor não exige escanear o QR novamente para
  uma sessão que continuava válida no WhatsApp.
- **SC-004**: Zero chamadas de rede de saída a um gateway de terceiros
  (Evolution/WPPConnect/WAHA) em todo o código do canal não oficial.

## Assumptions

- **Download de mídia (revisado após o self-test com WhatsApp real)**: a
  mídia recebida (imagem/áudio/vídeo/documento/sticker) pelo canal não
  oficial é decifrada via Baileys ao ser ingerida e é salva no Postgres
  (tabela `message_media`, base64 — self-hosted, sem S3/R2 pela
  constituição de soberania) em vez de apenas o tipo/caption sem
  pré-visualização. `/api/media/[id]` serve esses bytes igual a como já servia
  a URL do CDN da Meta para o canal oficial. Mídia de saída (enviar
  imagem/áudio a partir do composer) continua fora de escopo — o composer só
  envia texto.
- **Substituição completa, sem período de convivência**: não se mantém Evolution/
  WPPConnect/WAHA como alternativa nem como fallback — a instrução do dono
  foi explícita ("sem terceiros", "motor completo"). Não há dados de produção
  reais para migrar (instância de desenvolvimento).
- **Verificação humana obrigatória e insubstituível**: escanear o QR com um
  WhatsApp real e confirmar a troca de mensagens de verdade NÃO pode ser
  automatizado neste ambiente (não há um "mock" possível para o protocolo
  real do WhatsApp, diferente da Cloud API oficial que tem wa-mock).
  Tudo o mais (persistência de sessão, ciclo de vida de conexão, roteamento de
  envio/recebimento para o pipeline existente) é verificado com testes
  automatizados; o pareamento real fica marcado como pendente de verificação
  humana (Princípio V/IX).
