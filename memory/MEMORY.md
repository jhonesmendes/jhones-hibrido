# Memory Index

- [Roadmap vs. actual codebase state](project_roadmap_vs_reality.md) — most of vocero_roadmap.md's Fases 2/3 already existed before it was pasted
- [Constitution v2.0.0 amendment](constitution_v2_hybrid_channel.md) — hybrid channel + mass Campaigns now permitted, MAJOR bump
- [Local dev + Playwright E2E gotchas](local_dev_e2e_gotchas.md) — pnpm/node_modules/HMR/SSE/Escape-key pitfalls hit during Sprint 1 self-test
- [Idioma de comunicação](user_comms_language.md) — usuário pediu chat sempre em pt-BR
- [Design de Campanhas (Sprint 2)](sprint2_campaigns_design.md) — reuso de sendTemplate/sendText, in-process, SSE campaign.run, escopo cortado
- [Design do Follow-up (Sprint 3)](sprint3_followup_design.md) — scheduler in-process, elegibilidade pura testável, gotcha de backdating de timestamps
- [Motor Baileys nativo (Sprint 4)](sprint4_baileys_native_engine.md) — substituiu Evolution/WPPConnect/WAHA por engine in-process; auth-state cifrado, allowBuilds, serverExternalPackages
- [Direção do projeto: produto multi-cliente](project_direction_multitenant_client_product.md) — vira produto sob encomenda, feature flags por cliente via painel super-admin é passo FUTURO, não agora
- [Deploy do dono: docker compose direto, sem CI](deploy_workflow_docker_compose.md) — `docker compose build app && up -d app` no próprio ambiente do dono; sempre verificar `docker inspect --format '{{.Created}}'` antes de assumir que um fix já está no ar
- [Varredura de tradução pt-BR](pt_br_translation_sweep.md) — workflow de 12 agentes traduziu src/+specs/+CLAUDE.md; regra "não tocar tests/" causou 1 bug real (tenant.test.ts); testTimeout subiu por causa do peso da árvore do Baileys
- [Controle de acesso e segurança (Sprint 007)](sprint007_access_control.md) — roles owner/admin/agent, permissões por membro, emenda de constituição p/ SMTP opcional (v2.1.0); MVP (US1+US2) verificado ao vivo via API sem navegador disponível
- [Drift de snapshot do drizzle-kit corrigido](drizzle_snapshot_drift_fixed.md) — migrações 0005/0007 escritas à mão sem regenerar snapshot; causava falsos prompts de rename em `generate`; reconstruído 2026-07-28
- [Timestamp-bomba nas migrações (0007 no futuro)](migration_timestamp_landmine.md) — `when` de 0007 aponta pro futuro, migrator do drizzle (CLI e scripts/migrate.mjs real) descarta silenciosamente qualquer migração gerada depois; corrigido 0008/0009, landmine ainda ativa pra próxima migração até o relógio real passar de 2026-07-29T16:00 UTC
- [Viabilidade de 2+2 canais por org](multi_channel_2plus2_feasibility.md) — confirmado possível (2 oficiais + 2 WhatsApp Web), mas é feature própria (constraints UNIQUE no banco, conversation.channel é tipo não instância, Baileys é sessão viva); dono decidiu só documentar por ora (2026-07-29)
