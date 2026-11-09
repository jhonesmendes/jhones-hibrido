# 009 — Instalação e validação fáceis

**Status**: em andamento · **Branch**: `feat/009-instalacao-validacao`

## Por quê

Cada cliente ganha uma instância própria. Hoje, instalar exige seguir o
`INSTALL-IA.md` à mão, o primeiro visitante de `/register` vira dono, a imagem
publicada não passa por testes e não há como provar, depois do deploy, que a
instância está correta. A auditoria de 2026-11-06 também achou dependências com
avisos críticos e uma chave padrão da API interna escrita no compose.

## O que muda (comportamento observável)

### US1 — Dono por convite (P1)

- A instalação recebe o e-mail do proprietário e gera um **link de convite de
  uso único**, com validade. Só esse e-mail consegue criar a conta dona.
- Sem convite, `/register` não cria organização em produção: a tela diz que a
  instância aguarda o convite do proprietário e como gerá-lo.
- Enquanto existir convite de dono pendente, o cadastro público fica fechado
  também fora de produção.
- Convite usado, expirado ou com e-mail diferente → mensagem clara, nada é criado.
- Gerar um convite novo invalida o anterior. Gerar com organização já existente
  é recusado.
- Instâncias que já têm organização não mudam.

### US2 — Instalador (P1)

- Um comando gera todos os segredos, grava as variáveis num arquivo próprio da
  instância (permissão 600), sobe a stack, espera o health, cria o convite do
  dono e imprime o relatório de verificação.
- Volumes e rede têm **nome próprio por instância**; o compose falha com
  mensagem clara se faltar variável obrigatória (em vez de só avisar).
- Também gera o arquivo de variáveis para colar no Portainer, sem subir nada.

### US3 — Relatório de verificação (P1)

- Um comando contra a URL da instância responde APROVADO/REPROVADO por item:
  health e banco, versão, login, cadastro fechado, mocks 404, API interna
  recusando chave vazia e a antiga chave padrão, HTTPS (quando aplicável) e
  avisos (ex.: `META_APP_SECRET` vazio). Código de saída ≠ 0 se reprovar.

### US4 — Segurança das dependências (P1)

- Next.js e demais dependências de produção atualizados para versões sem os
  avisos críticos/altos, sem quebrar os testes nem os fluxos.
- O compose não tem mais valor padrão para `INTERNAL_API_KEY`.

### US5 — Validação contínua (P2)

- CI roda typecheck, lint, testes unitários, build e E2E antes de publicar.
- Imagem publicada com tag de versão e de commit, além de `latest`.
- E2E Playwright executável (mocks): convite do dono, login, caixa de entrada
  com mensagem recebida e resposta, API interna.

### US6 — Isolamento por organização (P2)

- Queries de tabelas de domínio passam por `scoped()` ou estão numa lista de
  exceções justificadas; um teste falha se aparecer query nova fora disso.

### US7 — Bot MDF-e como add-on (P3)

- Opcional no instalador: sobe o n8n, aplica a migração do bot e importa os
  workflows. As credenciais continuam guiadas por `CREDENCIAIS.md`.

## Fora do escopo

- Trocar a chave da Fibra Forte em produção (exige coordenação com o n8n dela).
- Migrar zod 3 → 4 (mudança grande; avaliado em `tasks.md`).
