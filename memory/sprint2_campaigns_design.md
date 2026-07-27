---
name: sprint2-campaigns-design
description: Decisões de design da feature de Campanhas (Sprint 2) — reuso agressivo de primitivos existentes
metadata:
  type: project
---

Implementado em 2026-07-26 (`specs/004-campanhas-disparo-massa/`, tabelas
`campaign`/`campaign_recipient`). Decisões que valem lembrar antes de estender:

- **Zero lógica de envio duplicada**: o loop de disparo (`src/server/campaigns/send.ts`)
  chama `sendTemplate()` (canal oficial) ou `sendText()` (canal não oficial, após
  forçar `conversation.channel = "unofficial"`) — os MESMOS primitivos que a
  bandeja usa. Qualquer mudança em `src/server/whatsapp/templates.ts` ou
  `src/server/inbox/send.ts` afeta Campanhas automaticamente.
- **Disparo in-process, fire-and-forget**: `POST /api/campaigns/[id]/send` marca
  `status="sending"` e chama `void runCampaign(...)` sem aguardar — mesmo padrão
  do turno do agente (`src/server/ai/pipeline.ts`, `scheduleAgentTurn`). Sem fila
  externa (Constituição II). O loop faz polling do próprio `cancelRequested` a
  cada iteração.
- **Progresso ao vivo via SSE**: evento `campaign.run` no mesmo barramento
  (`src/server/events/bus.ts`) que `message.new`/`lab.run` — um `EventEmitter`
  in-process por organização, sem novidade de infraestrutura.
- **Variável oficial = 2ª coluna do CSV, sempre**, independente do nome do
  cabeçalho (o modelo de templates deste projeto já limita a UMA variável
  `{{1}}` — ver `validateBodyVariables` em `src/server/whatsapp/templates.ts`).
  Não expandir isso sem also revisar essa limitação v1 do projeto.
- **Escopo deliberadamente cortado** (documentado em spec.md → Assumptions): sem
  agendamento (só disparo imediato) e sem seleção de destinatários via
  pipeline/tags (só CSV). Ver [[project-roadmap-vs-reality]] para o contexto de
  por que o roadmap original previa mais do que isso.
- **Canal não oficial**: só testado ao nível de guardrails de UI (checkbox de
  risco obrigatório, bloqueio sem canal conectado) — o ENVIO real por esse canal
  nunca foi exercido de ponta a ponta porque não há gateway Evolution/WPPConnect/
  WAHA real disponível neste ambiente de dev. Fica como verificação humana
  pendente antes de considerar essa historia 100% fechada.

Ver também [[local-dev-e2e-gotchas]] para os problemas de ambiente (hidratação,
timing) encontrados ao escrever o self-test desta feature.
