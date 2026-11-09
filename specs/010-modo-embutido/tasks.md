# Tarefas — 010 Modo embutido

## Notas de verificação

- No E2E, o "ERP" falso precisa ser um servidor HTTP de verdade em loopback
  (`erp.localhost:39999`). Uma página interceptada com `page.route` o Chrome
  trata como "pública", e o bloqueio de rede local (Local Network Access)
  impede o quadro de abrir o localhost. Em produção isso não acontece: os
  dois sites são públicos.
- O cookie é conferido por `curl`. O login sai com
  `HttpOnly; Secure; SameSite=None; Partitioned`.
- O contato novo no canal oficial abre com a janela de 24h fechada, sem
  campo de resposta. É o comportamento correto, e o teste confere o
  cabeçalho.

- [X] T001 `src/lib/embed.ts`: parse de `EMBED_ALLOWED_ORIGINS` + cabeçalhos
- [X] T002 Middleware: `frame-ancestors`/`X-Frame-Options` em toda resposta; `?embed=` → cookie + cabeçalho
- [X] T003 Better Auth: cookies `SameSite=None; Secure; Partitioned` com origens configuradas
- [X] T004 Layout `(app)`: barra compacta no modo embutido (`EmbedNav`)
- [X] T005 Notificações/push escondidos dentro de iframe
- [X] T006 Env (`env.ts`, `.env.example`, compose, instalador, verify)
- [X] T007 Testes unitários do parse/cabeçalhos
- [X] T008 E2E: "ERP" falso embute, login no quadro, abas, link por telefone, origem recusada
- [X] T009 Gate + E2E verdes (15/15 local); docs em `docs/embed-sankhya.md`
- [X] T010 `?phone=&name=` na Caixa de entrada (botão "WhatsApp motorista")
- [ ] T011 Produção: `EMBED_ALLOWED_ORIGINS` na stack + iframe no gadget [CALL CENTER] (depende do dono)
