# Agente de IA — Documentação Técnica

> Preparado em 2026-09-22, reflete o estado real do código nesta data.
> Cobre o agente que responde nas conversas reais. O Laboratório
> (autoavaliação com personas) é um consumidor do mesmo motor — citado
> aqui só onde compartilha peças (juiz, sandbox), sem duplicar o que já
> está em `src/lib/docs/content.ts` (seção `laboratorio`).

## 1. Visão geral

O agente é um LLM compatível com a API de chat da OpenAI (OpenRouter por
padrão, mas qualquer endpoint `/v1/chat/completions` compatível serve)
que, a cada mensagem recebida, é forçado a devolver **exatamente uma
ação** de um contrato fechado (Zod) — nunca texto livre solto. Isso é o
que impede o modelo de "fazer qualquer coisa": tudo que ele pode causar
no sistema (responder, mover etapa, anotar lead, pedir handoff) passa por
validação de schema antes de qualquer efeito colateral.

### Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/ai/index.ts` | Adaptador único ao provedor LLM (`chatJson<T>`) — chamada HTTP, retries, extração robusta de JSON |
| `src/server/ai/config.ts` | Resolve a configuração ativa (override por organização vs. env global) |
| `src/server/ai/prompts.ts` | Monta o prompt de sistema (persona + KB + etapas + contrato de ação) |
| `src/server/ai/actions.ts` | O contrato de ação (schema Zod) + degradação segura de ação inválida |
| `src/server/ai/pipeline.ts` | Orquestra um turno completo, do carregamento de contexto até o efeito no CRM |
| `src/server/ai/agent-profile.ts` | Resolve QUAL perfil (persona/comportamento) vale para uma conversa |
| `src/server/ai/trigger.ts` | Ponto de entrada chamado pela ingestão de mensagens |
| `src/server/ai/handoff.ts` | Regex de backup para detectar pedido explícito de humano |
| `src/lib/db/schema.ts` | Tabelas `ai_config`, `agent_profile`, `kb_entry`, campos de handoff em `conversation` |

## 2. Configuração do provedor (`resolveAiConfig`)

Cada organização pode ter sua própria configuração (`ai_config`, 1 linha
por org) ou herdar as variáveis de ambiente globais da instância:

```
tem linha em ai_config COM chave de API salva (cifrada)?
  SIM → usa baseUrl/model/fallbackModel/temperature/maxTokens/contextMessages
        dessa linha (chave decifrada na hora, nunca fica em texto puro em memória
        além do necessário)
  NÃO → cai nas env vars da instância: OPENROUTER_BASE_URL (default
        https://openrouter.ai/api), OPENROUTER_API_TOKEN, OPENROUTER_MODEL,
        OPENROUTER_JUDGE_MODEL (vira fallbackModel) — temperature/maxTokens
        ficam null (usa o default do próprio provedor), contextMessages fixo em 20
  NENHUM dos dois configurado → resolveAiConfig devolve null → agente fica
        mudo em toda conversa real (Laboratório continua rodando, ver §10)
```

Campos de `ai_config`: `baseUrl`, chave de API (cifrada com AES via
`@/lib/crypto`, só os 4 últimos dígitos ficam em claro para exibir na
UI), `model`, `fallbackModel` (dobra como **modelo juiz** do Laboratório),
`temperature` (default 0.7), `maxTokens` (default 500), `contextMessages`
(default 20 — quantas mensagens recentes entram no contexto de cada
turno).

### `chatJson<T>` — o contrato com o provedor

```ts
chatJson<T>(schema: ZodType<T>, messages: ChatMessage[], opts?: {...}): Promise<
  | { ok: true; data: T; raw: string }
  | { ok: false; error: "not_configured" | "provider_error" | "invalid_output"; detail: string }
>
```

Nunca lança exceção — toda falha vira um resultado tipado. Internamente:

- Até **3 tentativas**, com espera linear (500ms × tentativa) entre elas.
- Da 2ª tentativa em diante, acrescenta uma mensagem de sistema extra:
  *"STRICT: sua resposta anterior não foi JSON válido... Responda SOMENTE
  o objeto JSON, sem explicações nem markdown."*
- Extração de JSON tolerante a formato (`extractJson`): tenta, em ordem,
  (1) um bloco ` ```json ` cercado, (2) a resposta inteira crua, (3) o
  trecho entre a primeira `{` e a última `}` da resposta — cobre os três
  jeitos mais comuns de um LLM "sujar" uma resposta JSON com texto em volta.
- Timeout de 60s por chamada (15s no botão "Testar" das configurações).

Isso implementa diretamente a exigência da "Definição de Pronto" do
projeto: *"todo turno tolera formato inesperado com extração robusta +
retentativas — um soluço do provedor nunca derruba o turno."*

## 3. Perfis do agente (`resolveAgentProfile`)

Um perfil (`agent_profile`) guarda nome, tom de voz, instruções gerais,
regras de escalonamento e saudação. Uma organização pode ter **N**
perfis reutilizáveis (não é mais 1 único por org). A resolução de qual
perfil vale para uma conversa segue esta ordem de prioridade:

1. `conversation.agentProfileId` — override manual nesta conversa específica
2. Perfil padrão do **membro** atribuído à conversa (`member.agentProfileId`)
3. Perfil padrão do **departamento** da conversa (`department.agentProfileId`)
4. Perfil ativo mais antigo da organização — **só quando a conversa não
   tem departamento nenhum** (visão "geral", pré-departamentos)

**Ponto crítico:** se a conversa TEM departamento mas esse departamento
não tem perfil próprio ativo (não configurado, ou desativado), a função
devolve `null` diretamente — **não cai** no fallback do passo 4. Isso
corrige um bug real de produção: antes, um departamento sem perfil
próprio "herdava" qualquer perfil ativo em outro lugar da organização,
vazando tom/instruções de um departamento para outro. Hoje, sem perfil
próprio, o agente fica **silencioso** naquela conversa — mesmo
comportamento de "sem perfil" que o `pipeline.ts` aplica quando não acha
perfil nenhum.

`enabled` no perfil é "arquivar", não apagar — e é independente do
`aiEnabled` da conversa (aquele é o interruptor "IA nesta conversa" do
painel de detalhes; este é se o perfil em si está disponível para uso).

## 4. Prompt de sistema (`buildAgentSystemPrompt`)

Montado concatenando (e pulando o que for vazio) estes blocos, nesta ordem:

1. Persona fixa — nome do perfil, "responde SEMPRE em português do
   Brasil, mensagens curtas e naturais para chat"
2. Tom de voz (`profile.tone`), se configurado
3. Instruções do negócio (`profile.instructions`), se configurado
4. Regras de escalonamento (`profile.escalationRules`), se configurado
5. Saudação sugerida para conversas novas (`profile.greeting`), se configurado
6. **Knowledge base** — bloco `CONHECIMENTO DO NEGÓCIO (sua única fonte
   de verdade; se algo não está aqui, NÃO invente...)` com o KB inteiro
   renderizado (ver §5)
7. Lista de nomes de etapas do pipeline disponíveis (para o `move_stage`)
8. Bloco fixo de regras "duras": deve pedir handoff se o cliente pedir
   um humano; não pode inventar resposta fora do KB; deve mover etapa em
   intenção clara de compra; deve responder só JSON puro, sem markdown

**Não há sanitização/escape de prompt-injection na mensagem do cliente**
— a proteção é só instrucional (as regras acima) mais o fato estrutural
de que o modelo só consegue produzir texto visível ao cliente através
dos campos `text`/`reply`/`farewell` de uma ação validada por schema; não
existe um caminho onde a saída do modelo vira comando executado
diretamente sem passar pelo contrato de ação.

## 5. Knowledge base

Tabela `kb_entry`, dois formatos:

| `kind` | Campos usados | Renderização no prompt |
|---|---|---|
| `qa` | `question`, `answer` | `P: <question>\nR: <answer>` |
| `block` | `content` | texto livre, como está |

`department_id` nulo = entrada geral (visível para toda a organização);
preenchido = só visível para conversas **daquele** departamento. O
pipeline carrega `!departmentId || departmentId === conversation.departmentId`
— uma entrada de um departamento nunca vaza para outro.

**Sem RAG/embeddings/chunking** — o KB inteiro (filtrado por
departamento) é injetado por completo em TODO turno. É uma limitação
"v1" documentada no próprio código: o limite prático é comunicado por um
contador de caracteres na UI, não imposto no código.

## 6. Contrato de ação (`AgentAction`)

```ts
type AgentAction =
  | { action: "none" }
  | { action: "reply"; text: string }
  | { action: "update_lead"; note: string; reply?: string }
  | { action: "move_stage"; stage: string; reply?: string }
  | { action: "handoff"; reason?: string; farewell?: string };
```

O modelo deve emitir **exatamente uma** ação por turno. `move_stage` traz
o NOME da etapa (não o id) — `resolveStage()` casa contra as etapas
reais da organização (match exato, depois case-insensitive). Se não
achar etapa correspondente, `degradeAction()` rebaixa a ação com
segurança: vira `reply` (se veio um `reply` junto) ou `none` — o sistema
nunca tenta mover para uma etapa inexistente nem quebra o turno por causa
disso.

## 7. Orquestração de um turno (`runAgentTurn`)

```
1. Carrega a conversa; sem conversa → para.
2. Handoff ativo OU aiEnabled=false na conversa → para (silêncio).
3. resolveAiConfig(org) → sem config → para.
4. resolveAgentProfile(org, conversa) → sem perfil → para.
5. Carrega as últimas `contextMessages` mensagens (padrão 20), em ordem
   cronológica.
6. Sem nenhuma mensagem recebida (direction='in') nessa janela → para.
7. Conversa REAL (não sandbox) com a janela de 24h da Meta FECHADA →
   aplica handoff (motivo "ventana") e para — nem tenta chamar o LLM.
   Conversa de teste (Laboratório) pula esta checagem.
8. Regex de backup pega um pedido explícito de humano no texto do
   cliente ANTES de chamar o LLM → aplica handoff (motivo "cliente") e
   para — economiza uma chamada ao provedor num caso óbvio.
9. Carrega KB (filtrado por departamento) e nomes das etapas do pipeline.
10. Monta as mensagens (sistema + histórico) e chama chatJson(AgentAction, ...).
    - erro "not_configured" → para em silêncio
    - qualquer outro erro (provedor caiu, JSON não validou depois de 3
      tentativas) → aplica handoff (motivo "error") — nunca deixa a
      mensagem do cliente sem resposta OU sem escalar para humano
11. Executa a ação validada (reply / update_lead / move_stage / handoff /
    none) — ver §6.
```

### Coalescência (`scheduleAgentTurn` / `AGENT_COALESCE_MS`)

Uma rajada de mensagens rápidas do cliente ("oi", "tudo bem?", "queria
saber sobre X") não dispara um turno (e uma resposta) por mensagem — o
disparo real é adiado por `AGENT_COALESCE_MS` (env, padrão 6000ms) a
partir da última mensagem recebida, e um turno já em andamento para
aquela conversa marca só "mais um turno pendente" em vez de rodar em
paralelo. Resultado: no máximo 1 turno rodando por conversa por vez, e a
resposta considera a rajada inteira de uma vez, não mensagem a mensagem.

## 8. Quando o agente é (ou não é) chamado

Chamado só a partir de mensagem **recebida de verdade** (`!fromMe`),
NUNCA para: mensagem de grupo do WhatsApp, eco de mensagem enviada pelo
próprio número, ou conversa ainda não roteada por uma fila ativa
(`queueEnabled && !departmentId` — a fila decide o destino antes do
agente entrar em cena).

Mesmo passando esse filtro inicial, o próprio `runAgentTurn` ainda pode
decidir ficar em silêncio (ver §7, passos 2–4 e 6–8) — handoff ativo,
IA desligada na conversa, sem config de provedor, sem perfil resolvido,
sem mensagem para responder, janela fechada, ou pedido explícito de humano.

## 9. Handoff (passagem para humano)

Marca `conversation.handoffAt` (timestamp) + `conversation.handoffReason`
(um de `"cliente" | "modelo" | "error" | "ventana"`):

| Motivo | Quando |
|---|---|
| `cliente` | Regex de backup detectou pedido explícito de humano no texto do cliente |
| `modelo` | O próprio LLM emitiu a ação `handoff` |
| `error` | Provedor de IA falhou persistentemente, ou a resposta nunca validou como JSON esperado |
| `ventana` | Janela de 24h da Meta fechada (checagem prévia, ou reativa se o envio falhar por esse motivo) |

Uma vez em handoff, o agente **não volta sozinho** — alguém precisa
clicar "Reativar IA" no painel de detalhes da conversa, que limpa
`handoffAt`/`handoffReason` e liga `aiEnabled` de novo.

A regex de backup (`src/server/ai/handoff.ts`) exige um verbo de contato
("falar", "conversar"...) perto de uma palavra de humano ("atendente",
"pessoa"...) dentro de uma janela curta de caracteres — desenhada
deliberadamente para não disparar em frases como "somos 4 pessoas" (tem
teste unitário cobrindo esse falso positivo).

## 10. Sandbox do Laboratório (`is_test`)

Conversas do Laboratório (`conversation.isTest = true`) nunca tocam a
API real do WhatsApp. Isso é garantido em duas camadas:

1. **Camada primária**: `deliverReply()` no pipeline detecta
   `conversation.isTest` e usa `persistTestOutbound()` — grava a resposta
   só no banco, nunca chama o envio real.
2. **Camada de defesa** (backstop): o próprio `sendText`/envio de mídia
   (`src/server/inbox/send.ts`), usado tanto por humanos quanto pelo
   agente, verifica `isTest` e **lança uma exceção**
   (`SendError("sandbox_violation")`) em vez de simplesmente não fazer
   nada — se alguma mudança futura acidentalmente tentar mandar uma
   mensagem real numa conversa de teste, o sistema quebra alto e visível,
   em vez de falhar silenciosamente.

O runner do Laboratório chama `runAgentTurn` diretamente (sem passar
pela coalescência) e interrompe o roteiro assim que ocorre o primeiro
handoff no meio de uma simulação.

## 11. Limites e parâmetros (knobs)

| Parâmetro | Onde | Padrão | Efeito |
|---|---|---|---|
| `AGENT_COALESCE_MS` | env | 6000ms | Janela de espera antes de rodar o turno, pra juntar rajadas de mensagens |
| `contextMessages` | `ai_config` por org | 20 | Quantas mensagens recentes (nas duas direções) entram no histórico do prompt |
| `temperature` | `ai_config` por org | 0.7 (null = default do provedor no fallback via env) | Criatividade da resposta |
| `maxTokens` | `ai_config` por org | 500 (null no fallback via env) | Tamanho máximo da resposta |
| Timeout por chamada | `lib/ai/index.ts` | 60s (15s no botão "Testar") | Corta chamadas penduradas no provedor |
| Tentativas | `chatJson` | 3, com 500ms × tentativa | Robustez contra resposta mal formatada/erro transitório |
| Janela de mensagem | `window.ts` | 24h | Regra da própria Meta (Cloud API), não do produto |

## 12. Pontos para estudar melhoria

Não são bugs confirmados — são pontos que valem uma segunda cabeça:

1. **KB sem limite/estratégia de recorte.** O KB inteiro do departamento
   (mais o geral) é injetado em TODO turno, sem chunking nem busca
   semântica — cresce o custo de token linearmente com o tamanho do KB, e
   não há um jeito de o agente "buscar" só a parte relevante de uma base
   grande. Vira gargalo de custo/latência (e eventualmente de contexto
   máximo do modelo) para clientes com KB extenso.
2. **`update_lead` prefixa a nota com `[IA]` mas não tem estrutura.**
   Não há campos estruturados (ex.: valor, data, produto) — é sempre
   texto livre concatenado ao histórico do lead.
3. **Sem circuito de retentativa entre turnos** — uma falha do provedor
   vira handoff imediato (`error`) na mesma hora; não existe uma
   política de "tentar de novo daqui a alguns minutos antes de escalar",
   o que pode gerar handoffs desnecessários em uma instabilidade curta do
   provedor de LLM.
4. **Coalescência é por processo, não distribuída.** O `Map` de
   coalescência vive em `globalThis` do processo Node — funciona bem
   para o monólito de uma instância (arquitetura atual), mas não
   escalaria para múltiplas instâncias do app atrás de um load balancer
   sem mover esse estado para algo compartilhado (ex.: Redis) — não é um
   problema hoje, mas é um limite arquitetural implícito a documentar
   caso a "uma instância = um negócio" mude no futuro.
5. **Sem métrica de qualidade em produção**, só no Laboratório
   (simulação). Não há registro de "esse turno real teve handoff por
   erro" agregado numa tela — hoje só dá pra ver auditando conversa por
   conversa ou lendo logs.
6. **Regex de handoff é fixa no código**, não configurável pela UI —
   qualquer ajuste de sensibilidade (falso positivo/negativo) exige
   deploy, não uma tela de configuração.
7. **Um único modelo de temperatura/maxTokens por organização** — não dá
   para variar por departamento (ex.: um departamento mais "criativo",
   outro mais literal/factual).
