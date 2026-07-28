# Quickstart — desenvolvimento local e self-test (001-vocero-core)

## Requisitos

Node 22 + pnpm · Docker (para Postgres local e a Rota B) · `.env` a partir de
`.env.example`.

## Subindo em desenvolvimento

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d postgres   # Postgres local
pnpm db:migrate                                            # aplicar migrações
pnpm dev                                                   # http://localhost:3000
```

Primeiro uso: cadastre-se (cria a organização) → botão "Carregar dados de demonstração"
(ou `pnpm seed:demo`).

## Modo de testes interno (self-test)

No `.env` de desenvolvimento:

```
WA_MOCK_ENABLED=true
META_GRAPH_BASE_URL=http://localhost:3000/api/dev/wa-mock/graph
OPENROUTER_BASE_URL=http://localhost:3000/api/dev/ai-mock
OPENROUTER_API_TOKEN=test-token
```

Conecte o número em Settings → WhatsApp com IDs de teste (qualquer token SEM o
sufixo `-invalid`). Simular um recebimento:

```bash
curl -X POST localhost:3000/api/dev/wa-mock/inbound \
  -H 'content-type: application/json' \
  -d '{"phoneNumberId":"<o do wizard>","from":"5215511111111","name":"Cliente Demo","text":"hola"}'
```

## Gate técnico e testes

```bash
pnpm typecheck && pnpm lint && pnpm build && pnpm test   # Vitest unit
```

Self-test E2E: conduzido com Playwright (MCP) seguindo os roteiros de
`tests/e2e/` contra `pnpm dev` e contra a Rota B (`docker compose up`).

## Rota B local (verificação compose)

```bash
DOMAIN=localhost docker compose up -d --build
# Caddy serve https://localhost (cert interno); healthchecks em app/db/caddy
```
