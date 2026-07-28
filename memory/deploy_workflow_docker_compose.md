---
name: deploy-workflow-docker-compose
description: Como o dono realmente implanta mudanças (docker compose direto no próprio ambiente, sem pipeline de CI) — e o gotcha de achar que um fix "não funcionou" quando na verdade só não foi implantado
metadata:
  type: project
---

O ambiente de teste do dono NÃO é o dev server local (`pnpm dev`) — é um
stack Docker Compose Ruta B rodando de verdade
(`vocero-hibrido-{app,caddy,postgres}`), com o `app` construído a partir do
`Dockerfile` multi-stage do próprio repo. Editar arquivos-fonte NÃO afeta
esse container automaticamente — é preciso `docker compose build app &&
docker compose up -d app` pra cada rodada de correções chegar lá.

**Gotcha caro (já aconteceu 2x nesta sessão)**: corrigir um bug no código,
rodar o gate técnico local (typecheck/lint/test/build) tudo verde, e o dono
reportar que "o bug continua" — na real o container dele ainda estava
rodando a imagem antiga. Sempre checar
`docker inspect <container> --format '{{.Created}}'` contra o horário das
mudanças antes de assumir que uma correção "não pegou". Ver também
[[sprint4_baileys_native_engine]] pros bugs específicos que isso mascarou
(LID, 9º dígito do BR).

**Fluxo estabelecido** (repetido a cada rodada de fix): editar → gate
técnico local → pedir confirmação ao dono (`AskUserQuestion`) antes de
qualquer `DELETE` direto no Postgres do container dele ou de reconstruir/
reiniciar (interrupção breve do serviço) → `docker compose build app` →
`docker compose up -d app` → verificar saudável + reconectou ao WhatsApp
sozinho (prova real de que a sessão pareada sobreviveu ao restart, valida
US3 de [[sprint4_baileys_native_engine]] a cada rebuild).

**Self-test contra DB real, não só typecheck**: pra funções que tocam o
Postgres direto (ex.: `importContactsCsv`), o padrão desta sessão é
bundlar um script ad-hoc com esbuild (`--alias:@=./src --packages=external`,
banner com `createRequire`) e rodar contra o Postgres de
`docker-compose.dev.yml` (local, separado do ambiente do dono) — output
precisa ficar na raiz do projeto (não no scratchpad) pra `node_modules`
resolver `--packages=external`. Ver `local_dev_e2e_gotchas.md` pro mesmo
padrão aplicado a testes Playwright.
