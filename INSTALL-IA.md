# INSTALL-IA.md — Provisionar uma instância nova (guiado por IA)

> **Para o assistente de IA** (Claude Code ou outro agente com acesso a
> ferramentas): este arquivo É o seu roteiro. Siga de cima a baixo e NÃO peça
> ao operador nada que você mesmo consiga gerar.
>
> **Para o humano**: cada cliente contratante ganha sua própria instância
> (banco, credenciais e domínio isolados) — esse é o fluxo de provisionar uma
> nova. Cole este arquivo no seu assistente de IA com acesso ao Portainer (ou
> ao terminal do servidor) e responda as perguntas que ele fizer.

**Repositório**: `https://github.com/jhonesmendes/vocero-hibrido` (privado —
exige acesso). Imagem publicada em `ghcr.io/jhonesmendes/jhones-hibrido:latest`
a cada push em `main`; `docker-compose.yml` na raiz consome essa imagem
pronta (não builda a partir do Dockerfile local).

## Regras para o assistente

1. Pergunte ao operador SOMENTE isto, numa única mensagem:
   - **Domínio** onde a instância vai viver (ex.: `crm.clientex.com.br`), já
     apontando para o servidor (registro A/CNAME).
   - **Nome da stack** no Portainer (ex.: `vocero_crm_clientex`).
   - **Token do OpenRouter** (opcional — sem ele, tudo funciona exceto o
     agente de IA e o Laboratório; pode entrar depois).
2. **Gere você mesmo todos os segredos** (não peça ao operador):

   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET
   openssl rand -base64 32   # ENCRYPTION_KEY (precisa ser exatamente 32 bytes base64)
   openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN
   openssl rand -hex 24      # POSTGRES_PASSWORD
   ```

3. A conexão do número de WhatsApp NÃO faz parte do provisionamento — isso
   se faz depois, dentro do app (Configurações → Canais).

## Variáveis de ambiente

| Variável | Valor |
|---|---|
| `APP_BASE_URL` | `https://<domínio>` |
| `POSTGRES_DB` | ex.: `vocero_<cliente>` |
| `POSTGRES_PASSWORD` | gerado |
| `POSTGRES_VOLUME` | ex.: `vocero_pg_<cliente>` (nome do volume Docker — precisa ser único por stack) |
| `NETWORK_NAME` | ex.: `vocero-net-<cliente>` (idem, único por stack) |
| `BETTER_AUTH_SECRET` | gerado |
| `ENCRYPTION_KEY` | gerado (base64, 44 caracteres) |
| `META_WEBHOOK_VERIFY_TOKEN` | gerado |
| `META_APP_SECRET` | opcional — assinatura extra do webhook em modo direto |
| `META_GRAPH_API_VERSION` | `v25.0` |
| `OPENROUTER_API_TOKEN` | do operador, se informado |
| `OPENROUTER_MODEL` | se houver token: sugira `anthropic/claude-sonnet-4.5` ou outro |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | opcional — push notifications; `VAPID_SUBJECT` MUST começar com `mailto:` ou `https:` |

⚠️ **Gotcha conhecido**: no Portainer, as variáveis cadastradas na UI da stack
só valem como substituição `${VAR}` dentro do texto do `docker-compose.yml`
— elas NÃO chegam ao container sozinhas. Cada variável nova precisa estar
listada também no bloco `environment:` do serviço `app` no compose (já é o
caso de todas as da tabela acima); se adicionar uma variável nova no futuro,
lembre de adicioná-la lá também.

## Provisionar (Portainer — fluxo atual)

1. **Confirme a infraestrutura compartilhada do servidor**: reverse proxy/
   HTTPS de domínios já existe no servidor (não é provisionado por este
   compose — ele não inclui Caddy nem Traefik). Pergunte ao operador como o
   domínio novo deve ser roteado até a porta exposta pelo serviço `app`
   (`APP_PORT`, padrão `3000`) se não for óbvio pela infra já em uso pelas
   outras stacks.
2. **Crie a stack** no Portainer: "Repository" apontando para
   `https://github.com/jhonesmendes/vocero-hibrido.git`, branch `main`,
   compose path `docker-compose.yml`. Cole as variáveis da tabela acima na
   seção "Environment variables" da stack.
3. **Deploy**. As migrações do Drizzle rodam sozinhas ao iniciar o container
   (`node migrate.mjs && node server.js`) — não precisa de comando extra.
4. **Verifique**: `https://<domínio>/api/health` responde `{"ok":true}` e
   `https://<domínio>/login` carrega.
5. **Atualizações futuras**: um push em `main` gera imagem nova no GHCR — no
   Portainer, clique **"Pull and redeploy"** (não só "Redeploy", que reusa a
   imagem já baixada) para a stack buscar o commit novo.

## Fechamento (dizer ao operador)

> ✅ Instância provisionada em `https://<domínio>`.
>
> 1. Entre e **cadastre-se**: o primeiro cadastro cria a organização (depois
>    o cadastro público se fecha sozinho).
> 2. Opcional: **"Carregar dados de demonstração"** para explorar com a
>    Ferretaria de exemplo.
> 3. Para conectar o WhatsApp do cliente: **Configurações → Canais** — o
>    wizard mostra a URL exata do webhook para colar no painel da Meta (ou
>    no backend de Provedor de Tecnologia, se for modo agência).

## Diagnóstico rápido

- App unhealthy ao subir → veja os logs do container: quase sempre é
  variável faltando (a validação de ambiente lista qual) ou banco
  inacessível.
- `ENCRYPTION_KEY` inválida → precisa ser EXATAMENTE 32 bytes em base64
  (44 caracteres): regenere com `openssl rand -base64 32`.
- Webhook "não verificado" na Meta → domínio ainda não resolve, não é
  https, ou a URL/verify token colados não batem com os exibidos em
  Configurações → Canais.
- Push notification não funciona mesmo com VAPID configurado no Portainer →
  confira se as 3 variáveis `VAPID_*` estão de fato no bloco `environment:`
  do `docker-compose.yml` (ver gotcha acima) e se `VAPID_SUBJECT` tem o
  prefixo `mailto:`/`https:`.
