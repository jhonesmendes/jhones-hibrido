# Bot Motorista MDF-e (v1.5)

Workflow da instância Sankhya: o Vocero recebe e grava, o n8n conduz o motorista
e chama a API de MDF-e. Requer n8n 2.x e Vocero com a rota
`POST /api/internal/conversations/{id}/transfer` e `.../note`.

## Instalar

1. Rode `01-migration-bot-mdfe.sql` no banco `vocero_sankhya` (comando no topo do
   arquivo) e confira as 27 linhas de `bot_fluxo_config`.
2. No n8n, defina `MDFE_API_USER`, `MDFE_API_PASS` e
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
3. Importe `02-n8n-bot-motorista-mdfe.json` e selecione as credenciais:
   - **Postgres vocero_sankhya**, nos 5 nós Postgres;
   - **Header Auth `x-internal-key`** com uma chave `vok_` do Vocero, em
     `Avisar conferindo`, `Baixar mídia`, `Vocero: enviar mensagem`,
     `Vocero: transferir para departamento`, `Vocero: enviar alerta` e
     `Vocero: anotar retorno`;
   - **Header Auth `x-vocero-token`** com um valor aleatório, em `Webhook Vocero`.
4. Importe `03-n8n-alerta-erro.json`, selecione as mesmas credenciais de Postgres
   e `x-internal-key` em `Ler config` e `Enviar alerta`, e publique.
5. No workflow do bot, em **Settings → Error Workflow**, escolha
   `Fibra Forte — Alerta de erro dos workflows`, e publique.
6. No Vocero, em **Campanhas → Automações N8N → Receber mensagens no n8n**, cole a
   URL de produção e o mesmo token e clique em **Enviar teste**.

Com o webhook ligado, o agente de IA do Vocero não responde nessa instância.

Importar a nova versão não muda a URL do webhook nem o token. Só desative o
workflow antigo antes de publicar o novo, porque os dois usam a mesma URL.

## Editar as mensagens

No painel admin, abra o cliente e use **Mensagens do bot**. Vale a partir da próxima
mensagem recebida, sem republicar o workflow. A instância precisa estar cadastrada
no painel, com o mesmo segredo em `LICENSE_CONTROL_SECRET`.

Editar `01-migration-bot-mdfe.sql` não muda textos já gravados no banco.

## Ajustes em `bot_fluxo_config`

| Chave | Padrão | O que faz |
|---|---|---|
| `contato_alerta` | `5566999679169` | Quem recebe os alertas; vazio desliga os alertas do bot |
| `alerta_intervalo_seg` | `60` | No máximo um alerta por motivo nesse intervalo |
| `max_respostas_invalidas` | `3` | Ao chegar nesse número, o bot transfere e fica calado |
| `timeout_sessao_min` | `60` | Silêncio do contato que encerra a sessão, e com ela o estado calado |

Quem está no estado calado volta ao menu enviando `menu` ou `0`.

## Onde ver o retorno da API

- **Observações do contato**, no Vocero: status, código, protocolo, chave, telefone
  e mensagem de cada conferência.
- **WhatsApp de `contato_alerta`**: tudo que não for `encerrado` ou `validado`.
- **n8n → Executions → `Pós-validar`**: a resposta completa, em `registro.retorno_api`.

## Por que o envio está em três nós

`POST validar (1|2|3)` existe para cada quantidade de arquivos porque o nó HTTP
Request não aceita linha de arquivo vazia. Não monte o multipart em nó Code: os
bytes não atravessam `this.helpers.httpRequest` intactos, e o processo principal
do n8n travou em 100% de CPU no teste com um PDF de 500 KB.
