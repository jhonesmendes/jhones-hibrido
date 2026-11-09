# Corte para produção — spec 009

Ordem: **Sankhya → admin → Fibra Forte**. Cada passo só depois do anterior
verificado. Nada aqui roda antes do CI verde publicar a imagem nova.

## Antes de qualquer instância

1. CI verde no `main` (verify + e2e-dev + e2e-image) e imagem publicada.
2. Guardar a imagem atual para voltar atrás, no servidor:
   `docker tag ghcr.io/jhonesmendes/jhones-hibrido:latest vocero:pre-009`
   (antes do pull da nova).
3. Backup do banco pela própria tela (Configurações → Backups) ou `pg_dump`.

A migração 0056 só **acrescenta** (tabela `owner_invite` e coluna
`invitation.created_at` com padrão): a imagem anterior continua funcionando
com o banco migrado. Voltar = apontar a stack para `vocero:pre-009`.

## Sankhya (`sankhya_vocero`)

Variáveis já corretas: `POSTGRES_VOLUME=vocero_pg_sankhya`,
`BACKUPS_VOLUME=sankhya_vocero_backups`, `NETWORK_NAME=vocero-sankhya`,
`INTERNAL_API_KEY` com valor próprio.

1. Portainer → **Pull and redeploy**.
2. `scripts/install/vocero-verify.sh https://sankhya.vocero.com.br` → APROVADA.
3. Mandar uma mensagem de teste ao bot MDF-e e conferir a execução no n8n.

## Admin (`admin-vocero`)

Usa `docker-compose.admin.yml` (não mudou). Só **Pull and redeploy** para
receber o Next.js corrigido; conferir `/admin/login`.

## Fibra Forte (`vocero_crm_gestao_fibra_forte`)

Hoje: `INTERNAL_API_KEY` = antiga chave padrão (usada pelo n8n da Fibra
Forte), backup no volume de nome fixo `vocero_backups`, mídia ainda no banco
(imagem de 30/10, sem pasta `/app/media`).

1. No Vocero da Fibra Forte: Configurações → Integrações → **criar chave**
   `n8n Fibra Forte` (aparece uma vez).
2. No n8n da Fibra Forte: trocar o **Value** da credencial `x-internal-key`
   pela chave nova; executar um workflow e conferir 200.
3. Variáveis da stack no Portainer:
   - acrescentar `BACKUPS_VOLUME=vocero_backups` (mantém os backups atuais);
   - apagar `INTERNAL_API_KEY` (ou deixar vazia).
4. **Pull and redeploy**. A mídia passa a ir para o volume
   `vocero_crm_gestao_fibra_forte_vocero_media`; a migração do legado move
   os anexos antigos aos poucos (ver `src/server/media/`).
5. `scripts/install/vocero-verify.sh https://<domínio da Fibra Forte>` →
   APROVADA, incluindo "Antiga chave padrão recusada".
6. Conferir uma automação do n8n de novo (agora só com a chave nomeada).

Se o passo 4 parar com "Defina BACKUPS_VOLUME": é o passo 3 que faltou.
