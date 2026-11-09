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
   - **Nome curto** da instância (ex.: `clientex`) e a **porta** livre no servidor.
   - **E-mail do proprietário** — só ele vai conseguir criar a conta dona.
   - **Nome do negócio** (opcional) e **token do OpenRouter** (opcional — sem
     ele tudo funciona, exceto o agente de IA e o Laboratório).
2. **Não gere segredos à mão**: o instalador gera todos e nunca os regenera
   numa instância que já existe (trocar `ENCRYPTION_KEY` tornaria ilegíveis
   os dados cifrados).
3. A conexão do número de WhatsApp NÃO faz parte do provisionamento — isso
   se faz depois, dentro do app (Configurações → Canais).

## Provisionar com o instalador (com acesso ao terminal do servidor)

```bash
scripts/install/vocero-install.sh --name <nome> --url https://<domínio> \
  --owner-email <email> [--org "<negócio>"] --port <porta> [--version 1.1.0]
```

O instalador grava `instances/<nome>/vocero.env` (permissão 600), sobe app +
Postgres com volume e rede próprios (`vocero_pg_<nome>`,
`vocero_backups_<nome>`, `vocero-net-<nome>`), espera o `/api/health`, gera
o **link de convite do proprietário** e roda o relatório de verificação.
Reexecutar é seguro. Se o nome já pertence a outro volume de banco, ele para.

Depois: aponte o proxy (Nginx Proxy Manager/Caddy) do domínio para a porta,
com destino `http://` (o app não fala TLS), e rode
`scripts/install/vocero-verify.sh https://<domínio>` — ele precisa terminar
com **INSTÂNCIA APROVADA**.

## Provisionar pelo Portainer (sem terminal)

1. `scripts/install/vocero-install.sh --mode portainer ...` (em qualquer
   máquina) gera o arquivo de variáveis da instância.
2. Stack → Repository → este repositório, branch `main`, compose path
   `docker-compose.yml`; carregue o arquivo de variáveis gerado.
3. Deploy. As migrações rodam sozinhas no boot.
4. No console do container `app`:
   `node bootstrap-owner.mjs --email <email> --org "<negócio>"` → envie o
   link impresso ao proprietário.
5. Rode `scripts/install/vocero-verify.sh https://<domínio>`.

⚠️ **Gotcha do Portainer**: as variáveis da UI da stack só valem como
substituição `${VAR}` no compose. Variável nova precisa estar também no bloco
`environment:` do serviço `app`.

⚠️ **Variáveis obrigatórias**: sem `POSTGRES_VOLUME`, `BACKUPS_VOLUME`,
`NETWORK_NAME`, os segredos ou `APP_BASE_URL`, o compose PARA com a mensagem
da variável que falta. `INTERNAL_API_KEY` não tem mais valor padrão: vazia =
desligada (use as chaves nomeadas de Configurações → Integrações).

**Atualizações**: um push em `main` publica a imagem nova (`latest` e
`sha-xxxxxxx`) só depois do CI verde. No Portainer, **Pull and redeploy**.
Para fixar versão, `VOCERO_VERSION`.

## Fechamento (dizer ao operador)

> ✅ Instância provisionada em `https://<domínio>` e aprovada na verificação.
>
> 1. Envie ao proprietário o link de convite (uso único, vale 72 horas). Ele
>    define nome e senha; o e-mail já vem preenchido e travado.
> 2. Perdeu o link? `node bootstrap-owner.mjs --email ...` no container gera
>    outro e invalida o anterior.
> 3. Para conectar o WhatsApp do cliente: **Configurações → Canais**.

## Licenciamento — variável nova em CADA instância de cliente

Toda instância de cliente (não só as novas) precisa de mais uma variável
pra o painel central conseguir gerenciar o plano dela remotamente:

| Variável | Valor |
|---|---|
| `LICENSE_CONTROL_SECRET` | gerado pelo painel central ao registrar o cliente (tela "+ Registrar cliente novo") — cole o valor exibido ali, uma vez só |

Sem essa variável, a instância continua funcionando 100% normal com a
licença trial semeada no primeiro cadastro — só a API interna de
licenciamento fica travada (falha fechada) até você configurar.

## Provisionar o painel central (admin.<domínio>) — uma vez só

O painel central é uma instância à parte, dedicada só a gerenciar as
licenças de todas as outras — nunca recebe cadastro de cliente. Roda no
mesmo build/imagem, mas com `docker-compose.admin.yml` (não o
`docker-compose.yml` normal) e ativado por `ADMIN_PANEL_HOST`.

1. **Gere os segredos:**

   ```bash
   openssl rand -base64 32   # BETTER_AUTH_SECRET (exigido pelo boot, não usado em modo painel)
   openssl rand -base64 32   # ENCRYPTION_KEY (idem)
   openssl rand -hex 32      # META_WEBHOOK_VERIFY_TOKEN (idem)
   openssl rand -hex 24      # POSTGRES_PASSWORD
   openssl rand -base64 32   # ADMIN_SESSION_SECRET
   ```

2. **Variáveis da stack** (Portainer → "Environment variables"):

   | Variável | Valor |
   |---|---|
   | `APP_BASE_URL` | `https://admin.<domínio>` |
   | `POSTGRES_DB` | `vocero_admin` |
   | `POSTGRES_PASSWORD` | gerado |
   | `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` / `META_WEBHOOK_VERIFY_TOKEN` | gerados (não usados em modo painel, mas exigidos pra o app subir) |
   | `ADMIN_PANEL_HOST` | `admin.<domínio>` (sem `https://`, só o host) |
   | `ADMIN_OPERATOR_EMAIL` | e-mail que o operador vai usar pra logar |
   | `ADMIN_OPERATOR_PASSWORD` | senha forte escolhida pelo operador |
   | `ADMIN_SESSION_SECRET` | gerado |
   | `ADMIN_REPORT_EMAIL`, `ADMIN_SMTP_HOST`, `ADMIN_SMTP_PORT`, `ADMIN_SMTP_USER`, `ADMIN_SMTP_PASSWORD`, `ADMIN_SMTP_FROM_EMAIL` | opcionais — só pro relatório diário por e-mail funcionar |

3. **Crie a stack** no Portainer apontando pro mesmo repositório
   (`https://github.com/jhonesmendes/vocero-hibrido.git`, branch `main`),
   mas com compose path **`docker-compose.admin.yml`**.
4. **Deploy** e aponte o DNS de `admin.<domínio>` pro servidor.
5. **Verifique**: `https://admin.<domínio>/admin/login` carrega a tela de
   login do operador (qualquer outra URL nesse domínio redireciona pra lá).
6. **Registre cada cliente já existente**: entre no painel → "+ Registrar
   cliente novo" → nome + URL base da instância do cliente. O painel gera um
   segredo — copie e cole em `LICENSE_CONTROL_SECRET` na stack DAQUELE
   cliente (seção acima), depois "Pull and redeploy" nele.

## Diagnóstico rápido

- App unhealthy ao subir → veja os logs do container: quase sempre é
  variável faltando (a validação de ambiente lista qual) ou banco
  inacessível.
- `/register` diz "Aguardando o proprietário" → esperado: a conta dona só
  nasce pelo link do convite (`node bootstrap-owner.mjs --email ...`).
- Tudo de login dá 500 depois de atualizar → migração não aplicou; veja
  `[migrate]` no log do container.
- `ENCRYPTION_KEY` inválida → precisa ser EXATAMENTE 32 bytes em base64
  (44 caracteres): regenere com `openssl rand -base64 32`.
- Webhook "não verificado" na Meta → domínio ainda não resolve, não é
  https, ou a URL/verify token colados não batem com os exibidos em
  Configurações → Canais.
- Push notification não funciona mesmo com VAPID configurado no Portainer →
  confira se as 3 variáveis `VAPID_*` estão de fato no bloco `environment:`
  do `docker-compose.yml` (ver gotcha acima) e se `VAPID_SUBJECT` tem o
  prefixo `mailto:`/`https:`.
