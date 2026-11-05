# Integração via API — como o N8N (ou qualquer sistema externo) conversa com o Vocero

> Atualizado em 2026-11-05, reflete o estado real do código nesta data.
> Cobre a instância operada por automação (o n8n responde, o Vocero recebe
> e grava) e as rotas de disparo. A execução manual de workflows pela aba
> Automações em Campanhas está em `src/lib/docs/content.ts`, seção
> `automacoes-n8n`.

## 0. Instância operada pelo n8n

```
Cliente → WhatsApp → Vocero (grava) → webhook do n8n
                                         ↓ decide
Cliente ← WhatsApp ← Vocero (grava) ← POST /api/internal/messages
```

### Configurar

1. No n8n: workflow com node **Webhook**, método POST, autenticação Header
   Auth (`x-vocero-token`) e o workflow **ativo**. Use a URL de produção.
2. No Vocero: **Campanhas → Automações N8N → Receber mensagens no n8n**: cole
   a URL e o token, salve e clique **Enviar teste** (chega `{ "event": "test" }`).
3. No Vocero: **Configurações → Integrações**: crie uma chave e use-a no header
   `x-internal-key` dos nodes HTTP Request.

Com o webhook ligado, o agente de IA do Vocero não responde (evita resposta
dupla). Fila de atendimento e grupos não mudam: mensagem de grupo não vai ao n8n.

### Evento recebido pelo n8n

```json
{
  "event": "message.received",
  "eventId": "msg_...",
  "occurredAt": "2026-11-04T12:00:00.000Z",
  "conversationId": "cv_...",
  "channel": "official",
  "contact": { "id": "ct_...", "phone": "5566999990000", "name": "Maria" },
  "message": {
    "id": "msg_...",
    "waMessageId": "wamid...",
    "type": "text",
    "text": "quero um orçamento",
    "replyToMessageId": null,
    "location": null,
    "media": null
  }
}
```

Em mensagem com mídia, `message.media` traz `url`, `available`, `mimeType`,
`filename` e `sizeBytes`. Baixe de `url` com o header `x-internal-key`.
`available: false` significa download ainda em recuperação: a URL responde 404
até a mídia chegar.

Em mensagem `location`, `message.location` traz `latitude`, `longitude`, `name`
e `address`, e `message.text` traz a versão legível.

Entrega: qualquer resposta 2xx confirma. Sem ela, tenta de novo após 30s, 2min,
10min, 1h e 6h, sobrevivendo a reinício. Pode haver entrega repetida: deduplique
por `eventId` se o workflow não puder repetir. A tela mostra pendências e o
último erro.

### `POST /api/internal/messages`

Envia **e grava no CRM**: cria contato e conversa se preciso, respeita a janela
de 24h e o canal da conversa. Informe `conversationId` **ou** `to`, e exatamente
um entre `text`, `template` e `media`.

```json
{ "conversationId": "cv_...", "text": "Olá Maria, segue o orçamento" }
```

```json
{ "to": "5566999990000", "name": "Maria", "template": { "name": "boas_vindas", "language": "pt_BR", "variables": ["Maria"] } }
```

```json
{ "conversationId": "cv_...", "media": { "dataBase64": "...", "mimeType": "application/pdf", "filename": "orcamento.pdf", "caption": "Orçamento" } }
```

Campo opcional: `replyToMessageId`. Mídia: até 16MB.

Sucesso `201`: `{ "success": true, "messageId", "conversationId", "contactId" }`.

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Chave ausente/inválida |
| 422 | `invalid_body` | Corpo fora do schema |
| 422 | `invalid_phone` | `to` sem DDD ou inválido |
| 404 | `not_found` | Conversa não existe |
| 404 | `template_not_found` | Sem modelo aprovado com esse nome |
| 422 | `invalid` | Faltou variável do modelo ou arquivo inválido |
| 422 | `window_closed` | Janela de 24h fechada: use `template` |
| 409 | `not_connected` / `reconnect_required` | Canal desconectado |
| 422 / 503 | `meta_error` / `meta_unavailable` | Erro ou indisponibilidade da Meta |

`to` com a janela fechada devolve `window_closed`, mas o contato e a conversa
ficam criados.

### `POST /api/internal/conversations/{id}/transfer`

Passa a conversa para um departamento humano. Informe `departmentId` **ou**
`departmentName`; `reason` (até 120 caracteres) e `note` (até 1000) são opcionais.

```json
{ "departmentName": "Operação", "reason": "bot_transbordo", "note": "Protocolo 123" }
```

A conversa fica sem responsável e marcada como escalada. Se o destino tem fila,
ela entra na fila. Se já está com alguém desse departamento, continua com essa
pessoa. A `note` vai para as observações do contato e para o rastro da conversa.

Sucesso `200`: `{ "success": true, "conversationId", "departmentId", "departmentName", "queued" }`.

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Chave ausente/inválida |
| 422 | `invalid_body` | Corpo fora do schema |
| 404 | `not_found` | Conversa não existe |
| 404 | `department_not_found` | Sem departamento ativo com esse id/nome |

### `POST /api/internal/conversations/{id}/note`

Grava uma nota nas observações do contato, sem mexer no atendimento:
`{ "note": "Protocolo 123" }` (até 1000 caracteres). Passando de 4000 caracteres
no total, sai o trecho mais antigo. Sucesso `200`: `{ "success": true }`. Erros:
`401 unauthorized`, `422 invalid_body`, `404 not_found`.

O transbordo não desliga o evento: as próximas mensagens continuam chegando ao
workflow, que decide o que fazer com elas.

## 1. Visão geral

Além de `/api/internal/messages` (seção 0), o Vocero expõe estas rotas HTTP
**sem sessão de usuário**, autenticadas só por uma chave de API, pensadas para
automações externas (N8N, ERP, qualquer sistema por token):

| Rota | Para quê |
|---|---|
| `POST /api/internal/send-message` | Manda um texto avulso pelo número **oficial** (Meta Cloud API) já conectado nesta instância. |
| `POST /api/internal/campaigns` | Dispara uma campanha em massa pelo canal **WhatsApp Web** (não oficial), com imagem opcional, para uma lista de destinatários. |

Arquivos: `src/app/api/internal/send-message/route.ts` e
`src/app/api/internal/campaigns/route.ts`. Autenticação e emissão de
chave: `src/server/integrations/api-keys.ts`.

## 2. Autenticação

Toda chamada exige o header:

```
x-internal-key: <token>
```

Duas formas de chave são aceitas (checadas nessa ordem):

1. **Chave nomeada, gerada em Configurações → Integrações** (só
   owner/admin veem essa tela). Uma chave por sistema externo (ex.:
   "N8N — cobrança automática") — cada uma é revogável isoladamente, sem
   afetar as outras. O token só é mostrado **uma única vez**, no momento
   da criação (`POST /api/settings/integrations`, retorna `{ id, token
   }`) — só o hash SHA-256 fica salvo no banco, nunca o valor em claro.
   Formato do token: prefixo `vok_` + 64 hex (`vok_<64 caracteres>`).
2. **`INTERNAL_API_KEY`** (variável de ambiente do servidor) — mecanismo
   legado, mantido só para não quebrar integrações configuradas antes
   das chaves nomeadas existirem. Comparação em tempo constante
   (`timingSafeEqual`), sem log do valor.

Qualquer chave válida resolve para uma `organizationId` — a chave
nomeada aponta direto para a organização que a criou; a `INTERNAL_API_KEY`
legada sempre resolve para a organização mais antiga da instância (regra
"uma instância = um negócio" da Constituição do produto).

Sem header, header vazio, ou chave inválida/revogada → `401 unauthorized`.

## 3. `POST /api/internal/send-message`

Envio de texto livre, passthrough — **não cria conversa nem mensagem
visível na Caixa de Entrada do CRM**, e **não verifica a janela de 24h**
da Meta. Quem chama é responsável por só usar dentro de uma janela válida
(ou com conteúdo permitido fora dela) — fora disso, a própria Meta recusa
o envio.

### Corpo

```json
{
  "to": "5511999998888",
  "text": "Seu boleto vence amanhã."
}
```

| Campo | Regra |
|---|---|
| `to` | string, 8–20 caracteres (telefone com DDI) |
| `text` | string, 1–4096 caracteres |

### Resposta de sucesso — `200`

```json
{ "success": true, "messageId": "wamid.HBg..." }
```

### Erros

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Chave ausente/inválida |
| 422 | `invalid_body` | Corpo fora do schema |
| 409 | `not_connected` | Organização sem número oficial conectado |
| 409 | `reconnect_required` | Número oficial existe mas precisa ser reconectado |
| 403 | `sandbox_violation` | (guardrail interno — não deveria ocorrer via esta rota) |
| 404 | `recipient_not_found` | Número de destino rejeitado pela Meta |
| 422 | `window_closed` | Janela de 24h fechada e a Meta recusou o texto livre |
| 422 | `meta_error` | Erro genérico devolvido pela Graph API |
| 503 | `meta_unavailable` | Graph API fora do ar / timeout |

### Exemplo `curl`

```bash
curl -X POST https://SEU-DOMINIO/api/internal/send-message \
  -H "x-internal-key: vok_xxxxxxxx..." \
  -H "content-type: application/json" \
  -d '{"to":"5511999998888","text":"Seu boleto vence amanhã."}'
```

## 4. `POST /api/internal/campaigns`

Dispara uma campanha para uma **lista pronta de destinatários** (não CSV
— isso é exclusivo desta rota; a UI de Campanhas usa uma origem
diferente) pelo canal **WhatsApp Web**. Só canal não oficial por ora — o
canal oficial exige modelo aprovado pela Meta, fluxo incompatível com
imagem livre por URL.

### Corpo

```json
{
  "name": "Cobrança lote 42",
  "messageTemplate": "Olá {{nome}}, seu boleto de {{valor}} vence amanhã.",
  "mediaUrl": "https://exemplo.com/boleto.png",
  "sendIntervalMs": 8000,
  "riskAcknowledged": true,
  "recipients": [
    { "phone": "5511999998888", "variables": { "nome": "Maria", "valor": "R$ 150,00" } }
  ]
}
```

| Campo | Regra |
|---|---|
| `name` | 1–80 caracteres |
| `messageTemplate` | 1–2000 caracteres; aceita `{{variavel}}` nomeada, preenchida por destinatário via `recipients[].variables` |
| `mediaUrl` | opcional, URL pública de imagem — baixada **uma única vez** na criação da campanha (limite 16MB, `content-type` precisa ser `image/*`) |
| `sendIntervalMs` | 1000–300000 (1s a 5min) — intervalo entre envios, **nunca fixo** (exigência de produto: risco de ban do WhatsApp Web) |
| `riskAcknowledged` | precisa ser `true` — confirmação obrigatória do risco de ban, mesmo vindo de automação |
| `recipients` | 1 a 5000 itens, cada um com `phone` (8–20 chars) e `variables` opcional (mapa nome→valor) |

### Resposta de sucesso — `201`

```json
{
  "campaign": { "id": "camp_...", "name": "Cobrança lote 42", "status": "running", "...": "..." },
  "startError": null
}
```

`startError` vem preenchido (string) quando a campanha foi **criada** mas
não conseguiu **iniciar o disparo** na hora (ex.: canal caiu entre a
criação e o start) — nesse caso a campanha existe e pode ser retomada
pela UI normal de Campanhas.

### Erros

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Chave ausente/inválida |
| 422 | `invalid_body` | Corpo fora do schema (mensagem detalha o campo) |
| 422 | `invalid` | Regra de negócio geral inválida |
| 422 | `no_recipients` | Lista de destinatários vazia após validação |
| 422 | `media_failed` | Falha ao baixar/validar a imagem de `mediaUrl` |
| 409 | `channel_not_connected` | Nenhum canal WhatsApp Web conectado na organização |

### Exemplo `curl`

```bash
curl -X POST https://SEU-DOMINIO/api/internal/campaigns \
  -H "x-internal-key: vok_xxxxxxxx..." \
  -H "content-type: application/json" \
  -d '{
    "name": "Cobrança lote 42",
    "messageTemplate": "Olá {{nome}}, seu boleto de {{valor}} vence amanhã.",
    "sendIntervalMs": 8000,
    "riskAcknowledged": true,
    "recipients": [{ "phone": "5511999998888", "variables": { "nome": "Maria", "valor": "R$ 150,00" } }]
  }'
```

## 5. Configurando no N8N

1. No Vocero: **Configurações → Integrações** → criar chave, copiar o
   token (só aparece uma vez).
2. No N8N: nó **HTTP Request**, método `POST`, URL para a rota desejada,
   header `x-internal-key` com o token, corpo JSON conforme acima.
3. Testar primeiro com `send-message` (efeito mais simples de conferir)
   antes de configurar um workflow de campanha em massa.

## 6. Coisas a saber antes de estudar melhorias aqui

- `send-message` é **deliberadamente burro** (passthrough): nada do que
  passa por ele aparece na Caixa de Entrada nem gera histórico de
  conversa no CRM — só existe o log de erro/sucesso da própria chamada.
  Se a mensagem precisa aparecer no histórico do contato, use
  `/api/internal/messages`.
- Não há limite de taxa (rate limit) próprio nessas rotas além do que a
  própria Meta/WhatsApp Web aplicam — um workflow de N8N mal configurado
  em loop pode gerar volume alto sem o Vocero barrar.
- `campaigns` só aceita canal `unofficial` — pedir suporte a canal
  `official` por aqui exigiria resolver como um modelo aprovado (com
  variáveis) se encaixa no formato de `messageTemplate`/`recipients`
  atual, que foi desenhado para texto livre.
- `INTERNAL_API_KEY` (chave legada única por instância) e as chaves
  nomeadas por organização convivem hoje sem nenhum aviso de
  depreciação na UI — só o comentário no código sinaliza que é legado.
