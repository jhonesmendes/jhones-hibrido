# Contrato: Webhook do WhatsApp Cloud API

Rota: `/api/webhooks/wa/[webhookToken]` — `[webhookToken]` DEVE ser igual a
`META_WEBHOOK_VERIFY_TOKEN` (comparação timing-safe). Segmento incorreto → **404**
sem efeitos (GET e POST). Rota `force-dynamic`.

## GET (handshake de verificação)

Query: `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`.

- `hub.verify_token` == `META_WEBHOOK_VERIFY_TOKEN` e segmento correto → `200` com
  body = `hub.challenge` (texto plano).
- Qualquer outro caso → `403` (segmento incorreto → `404`).

## POST (eventos)

1. **Camada 1**: segmento ≠ token → `404` (sem ler o body).
2. **Camada 2** (somente se `META_APP_SECRET` estiver configurado): validar
   `x-hub-signature-256: sha256=<hmac>` = HMAC-SHA256(app_secret, raw body). Inválida ou
   ausente → `401`. Sem `META_APP_SECRET` → é ignorado.
3. Responder `200 {"received":true}` SEMPRE após enfileirar/processar — nunca 5xx por
   erros de domínio (a Meta reenvia e desativa webhooks que falham).

### Payload (subconjunto processado)

```jsonc
{ "object": "whatsapp_business_account",
  "entry": [{ "id": "<WABA_ID>", "changes": [{
    "field": "messages",            // ou "message_template_status_update"
    "value": {
      "metadata": { "phone_number_id": "...", "display_phone_number": "..." },
      "contacts": [{ "wa_id": "5215512345678", "profile": { "name": "..." } }],
      "messages": [{ "id": "wamid....", "from": "5215512345678",
                     "timestamp": "1720000000", "type": "text",
                     "text": { "body": "..." } }],
      "statuses": [{ "id": "wamid....", "status": "sent|delivered|read|failed",
                     "timestamp": "...", "errors": [{ "code": 131047, "title": "..." }] }]
    } }] }] }
```

Regras de processamento:

- Roteamento por `metadata.phone_number_id` → `meta_credentials.phone_number_id` → org. Sem
  correspondência → `200` e ignorar.
- `messages[]` → ingestão idempotente (`wa_message_id` UNIQUE; duplicado → no-op).
  Tipos não-texto → mensagem com `type` correspondente e body NULL (chip). Tipos
  desconhecidos → `unsupported`, sem erro.
- `statuses[]` → upgrade monotônico do estado (`sent<delivered<read`; nunca degradar;
  `failed` registra `error_detail`).
- `field: "message_template_status_update"` → `value: { event: "APPROVED"|"REJECTED"|"PENDING",
  message_template_id, message_template_name, message_template_language, reason }` →
  atualizar `template.status` (por nome+idioma ou id), idempotente.
- Após a ingestão: emitir evento SSE e disparar o pipeline do agente (se aplicável).
