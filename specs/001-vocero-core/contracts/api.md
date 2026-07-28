# Contrato: API interna (App Router route handlers)

Todas autenticadas por sessão Better Auth e com escopo na organização do usuário
(helpers de `lib/db/tenant`). Validação Zod em todo body/query. Erros:
`{ error: { code, message } }` com status apropriado; jamais stack traces nem segredos.

| Método e rota | Propósito |
|---|---|
| `GET /api/health` | healthcheck deploy: `{ ok: true }` + check de BD |
| `GET /api/events` | SSE (ver sse.md) |
| `GET /api/conversations?since=` | lista da caixa de entrada (exclui `is_test`) |
| `GET /api/conversations/:id/messages?since=` | thread + catch-up |
| `POST /api/conversations/:id/messages` | enviar texto `{ text }` — 409 se janela fechada |
| `POST /api/conversations/:id/messages/template` | enviar template `{ templateId, variable }` |
| `PATCH /api/conversations/:id` | `{ aiEnabled? , reactivate? }` (remove handoff) |
| `GET/POST /api/contacts`, `PATCH /api/contacts/:id` | lista/busca `?q=`, notas, arquivar |
| `GET/POST/PATCH/DELETE /api/pipeline/stages(/:id)` | etapas (DELETE exige `moveTo`) |
| `PATCH /api/pipeline/leads/:id` | `{ stageId, position }` (drag & drop) |
| `GET/PUT /api/agent/profile` | comportamento + toggle global |
| `GET/POST/PATCH/DELETE /api/kb(/:id)` | knowledge base CRUD |
| `GET /api/kb/size` | tamanho estimado do KB (contador/aviso) |
| `POST /api/lab/runs` | lançar execução — 409 se houver uma `running` |
| `GET /api/lab/runs` / `GET /api/lab/runs/:id` | histórico com delta / detalhe+progresso |
| `POST /api/lab/suggestions/apply` | `{ caseId, hallazgoIndex, pregunta, respuesta }` → cria kb_entry |
| `GET/POST /api/templates` | lista / criar+enviar para aprovação |
| `POST /api/templates/sync` | sincronizar estados via Graph (pull; cobre modo agência) |
| `GET /api/pipeline/board` | etapas + cartões do kanban em uma chamada |
| `GET/PUT /api/settings/whatsapp` | estado da conexão / salvar credenciais |
| `POST /api/settings/whatsapp/test` | testar conexão (valida token↔número, NÃO salva) |
| `GET /api/settings/webhook` | URL completa do webhook + estado da assinatura |
| `GET/POST /api/settings/team` | membros / criar conta (somente proprietário) |
| `POST /api/seed/demo` | carregar demo (somente BD de domínio vazia; idempotente) |
| `POST /api/auth/[...all]` | Better Auth (cadastro controlado pela 1ª org / `ALLOW_SIGNUP`) |

Rate limiting in-process por IP nos endpoints de auth (login/cadastro): janela
deslizante, 10 tentativas / 10 min → 429.
