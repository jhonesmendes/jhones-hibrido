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
