# Credenciais do bot MDF-e no n8n

Este arquivo não guarda valores de chave, token ou senha. Eles ficam só no n8n, no
Vocero e nas variáveis da stack.

## Header Auth

O bot usa duas credenciais Header Auth, com funções opostas. **Não troque uma pela
outra.** O campo **Name** é o nome do header e precisa ser exatamente o da tabela.

| | Chave do Vocero | Token do webhook |
|---|---|---|
| **Sentido** | n8n chamando o Vocero | Vocero chamando o n8n |
| **Name** | `x-internal-key` | `x-vocero-token` |
| **Value** | Chave `vok_...` | Valor aleatório: `openssl rand -hex 32` |
| **De onde vem** | Vocero → Configurações → Integrações. Só aparece ao ser criada | Você gera o valor |
| **Onde mais fica** | Em nenhum outro lugar | Vocero → Campanhas → Automações N8N → Receber mensagens no n8n |
| **Nome no arquivo importado** | `Vocero x-internal-key (Bot MDF-e)` | `Vocero x-vocero-token (Bot MDF-e)` |
| **Nome hoje na Sankhya** | `Header Auth account 2` | `Header Auth account 3` |

Renomeie as credenciais no n8n para os nomes do arquivo importado. Nomes como
"account 2" e "account 3" facilitam escolher a errada.

`Header Auth account` (header `API INTERNA`) também existe na Sankhya, mas não é do bot.

### Em quais nós

Ao importar o workflow num n8n que já tem nós com esses nomes, o n8n pode acrescentar
um `1` ao final do nome do nó, como `Avisar conferindo1`.

**`x-internal-key`**

Em `02-n8n-bot-motorista-mdfe.json`:

- `Avisar conferindo`
- `Baixar mídia`
- `Vocero: enviar mensagem`
- `Vocero: transferir para departamento`
- `Vocero: enviar alerta`
- `Vocero: anotar retorno`

Em `03-n8n-alerta-erro.json`:

- `Enviar alerta`

**`x-vocero-token`**

Em `02-n8n-bot-motorista-mdfe.json`:

- `Webhook Vocero`, com **Authentication** em **Header Auth**

**Sem credencial**

`POST validar (1)`, `(2)` e `(3)` não usam credencial do n8n. O token da API de MDF-e é
obtido pelos nós `Preparar envio` e `Avaliar resposta`.

## Outras credenciais

| Credencial | Tipo | Nós | Configuração |
|---|---|---|---|
| `Postgres vocero_sankhya` | Postgres | `Registrar evento`, `Carregar sessão`, `Registrar arquivo`, `Marcar validando`, `Salvar sessão`; no workflow de erro, `Ler config` | Host `sankhya_vocero-postgres-1`, banco `vocero_sankhya` |
| `OpenAI (Bot MDF-e)` | OpenAI | `IA: classificar` | Chave da API da OpenAI |
| `SMTP (Bot MDF-e)` | SMTP | `Enviar e-mail de diagnóstico` e, no workflow de alerta, `Enviar e-mail` | Host, porta, usuário e senha do SMTP do operador |

A API de MDF-e não usa credencial do n8n: `MDFE_API_USER` e `MDFE_API_PASS` ficam nas
variáveis da stack `sankhya_n8n`, com `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

**Instância nova pelo add-on** (`scripts/install/addon-mdfe.sh`): o add-on já cria a
credencial do Postgres (`Postgres <banco> (Bot MDF-e)`, host `postgres`) e a liga aos
nós de banco, importa os dois workflows desligados e já define o workflow de alerta
como Error Workflow do bot. Continuam manuais as credenciais com segredo do operador:
`x-internal-key`, `x-vocero-token`, OpenAI e SMTP, além de `MDFE_API_USER`/`MDFE_API_PASS`
no arquivo `vocero.env` da instância.

## Erros comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O bot não responde, e `Vocero: enviar mensagem` mostra `401 Chave inválida` | Nó com `x-vocero-token`, ou chave `vok_` revogada | Selecionar `x-internal-key` no nó, ou atualizar o valor na credencial |
| `Enviar teste` responde 403 | Token diferente no n8n e no Vocero | Colocar o mesmo valor nos dois lados |
| `Executar agora` responde 403 | Esperado: o botão chama o webhook sem o token | Usar `Enviar teste` ou uma mensagem real |
| `Enviar teste` responde 404 | Workflow não publicado | Publicar o workflow |
| Nó `Vocero: ...` marcado como sucesso, mas nada chega | Esses nós seguem o fluxo mesmo com erro | Abrir a saída do nó em Executions e ler o campo `error` |

## Trocar um valor

- **Chave do Vocero:** crie uma nova em Configurações → Integrações, atualize o **Value**
  da credencial no n8n, teste e só então revogue a antiga.
- **Token do webhook:** altere o **Value** no n8n e, em seguida, salve o mesmo valor no
  Vocero. Enquanto os dois estiverem diferentes, o n8n recusa as entregas, e o Vocero
  tenta de novo depois.
