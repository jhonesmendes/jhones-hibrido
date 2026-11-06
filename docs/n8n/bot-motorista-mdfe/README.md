# Bot Motorista MDF-e (v1.7)

Workflow da instância Sankhya: o Vocero recebe e grava, o n8n conduz o motorista
e chama a API de MDF-e. Requer n8n 2.x e Vocero com a rota
`POST /api/internal/conversations/{id}/transfer` e `.../note`.

Cada credencial, o nó que a usa e os erros comuns estão em [CREDENCIAIS.md](CREDENCIAIS.md).

## Instalar

1. Rode `01-migration-bot-mdfe.sql` no banco `vocero_sankhya` (comando no topo do
   arquivo) e confira as 40 linhas de `bot_fluxo_config`.
2. No n8n, defina `MDFE_API_USER`, `MDFE_API_PASS` e
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
3. Importe `02-n8n-bot-motorista-mdfe.json` e selecione as credenciais:
   - **Postgres vocero_sankhya**, nos 5 nós Postgres;
   - **Header Auth `x-internal-key`** com uma chave `vok_` do Vocero, em
     `Avisar conferindo`, `Baixar mídia`, `Vocero: enviar mensagem`,
     `Vocero: transferir para departamento`, `Vocero: enviar alerta` e
     `Vocero: anotar retorno`;
   - **Header Auth `x-vocero-token`** com um valor aleatório, em `Webhook Vocero`;
   - **OpenAI** com a chave da API, em `IA: classificar`.
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
| `ia_ativa` | `true` | `false` usa só as mensagens fixas |
| `ia_modelo` | `gpt-4o-mini` | Modelo da OpenAI |
| `cargas_ativo` | `false` | `true` quando a API de cargas existir |
| `timeout_sessao_min` | `60` | Silêncio do contato que encerra a sessão, e com ela o estado calado |

Quem está no estado calado volta ao menu enviando `menu` ou `0`.

## E-mail de diagnóstico

Opcional, pelo SMTP do próprio operador. Vai um e-mail quando:

- a conferência do documento não termina em `encerrado` ou `validado`;
- uma entrega falha, como a resposta ao motorista ou o alerta no WhatsApp;
- um alerta é gerado, como o de IA fora do ar ou o limite de respostas inválidas;
- o workflow para com erro, pelo workflow de alerta (`03`).

O e-mail traz a etapa em que parou, o que fazer, o que o motorista recebeu, o retorno
completo da API e o link da execução no n8n. Não leva token nem senha, mas leva o
telefone e os dados do MDF-e devolvidos pela API.

Para ligar, crie a credencial SMTP ([CREDENCIAIS.md](CREDENCIAIS.md)) e preencha:

| Chave | Padrão | O que faz |
|---|---|---|
| `email_alerta_para` | vazio | Destinatário; vazio desliga os e-mails |
| `email_remetente` | vazio | Remetente; vazio usa o destinatário |
| `email_intervalo_seg` | `60` | No máximo um e-mail por motivo nesse intervalo |
| `n8n_url` | `https://n8n.sankhya.vocero.com.br` | Base do link da execução |

Sem conexão com o banco, o workflow de alerta não lê o destinatário e o e-mail não sai.

## Quando a API devolve um caso para a operação

Telefone que não é do motorista, por exemplo, ou outra divergência que reenviar
não resolve. O bot:

1. envia a mensagem da API, `msg_operacao` e `msg_voltar_menu`;
2. transfere a conversa para `departamento_transbordo`;
3. anota o retorno nas observações do contato e alerta `contato_alerta`.

Depois disso o menu só volta se a pessoa pedir:

| O motorista envia | O bot |
|---|---|
| `0` ou `menu` | Mostra o menu |
| `1` ou `2` | Segue direto para a opção |
| Foto ou PDF | Confere o novo documento |
| Outro texto | Responde pela IA, em lista fechada, ou repete `msg_voltar_menu`; no limite de `max_respostas_invalidas`, fica calado |

Depois de `timeout_sessao_min` sem mensagens, a próxima começa com a saudação e o menu.

## Mensagens fora de ordem e texto junto do documento

- O Vocero reentrega o evento que o n8n recusou, em até 6 horas. Um texto mais antigo
  que a última mensagem recebida é ignorado; foto e PDF são sempre conferidos.
- Texto enviado durante a janela de arquivos não recebe resposta nem cancela o
  documento. `0` ou `menu` cancelam.
- Arquivo de uma tentativa antiga não é enviado junto com um novo.

## IA

A IA só classifica a mensagem numa lista fechada de intenções. O texto enviado ao
motorista é sempre uma mensagem fixa, e a lista de intenções fica em `IA: preparar`.
Se a IA falhar ou responder fora da lista, segue a mensagem fixa e o contato de
alerta é avisado.

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
