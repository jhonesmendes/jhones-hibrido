# Feature Specification: Follow-up automático de pipeline

**Feature Branch**: `005-followup-automatico-pipeline`

**Created**: 2026-07-26

**Status**: Draft

**Input**: User description: "Sprint 3 do roadmap do Vocero: follow-up automático de pipeline — lembrete configurável quando um lead fica parado numa etapa gatilho, detecção de documento que move automaticamente para uma etapa de sucesso, e expiração automática sem resposta. Nada de negócio fixo no código: nomes de etapa, intervalo, mensagem e limite de expiração saem do banco. NOTA de escopo: a Fase 2 original do roadmap (motor Baileys/Evolution + tela de QR) já está implementada no código sob outro desenho (canal não oficial via Evolution/WPPConnect/WAHA) — este sprint cobre apenas o que faltava: follow-up + detecção de documento."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar o follow-up automático de uma etapa (Priority: P1)

Como operador, quero configurar que uma etapa do meu pipeline dispare uma mensagem de
acompanhamento automática quando um lead fica parado ali sem responder, escolhendo o
intervalo, a mensagem e para quais etapas ele se move de acordo com o que acontecer depois,
para não precisar lembrar de fazer o acompanhamento manual de cada lead frio.

**Why this priority**: Sem essa configuração não existe nada para disparar — é a
base de todo o resto da funcionalidade.

**Independent Test**: Abrir a configuração de follow-up do pipeline, habilitá-lo,
escolher uma etapa gatilho, um intervalo, uma mensagem e as etapas de sucesso/expiração,
salvar, e verificar que a configuração persiste ao recarregar.

**Acceptance Scenarios**:

1. **Given** o pipeline tem pelo menos uma etapa, **When** o operador abre a
   configuração de follow-up, **Then** ele pode habilitá-la e escolher: etapa gatilho,
   intervalo (número + unidade horas/dias), mensagem de acompanhamento, etapa de sucesso,
   etapa de expiração, e se requer receber um documento para ser considerado bem-sucedido.
2. **Given** uma configuração salva, **When** o operador a reabre,
   **Then** ele vê os mesmos valores que salvou (não há nada fixo no código).
3. **Given** o follow-up está desabilitado, **When** isso ocorre, **Then** o
   sistema não dispara nenhuma mensagem nem movimento automático.
4. **Given** o operador não escolheu uma etapa gatilho ou uma mensagem, **When** tenta
   habilitar o follow-up, **Then** o sistema o impede com uma mensagem clara.

---

### User Story 2 - Disparo automático da mensagem de acompanhamento (Priority: P1)

Como negócio, quero que o sistema envie apenas a mensagem de acompanhamento configurada
a todo lead que fique parado na etapa gatilho por mais tempo que o intervalo
configurado, sem que um humano precise revisar um por um.

**Why this priority**: É o comportamento central da feature — sem disparo
automático, a configuração de US1 não serve para nada.

**Independent Test**: Com follow-up habilitado e intervalo curto configurado,
esperar (ou simular a passagem do tempo) até que um lead na etapa gatilho ultrapasse o
intervalo sem atividade nova, e verificar que ele recebe a mensagem configurada
automaticamente e que o envio fica registrado.

**Acceptance Scenarios**:

1. **Given** um lead na etapa gatilho cuja última atividade ultrapassa o intervalo
   configurado, **When** o sistema verifica (de forma periódica, em segundo plano),
   **Then** envia a ele a mensagem de acompanhamento configurada pelo canal de sua
   conversa.
2. **Given** um lead que já recebeu seu lembrete e ainda não passou o intervalo de
   carência, **When** o sistema volta a verificar, **Then** NÃO reenvia a mensagem
   (apenas um lembrete por período de inatividade).
3. **Given** um lead que respondeu (nova atividade) depois de receber o
   lembrete, **When** volta a ficar inativo pelo intervalo completo novamente,
   **Then** pode receber um novo lembrete (não é um limite vitalício, é por
   período de inatividade).
4. **Given** um lead em qualquer outra etapa (que não a gatilho), **When** o sistema
   verifica, **Then** nunca o considera para follow-up.

---

### User Story 3 - Documento recebido move automaticamente para a etapa de sucesso (Priority: P2)

Como negócio que exige um comprovante/documento antes de continuar, quero que
a chegada de um documento de um lead na etapa gatilho o mova automaticamente para a
etapa de sucesso e cancele qualquer acompanhamento pendente, para não precisar
mover os cartões manualmente.

**Why this priority**: Depende de o follow-up (US1/US2) já existir; é uma
melhoria sobre o fluxo base, não o fluxo em si.

**Independent Test**: Com "requer documento" habilitado, simular a chegada de um
documento/imagem de um contato cujo lead está na etapa gatilho (com ou sem
lembrete já enviado), e verificar que o lead se move para a etapa de sucesso e que
o lembrete não chega mais, se estava pendente.

**Acceptance Scenarios**:

1. **Given** "requer documento" está habilitado e um lead está na etapa
   gatilho, **When** chega um documento ou imagem desse contato, **Then** o lead
   se move automaticamente para a etapa de sucesso.
2. **Given** esse lead tinha um lembrete já enviado aguardando expiração,
   **When** o documento é recebido, **Then** esse acompanhamento pendente é cancelado
   (não é movido depois para expirado).
3. **Given** "requer documento" está desabilitado, **When** chega um documento,
   **Then** o sistema NÃO move nada automaticamente por esse motivo (o follow-up
   só se resolve por tempo/expiração).
4. **Given** o documento chega de um lead que NÃO está na etapa gatilho,
   **When** isso ocorre, **Then** nada acontece (a detecção de documento só se aplica
   à etapa gatilho configurada).

---

### User Story 4 - Expiração automática sem resposta (Priority: P3)

Como negócio, quero que um lead que não respondeu nem enviou o documento exigido
depois de receber o lembrete se mova automaticamente para uma etapa de "expirado" após
um prazo adicional, para que meu pipeline não acumule leads frios indefinidamente na
etapa gatilho.

**Why this priority**: É o fechamento do ciclo — valioso, mas o negócio pode continuar
operando (revisando manualmente) se isso demorar a chegar.

**Independent Test**: Com um lead que já recebeu seu lembrete, deixar passar o
prazo de carência sem atividade nova nem documento, e verificar que ele se move
automaticamente para a etapa de expiração configurada.

**Acceptance Scenarios**:

1. **Given** um lead recebeu seu lembrete e passou o prazo de carência sem nova
   atividade, **When** o sistema verifica, **Then** o move para a etapa de
   expiração configurada.
2. **Given** esse mesmo lead teve nova atividade (respondeu) antes de vencer o
   prazo de carência, **When** o sistema verifica, **Then** NÃO o move para expirado.
3. **Given** não há uma etapa de expiração configurada, **When** o prazo de
   carência vence, **Then** o sistema não move o lead para lugar nenhum (deixa o
   lembrete como "vencido sem ação" em vez de falhar).

### Edge Cases

- Etapa gatilho, de sucesso ou de expiração excluída depois de configurar o
  follow-up: o sistema deixa de considerar leads para essa configuração (não falha,
  se comporta como se essa transição não estivesse configurada) até que o
  operador a reconfigure.
- Um lead que retrocede manualmente para a etapa gatilho a partir de outra etapa: volta
  a ser candidato a follow-up normalmente (é avaliado pela posição atual, não pelo
  histórico).
- Conversa de teste do Laboratório (`is_test`): o follow-up NUNCA envia
  mensagens reais a ela — respeita o mesmo guardrail de sandbox do restante do envio.
- Organização sem nenhuma conversa/canal conectado: a tentativa de envio falha
  igual a qualquer outro envio sem canal — é registrada como falha, não interrompe
  o ciclo do scheduler para o restante dos leads.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir configurar, por organização: habilitado
  (sim/não), etapa gatilho, intervalo (valor numérico + unidade horas/dias), mensagem de
  acompanhamento, etapa de sucesso, etapa de expiração, e se requer documento.
  Nenhum desses valores MUST ficar fixo no código.
- **FR-002**: O sistema MUST verificar periodicamente (em segundo plano, sem
  intervenção do operador) os leads na etapa gatilho de organizações com
  follow-up habilitado.
- **FR-003**: O sistema MUST enviar a mensagem configurada a um lead cuja última
  atividade ultrapassa o intervalo configurado, e MUST fazê-lo no máximo uma vez por
  período de inatividade (não reenviar a cada verificação).
- **FR-004**: O envio do lembrete MUST usar o mesmo caminho de envio já
  existente (respeita canal oficial/não oficial da conversa, guardrail de
  sandbox `is_test`).
- **FR-005**: Se "requer documento" estiver habilitado, receber um documento/imagem
  de um lead na etapa gatilho MUST movê-lo automaticamente para a etapa de sucesso e
  MUST cancelar qualquer lembrete pendente de expiração para esse lead.
- **FR-006**: Um lead que respondeu (nova atividade) depois de receber seu
  lembrete MUST NOT expirar automaticamente.
- **FR-007**: Um lead que não respondeu nem enviou o documento exigido depois do
  prazo de carência posterior ao lembrete MUST se mover automaticamente para a etapa
  de expiração, se houver uma configurada.
- **FR-008**: O sistema MUST poder desabilitar o follow-up sem perder a
  configuração salva (para poder habilitá-lo novamente depois com os mesmos valores).
- **FR-009**: Uma falha de envio a um lead pontual MUST NOT interromper a revisão
  do restante dos leads no mesmo ciclo.

### Key Entities

- **Configuração de follow-up**: uma por organização; habilitado, etapa gatilho,
  intervalo (valor + unidade), mensagem, etapa de sucesso, etapa de expiração, se
  requer documento.
- **Envio de follow-up**: registro de um lembrete enviado a um lead — a qual
  lead, quando, status (enviado/cancelado/expirado) — existe para não reenviar em
  excesso e para saber a quem já venceu o prazo de carência.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador consegue configurar o follow-up completo (habilitar,
  intervalo, mensagem, etapas) em menos de 1 minuto sem ajuda técnica.
- **SC-002**: 100% dos leads que ultrapassam o intervalo configurado sem
  atividade recebem o lembrete dentro de um ciclo de verificação do sistema (nenhum
  lead elegível "escapa").
- **SC-003**: Zero lembretes duplicados a um mesmo lead pelo mesmo período de
  inatividade.
- **SC-004**: Um documento recebido de um lead com "requer documento" habilitado
  o move para a etapa de sucesso sem intervenção manual, no mesmo ciclo de
  ingestão da mensagem (não espera o próximo ciclo do scheduler).

## Assumptions

- **Um pipeline por organização**: este projeto não modela múltiplos pipelines
  nomeados — há um único quadro de etapas por organização (confirmado no
  código: `pipelineStage` não tem uma FK para um "pipeline" próprio). A configuração
  de follow-up é então uma config singular por organização, não por pipeline
  como sugeria o roadmap original.
- **Prazo de carência de expiração = mesmo intervalo configurado**: o roadmap não
  especifica um prazo de expiração separado do intervalo do lembrete. Assume-se
  que o prazo de carência após o lembrete é o mesmo valor do
  intervalo de disparo (ex.: 4 horas para lembrar + 4 horas a mais de carência = 8
  horas totais sem resposta até expirar). Pode ser exposto como um valor
  independente numa iteração futura, se o dono pedir.
- **Um único lembrete por período de inatividade**: não há novas tentativas nem
  segundo aviso — se não houver resposta depois do prazo de carência, expira
  diretamente (não há "lembrete 2 de 3").
- **A verificação periódica roda dentro do mesmo processo Node** (Constituição II),
  com um intervalo de verificação configurável via variável de ambiente — igual ao
  restante do trabalho em segundo plano deste projeto (turno do agente, Laboratório).
- **Fora de escopo deste sprint** (já coberto por trabalho anterior, ver
  memória do projeto): o motor de canal não oficial e sua tela de conexão/QR
  — já existem. A UI de renderização de mídias na caixa de entrada — já existe.
