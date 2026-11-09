# Começando no código do Vocero

Do repositório clonado até um ambiente local com testes verdes.

## Requisitos

Node 22, Docker (com `docker compose`) e pnpm 11 (`corepack enable` ou
`npx pnpm@11.5.0`).

## Ambiente local

```bash
pnpm install
cp .env.example .env          # preencha os REEMPLAZA_...
docker run -d --name vocero-dev-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=vocero -p 127.0.0.1:5432:5432 postgres:16-alpine
MIGRATIONS_DIR=$PWD/drizzle node scripts/migrate.mjs
pnpm dev
```

Em desenvolvimento, sem convite pendente, o primeiro cadastro em `/register`
cria a organização. Para testar o fluxo de produção (dono por convite):
`pnpm owner:invite -- --email voce@exemplo.com`.

Modo de testes (mocks do WhatsApp e da IA): ver
[`specs/001-vocero-core/quickstart.md`](../specs/001-vocero-core/quickstart.md).

## Gate antes de "pronto"

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test
```

E2E com Playwright contra o `pnpm dev` com mocks:

```bash
E2E_BASE_URL=http://localhost:3000 E2E_MOCKS=1 E2E_BROWSER_CHANNEL=chrome \
E2E_OWNER_INVITE_CMD='pnpm -s run owner:invite --email {email} --json' \
pnpm test:e2e
```

O fluxo do dono precisa de uma base **sem organização**. O CI
(`.github/workflows/ci.yml`) roda o mesmo, mais a imagem de produção instalada
pelo instalador.

## Fluxo de trabalho

Features novas seguem o SDD: [`sdd-workflow.md`](sdd-workflow.md) e a pasta
[`specs/`](../specs/). Regras do projeto: [`CLAUDE.md`](../CLAUDE.md) e a
[constituição](../.specify/memory/constitution.md).
