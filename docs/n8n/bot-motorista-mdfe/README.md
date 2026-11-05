# Bot Motorista MDF-e (v1.4)

Workflow da instância Sankhya: o Vocero recebe e grava, o n8n conduz o motorista
e chama a API de MDF-e. Requer n8n 2.x e Vocero com a rota
`POST /api/internal/conversations/{id}/transfer`.

## Instalar

1. Rode `01-migration-bot-mdfe.sql` no banco `vocero_sankhya` (comando no topo do
   arquivo) e confira as 24 linhas de `bot_fluxo_config`.
2. No n8n, defina `MDFE_API_USER`, `MDFE_API_PASS` e
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
3. Importe `02-n8n-bot-motorista-mdfe.json` e selecione as credenciais:
   - **Postgres vocero_sankhya**, nos 5 nós Postgres;
   - **Header Auth `x-internal-key`** com uma chave `vok_` do Vocero, em
     `Avisar conferindo`, `Baixar mídia`, `Vocero: enviar mensagem` e
     `Vocero: transferir para departamento`;
   - **Header Auth `x-vocero-token`** com um valor aleatório, em `Webhook Vocero`.
4. Publique o workflow.
5. No Vocero, em **Campanhas → Automações N8N → Receber mensagens no n8n**, cole a
   URL de produção e o mesmo token e clique em **Enviar teste**.

Com o webhook ligado, o agente de IA do Vocero não responde nessa instância.

## Por que o envio está em três nós

`POST validar (1|2|3)` existe para cada quantidade de arquivos porque o nó HTTP
Request não aceita linha de arquivo vazia. Não monte o multipart em nó Code: os
bytes não atravessam `this.helpers.httpRequest` intactos, e o processo principal
do n8n travou em 100% de CPU no teste com um PDF de 500 KB.
