---
name: pt-br-translation-sweep
description: Varredura via workflow multi-agente que traduziu comentários do código-fonte, specs/ e CLAUDE.md/constituição de espanhol/PT-PT para pt-BR — e o regression bug real que apareceu depois
metadata:
  type: project
---

Rodada em 2026-07-27/28 a pedido explícito do dono ("vamos mudar para
português do brasil"), via `Workflow` (opt-in explícito: o dono pediu
"rodar em paralelo"). 12 agentes em paralelo — 8 grupos de ~10 arquivos em
`src/`, 3 grupos em `specs/**/*.md`, 1 para `CLAUDE.md` +
`.specify/memory/constitution.md`.

## Regras que funcionaram bem

Instrução central dada a cada agente: traduzir SOMENTE comentários/JSDoc e
strings voltadas a humanos (mensagens de erro, labels); NUNCA tocar
identificadores, valores de enum/status usados como contrato de código
(`"official"`, `"pending"`, chaves de schema Zod persistidas no banco tipo
`veredicto`/`hallazgos`/`verde`/`amarillo`/`rojo`), nomes de eventos SSE,
variáveis de ambiente, caminhos de arquivo, colunas de banco, classes CSS.
Os agentes seguiram isso bem — verificaram contra o código real (grep) antes
de decidir se uma string era "contrato" ou "texto humano" quando havia
ambiguidade (ex.: `src/server/dev/ai-mock.ts` preservou `rojo`/`verde` por
serem comparados literalmente em `judge.ts`/`schema.ts`).

Descoberta útil: boa parte de `specs/003` a `specs/006` (as features
implementadas NESTA sessão) já estava em pt-BR — só `specs/001-vocero-core`
(pré-existente, anterior à instrução de comunicação em pt-BR) e
`CLAUDE.md`/`constitution.md` estavam integralmente em espanhol.

## Bug real causado pela tradução (não é falso-positivo de flakiness)

Depois da tradução, `tests/unit/tenant.test.ts` falhou:
`scoped()` agora lança `"...query sem tenant"` (pt-BR, traduzido de
`"...sin tenant"`), mas o teste ainda tinha `toThrow(/sin tenant/)` — o
próprio arquivo de teste não estava no escopo da varredura (só
`src/**`, não `tests/**`). **Lição**: ao traduzir mensagens de erro que
testes verificam por regex/string exata, sempre checar `tests/unit/` por
assertions que dependem do texto exato traduzido. Corrigido manualmente
(traduzido `tenant.test.ts` inteiro, não só o regex).

## Achado à parte (ambiental, não causado pela tradução)

`tests/unit/send-sandbox.test.ts` e `lab-sandbox.test.ts` começaram a dar
timeout consistente (não intermitente) em 5000ms — mas passavam limpo com
timeout maior (4.5s–7.6s). Causa: esses testes fazem `await import(...)`
dinâmico de `src/server/inbox/send.ts`, que desde o Sprint 4 puxa a árvore
pesada do Baileys (`@whiskeysockets/baileys` + libsignal + protobufjs +
sharp) — só o import já pode passar de 5s numa máquina sob carga (nessa
sessão especificamente: 12 containers Supabase + outro app rodando ao
mesmo tempo). Corrigido subindo `testTimeout: 15000` em
`vitest.config.ts` (fix estrutural, não é flake — a árvore de dependência
pesada é permanente enquanto o motor Baileys nativo existir).

## Workflow: retry parcial funcionou bem

3 dos 12 agentes falharam na primeira rodada por limite de sessão do
Claude Code (não erro do script). `Workflow({scriptPath, resumeFromRunId})`
reexecutou só os 3 que faltavam — os 9 já concluídos vieram do cache
instantaneamente. Ver descrição da ferramenta Workflow: esse é o
comportamento esperado/documentado, vale lembrar da próxima vez que um
workflow parcialmente falhar por limite de uso (não é preciso relançar
tudo do zero).
