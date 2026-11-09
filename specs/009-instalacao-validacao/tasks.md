# Tarefas — 009 Instalação e validação

Estado durável do loop. Marque `[X]` só depois de verificado.

## Notas de verificação

- Better Auth 1.7 exige `invitation.created_at` (sem ela toda rota de auth
  dá 500) — achado pelo `vocero-verify`, corrigido na migração 0056.
- Upgrade simulado da imagem do `main` (better-auth 1.6) para a nova:
  migração aplicada, sessão aberta, senha, chave do n8n e convite de equipe
  continuam valendo; cadastro fica `closed`.
- Zod 3→4 feito (só `error.issues` era usado); restam 2 avisos de
  ferramentas de dev (esbuild do drizzle-kit, minimatch do eslint).

- Isolamento: corrigidas escritas sem escopo em `DELETE /api/contacts/[id]`,
  `deleteConversation`, limpeza do seed demo, `push/unsubscribe`, e o
  pipeline do agente (`organizationId` recebido e ignorado). Guarda com
  mutação testada.
- Add-on MDF-e: 1ª importação no n8n pode falhar no primeiro boot → retentativa.

## Fase 1 — Segurança (US4)

- [X] T001 Atualizar Next.js (≥ 15.5.29) e eslint-config-next
- [X] T002 Atualizar nodemailer, better-auth, drizzle-orm/drizzle-kit e transitivas (overrides)
- [X] T003 Gate completo + fluxos de auth/e-mail verificados após as atualizações
- [X] T004 Remover valor padrão de `INTERNAL_API_KEY` do compose

## Fase 2 — Dono por convite + instalador (US1, US2, US3)

- [X] T010 Tabela `owner_invite` + migração
- [X] T011 Serviço: criar/checar/consumir convite do dono (atômico)
- [X] T012 Gate de cadastro: produção sem org → aguardando convite
- [X] T013 Rotas: status do cadastro, checar convite, aceitar convite do dono
- [X] T014 Tela `/register` com `?owner=`, e estados fechado/aguardando
- [X] T015 CLI `bootstrap-owner` (no repo e na imagem)
- [X] T016 Health com versão; build com `APP_VERSION`/`GIT_SHA`
- [X] T017 Compose: variáveis obrigatórias `:?`, volumes por instância
- [X] T018 `scripts/install/vocero-install.sh`
- [X] T019 `scripts/install/vocero-verify.sh`
- [X] T020 Testes unitários do convite do dono e do gate
- [X] T021 Instalação limpa ponta a ponta com o instalador + verificação

## Fase 3 — Validação contínua (US5)

- [X] T030 `@playwright/test` + config + specs E2E com mocks
- [ ] T031 CI: verify + e2e antes do build; tags versionadas — escrito; passos rodados localmente, falta a 1ª execução no GitHub (depende do push)
- [X] T032 Rodar E2E localmente verde

## Fase 4 — Isolamento (US6) e add-on (US7)

- [X] T040 Revisar queries fora de `scoped()` e corrigir as de domínio
- [X] T041 Teste-guarda de tenant com lista de exceções justificadas
- [X] T042 Add-on bot MDF-e no instalador (n8n + migração + import)

## Fase 5 — Documentação

- [X] T050 `INSTALL-IA.md`/README/getting-started atualizados; limpar arquivos antigos
- [X] T051 Plano de corte da Fibra Forte (chave do n8n, BACKUPS_VOLUME)
