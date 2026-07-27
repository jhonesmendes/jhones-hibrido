---
name: sprint3-followup-design
description: Decisões de design do follow-up automático de pipeline (Sprint 3)
metadata:
  type: project
---

Implementado em 2026-07-26 (`specs/005-followup-automatico-pipeline/`, tabelas
`pipeline_followup`/`followup_send`). Decisões que valem lembrar antes de estender:

- **Config singular por organização, não por "pipeline"**: este projeto não
  modela múltiplos pipelines nomeados — um único tabuleiro de etapas por
  organização. `pipeline_followup` é 1 linha por org (como `agent_profile`), não
  por-pipeline como o roadmap original sugeria.
- **`lead.lastActivityAt` já existente é a única fonte de "atividade"** — não foi
  criado tracking novo. O scheduler (`src/server/pipeline/followup-scheduler.ts`)
  só lê esse campo.
- **Prazo de graça de expiração = mesmo `intervalValue`/`intervalUnit` do
  lembrete** (decisão documentada em spec.md → Assumptions, sem confirmação
  explícita do dono — candidata a virar campo próprio se pedirem).
- **Scheduler in-process via `setInterval` + guarda `globalThis`**, registrado em
  `src/instrumentation.ts` (mesmo arquivo que já fazia `cleanupOrphanRuns`) — não
  em `instrumentation-node.ts` diretamente, para manter esse arquivo só com
  funções puras testáveis. Intervalo de verificação vem de
  `FOLLOWUP_SCHEDULER_INTERVAL_MS` (default 5 min) — NUNCA baixar isso em
  produção, só em `.env` local para self-test.
- **Detecção de documento é reativa, não por scheduler** (`followup-document.ts`,
  chamado de `ingestInboundMessage`) — precisa disparar no mesmo ciclo da
  ingestão da mensagem (SC-004), não esperar o próximo tick.
- **Lógica de elegibilidade extraída em funções puras**
  (`followup-eligibility.ts`) especificamente para poder testar sem mockar BD —
  ver os 14 testes em `tests/unit/followup-eligibility.test.ts`. Qualquer
  mudança nas regras de "quando lembrar" / "quando expirar" deve mexer ali
  primeiro, não direto no loop do scheduler.
- **Envio do lembrete no canal oficial pode falhar por `window_closed`** — é
  esperado e correto: um lead inativo há horas provavelmente já tem a janela de
  24h fechada. O lembrete então falha (vira `followup_send.status='failed'`) sem
  quebrar o ciclo (FR-009). Isso combina com o comentário já existente no schema
  do `unofficial_channel` sobre o "modelo híbrido: captação pelo oficial,
  automação pelo não oficial" — o follow-up é mais útil na prática no canal não
  oficial.
- **Gotcha de teste**: ao simular "tempo passado" nesta feature via SQL direto
  (backdatear timestamps), backdatear `followup_send.sentAt` sem também mover
  `lead.lastActivityAt` na mesma proporção inverte a cronologia e o sistema
  interpreta (corretamente, pela sua própria lógica) como "cliente respondeu
  depois do lembrete". Sempre backdatear os dois juntos.

Ver também [[sprint2-campaigns-design]] e [[local-dev-e2e-gotchas]] para padrões
irmãos (in-process scheduling, backdating de timestamps em testes).
