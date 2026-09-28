# Follow-up Automático — Documentação Técnica

> Preparado em 2026-09-22 para servir de base ao estudo de melhorias no
> processo. Reflete o estado real do código nesta data (não é um roadmap
> nem uma proposta — é o retrato do que existe hoje).

## 1. Visão geral

O Follow-up automático cobra sozinho um lead que ficou parado numa etapa
do Pipeline sem o cliente responder — sem precisar de um humano de olho
no funil o tempo todo. É configurado por **departamento** (ou de forma
compartilhada, quando o pipeline não tem departamentos) em Pipeline →
botão "Follow-up".

Roda **in-process**, sem fila externa nem cron do sistema operacional —
é um `setInterval` a nível de módulo, no mesmo processo Next.js do resto
do produto (Constituição II do projeto: nada de infraestrutura externa
não auto-hospedada).

### Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/db/schema.ts` (`pipelineFollowup`, `followupSend`) | Modelo de dados |
| `src/server/pipeline/followup.ts` | CRUD da configuração (`getFollowupConfig`, `saveFollowupConfig`, `getFollowupRow`) |
| `src/server/pipeline/followup-eligibility.ts` | Regras puras de elegibilidade (sem acesso a BD — testável isoladamente) |
| `src/server/pipeline/followup-scheduler.ts` | O ciclo em si (`runFollowupCycle`) + o `setInterval` (`startFollowupScheduler`) |
| `src/server/pipeline/followup-document.ts` | Gatilho reativo: lead avança assim que o documento esperado chega (não espera o próximo ciclo) |
| `src/server/inbox/lead-activity.ts` | Atualiza `lead.lastActivityAt` a cada mensagem; decide se um lead "Perdido" reabre sozinho |
| `src/app/api/pipeline/followup/route.ts` | `GET`/`PUT` da configuração (usado pela UI) |
| `src/components/pipeline/followup-manager.tsx` | UI de configuração |

## 2. Modelo de dados

### `pipeline_followup` (1 linha por organização+departamento — `UNIQUE(organization_id, department_id)`)

| Campo | Tipo | Significado |
|---|---|---|
| `department_id` | nullable | `null` = configuração compartilhada (pipeline sem departamentos). Cada departamento tem a própria configuração independente. |
| `enabled` | bool | Liga/desliga o recurso inteiro para este escopo. |
| `trigger_stage_id` | FK etapa | Etapa que, parada, começa a contar o prazo. |
| `interval_value` + `interval_unit` | int + enum(hours,days) | Prazo de inatividade até o lembrete disparar. **Também** é usado como prazo de carência para expiração (ver §4). |
| `message` | text nullable | Lembrete de texto livre — só válido com a janela de 24h **aberta**. |
| `template_id` | FK template nullable | Lembrete via modelo aprovado — obrigatório com a janela **fechada** (regra da própria Meta, não é decisão do produto). Só aceita modelo com no máximo 1 variável. |
| `success_stage_id` | FK etapa nullable | Para onde o lead vai ao receber o documento esperado (`requires_document`). |
| `expired_stage_id` | FK etapa nullable | Para onde o lead vai ao esgotar `max_attempts` sem resposta. |
| `requires_document` | bool | Quando true, o "sucesso" do follow-up é definido por receber uma mídia (não por responder texto). |
| `max_attempts` | int (default 3) | Teto de lembretes (`sent`/`failed`) por lead, contado na história INTEIRA do lead — não só na passagem atual pela etapa gatilho. |
| `stale_conversation_days` | int (default 90) | Conversa sem nenhuma mensagem há mais que isso não recebe lembrete. |

### `followup_send` (1 linha por lembrete enviado)

| Campo | Significado |
|---|---|
| `lead_id`, `conversation_id` | A quem e onde foi mandado. |
| `status` | `sent` \| `failed` \| `cancelled` \| `expired`. |
| `attempt_number` | Qual tentativa este envio representa (1ª, 2ª...) — calculado no momento do envio, contando `sent`+`failed` anteriores do mesmo lead. |
| `sent_at`, `resolved_at` | Quando foi enviado e quando deixou de estar "ativo" (respondido, expirado ou cancelado). |

Índice único parcial: **no máximo 1 `followup_send` com `status='sent'` por lead** (`followup_send_lead_active_uq`) — é o que impede 2 lembretes "ativos" simultâneos para o mesmo lead.

## 3. Fluxo do ciclo (`runFollowupCycle`, roda a cada `FOLLOWUP_SCHEDULER_INTERVAL_MS`)

```
para cada config habilitada (1 por org+departamento):
  pula se não tem trigger_stage_id, ou se não tem NEM message NEM template

  busca todos os leads da org que estão em trigger_stage_id (join simples, sem
  filtro de departamento aqui — o filtro real é o próprio trigger_stage_id,
  que já pertence a um departamento específico ou é compartilhado)

  para cada lead:
    1. busca o followup_send mais recente do lead (lastSend)
    2. se o cliente respondeu DEPOIS do lastSend ativo → cancela
       (status='cancelled') e trata como se não houvesse lastSend
    3. isEligibleForReminder(lead, lastSend, intervalMs, now)?
       (parado >= intervalMs E não há lastSend com status='sent' pendente)
       NÃO → vai para o passo de expiração (abaixo) e continua pro próximo lead
       SIM →
         a) fora do horário de funcionamento do departamento do lead?
            → pula esta rodada SEM registrar tentativa (reavalia do zero
              no próximo ciclo — não perde o lembrete, só adia)
         b) conta tentativas anteriores (sent+failed) do lead NA HISTÓRIA
            INTEIRA → se excedeu max_attempts, move para expired_stage_id
            (se configurado) e para — NÃO conta como uma tentativa nova
         c) resolve a conversa mais recente do lead neste departamento
            → sem conversa nenhuma ainda, pula (nada para lembrar)
         d) conversa "fria" (sem nenhuma mensagem) há mais que
            stale_conversation_days → pula, sem registrar tentativa
         e) janela de 24h aberta (ou canal = WhatsApp Web, que não tem
            janela) → manda `message` (texto livre)
            janela fechada → precisa de `template_id`; se não tiver, só
            loga um aviso (console.warn) e pula — SEM mover o lead nem
            contar como tentativa (é lacuna de configuração do operador,
            não abandono do cliente)
         f) registra o followup_send (status sent ou failed, com o
            attempt_number calculado no passo b)

  se NÃO elegível para lembrete E há um lastSend 'sent' que passou do
  prazo de carência (mesmo intervalMs) sem resposta:
    → move o lead para expired_stage_id (se configurado)
    → marca o followup_send como 'expired'
```

### Gatilhos reativos (não esperam o próximo ciclo)

- **Documento recebido** (`followup-document.ts`, chamado da ingestão de mensagens): se `requires_document` está ligado e o lead está na etapa gatilho, move direto para `success_stage_id` e cancela qualquer `followup_send` ativo — não espera o scheduler perceber.
- **Lead "Perdido" reabre sozinho** (`lead-activity.ts`, chamado a cada mensagem recebida ou modelo disparado): se a etapa atual do lead tem `kind='lost'`, qualquer atividade nova devolve o lead para a primeira etapa aberta do pipeline. **Um lead "Ganho" (`kind='won'`) nunca reabre sozinho** — decisão deliberada (ver comentário em `lead-activity.ts`): antes disso ser corrigido, uma mensagem trivial do cliente (ex.: "obrigado!") depois do comprovante já recebido reabria o card e reiniciava a cobrança de um documento que já tinha chegado.

## 4. Decisões de design e casos de borda

- **Duas rotas de envio, escolhidas pelo estado da janela de 24h** — a Meta recusa texto livre com a janela fechada; não é uma limitação imposta pelo produto.
- **Prazo de expiração = mesmo intervalo do lembrete** (ex.: 4h para lembrar + 4h de carência = 8h sem resposta até expirar). Não é configurável separadamente hoje.
- **`max_attempts` conta a história inteira do lead**, não a passagem atual pela etapa — proteção deliberada contra um lead que fica sendo reaberto (ver §3, "Lead Perdido reabre sozinho") e ganharia um ciclo completo de lembretes a cada reabertura, para sempre.
- **Horário de funcionamento é o MESMO da Fila** (`Configurações → Departamentos → Fila e roteamento`), reaproveitado via `src/server/queue/business-hours.ts` — funciona mesmo com a fila desligada.
- **1 conversa por lead** — resolve sempre a conversa mais recentemente ativa no departamento do lead (`getMostRecentConversationForContact`); um contato com conversas em mais de um departamento não recebe lembrete duplicado por esse motivo (cada departamento tem seu próprio lead e sua própria config).

## 5. Configuração exposta na UI (`followup-manager.tsx`)

Habilitar · Etapa gatilho · Intervalo + Unidade · Mensagem (janela aberta) · Modelo (janela fechada, valida no cliente que o modelo tem no máximo 1 variável) · Aguarda documento (bool) · Etapa ao receber documento · Etapa ao expirar · Máximo de lembretes (1–10) · Ignorar conversa parada há mais de X dias (1–365).

## 6. Limitações conhecidas e pontos para estudar melhoria

Isto **não** é uma lista de bugs confirmados — são pontos que valem uma
segunda cabeça antes de decidir se merecem virar trabalho:

1. **Possível corrida entre ciclos sobrepostos.** `startFollowupScheduler` usa
   `setInterval` puro (`src/server/pipeline/followup-scheduler.ts:250`) —
   se `runFollowupCycle()` demorar mais que `FOLLOWUP_SCHEDULER_INTERVAL_MS`
   (padrão configurável via env, mínimo 1s), o próximo tick dispara em
   paralelo ao anterior. O índice único `followup_send_lead_active_uq`
   impede duas linhas `status='sent'` simultâneas no BANCO, mas a leitura de
   `lastSend` e o envio real da mensagem (`sendText`/`sendTemplate`)
   acontecem ANTES do insert — em teoria, dois ciclos concorrentes podem
   achar o mesmo lead elegível e mandar a mensagem duas vezes antes que o
   índice rejeite a segunda linha. Não observado em produção até hoje, mas
   nunca foi testado sob carga/latência alta de banco.

2. **Expiração não respeita o horário de funcionamento.** O envio de
   lembrete pula fora do expediente (`isLeadWithinBusinessHours`), mas o
   bloco de expiração logo abaixo (`isEligibleForExpiry`) não tem a mesma
   checagem — um lead pode ser movido para `expired_stage_id` de madrugada,
   mesmo que o lembrete anterior só tenha sido considerado "sem resposta"
   por causa da pausa do expediente. Vale decidir se isso é intencional
   (prazo é prazo, independente de expediente) ou uma inconsistência.

3. **Sem escalonamento/sequência de mensagens.** Todo lembrete usa o
   mesmo texto/modelo e o mesmo intervalo, não importa se é a 1ª ou a
   última tentativa antes de expirar — não há uma sequência tipo "lembrete
   soft → lembrete mais direto → aviso de expiração iminente".

4. **1 configuração por departamento.** Não dá para ter duas
   sequências de follow-up diferentes dentro do mesmo departamento (ex.:
   uma para "aguardando comprovante" e outra para "aguardando resposta
   comercial") — teria que duplicar a etapa gatilho em pipelines
   diferentes.

5. **Sem visão de histórico/métricas na UI.** `followup_send` guarda tudo
   (quantos lembretes, quantos falharam, quantos expiraram), mas não existe
   tela nenhuma mostrando isso agregado — hoje só dá para inspecionar linha
   a linha no banco.

6. **Sem teste manual ("disparar agora") na UI**, diferente de outras
   automações do produto (N8N tem "Executar agora"). Para validar uma
   configuração nova, é preciso esperar o próximo ciclo real ou mexer no
   relógio do lead diretamente no banco.

7. **`interval_value`/`interval_unit` tem teto de 720 (Zod, `route.ts`)** —
   720 horas = 30 dias é o máximo aceito; qualquer necessidade de folga
   maior que isso não é suportada.

8. **N+1 de queries por lead dentro do ciclo** — para cada lead elegível,
   o ciclo faz consultas separadas (último envio, contagem de tentativas,
   conversa mais recente) em vez de uma consulta agregada. Não é um problema
   perceptível nos volumes atuais, mas pode virar gargalo se o número de
   leads simultâneos numa etapa gatilho crescer bastante.
