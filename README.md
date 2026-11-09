# Vocero CRM

**CRM de WhatsApp com agente de IA e Laboratório de autoavaliação.**
Software proprietário — ver [LICENSE](LICENSE). Documentação técnica interna
(não é material de divulgação pública).

Vocero é um CRM self-hosted para negócios que vendem/atendem por WhatsApp:
caixa de entrada em tempo real, pipeline de vendas, fila de distribuição de
conversas por departamento, campanhas de disparo em massa (canal oficial e
não oficial), automações via N8N, um agente de IA com o conhecimento do
negócio e um **Laboratório** onde clientes simulados avaliam o agente antes
de ele falar com clientes reais. Uma instância = um negócio, no servidor do
operador, com os dados do operador.

O modelo de negócio é o proprietário atuando como **Provedor de Tecnologia**:
implanta e mantém instâncias para clientes contratantes, cada uma isolada
(banco, credenciais, domínio próprios).

## Stack

Next.js 15 (App Router) + React 19 · TypeScript estrito (`strict` +
`noUncheckedIndexedAccess`) · Tailwind CSS · PostgreSQL + Drizzle ORM
(migrações versionadas em `drizzle/`, aplicadas automaticamente ao iniciar o
container) · Better Auth + plugin organization · Zod em toda entrada externa
· nanoid com prefixos por entidade · pnpm · Vitest (unit) + roteiros E2E em
`tests/e2e/*.md` · Docker multi-stage (standalone, healthcheck `/api/health`)
· deploy via Portainer (stack a partir do repositório Git) ou docker compose
+ Caddy.

Tempo real via SSE (`/api/events`, sem WebSockets nem filas externas) — todo
trabalho em segundo plano (agente, Laboratório, campanhas) roda in-process.

Guia completo de arquitetura, fronteiras de modificação e regras não
negociáveis: [`CLAUDE.md`](CLAUDE.md) e [`.specify/memory/constitution.md`](.specify/memory/constitution.md).
Decisões de design por feature (spec → plan → tasks): [`specs/`](specs/).

## Funcionalidades

### 🧪 Laboratório: o agente se prova sozinho

Clientes simulados conversam contra o agente real num sandbox interno que
**jamais** envia mensagens reais (assertiva rígida — o sender lança exceção
para qualquer conversa `is_test`, não é validação best-effort). Um juiz LLM
independente devolve score 0–100, achados com evidência, sugestões
aplicáveis com um clique ao knowledge base, e histórico com delta entre
execuções.

### 💬 Caixa de entrada e roteamento

- Três colunas (conversas / conversa / contato), mensagens em tempo real via
  SSE, estados enviado/entregue/lido com motivo real de falha exibível
  (clique no ícone de erro — código numérico + detalhe da Meta, não só
  "Something went wrong").
- Janela de 24h da Cloud API respeitada; fora dela, só modelo aprovado reabre
  a conversa.
- **Fila de distribuição por departamento**: Modo A (distribuição automática)
  e Modo B (o cliente escolhe o setor). Timeout de aceite configurável por
  departamento; se ninguém aceitar a tempo, a conversa cai visível para
  qualquer membro do departamento ("quem pegar, fica com a conversa").
  Aceitar/reivindicar uma conversa da fila publica evento em tempo real
  imediatamente (sem esperar segunda confirmação).
- **Grupos de WhatsApp**: visíveis a qualquer membro do departamento do canal
  (não exigem `assignedTo` nem a permissão `conversations:view_all`, já que
  estruturalmente um grupo nunca é atribuído a uma pessoa só).
- **Responder mensagem (citação)** nos dois canais — oficial (Graph
  `context.message_id`) e não oficial (Baileys `contextInfo.stanzaId`).
- **Assinatura do remetente** nas bolhas enviadas: nome do agente humano
  (emerald) ou do agente de IA (azul) acima da mensagem — visão interna só,
  nunca vai ao conteúdo enviado ao WhatsApp; mensagens antigas sem
  `sentByMemberId` não mostram nada.
- Seletor de emoji self-hosted (grade curada, sem dependência externa),
  colar imagem da área de transferência direto no composer.
- **Corretor ortográfico PT-BR local**: dicionário Hunspell (`dictionary-pt`,
  variante brasileira confirmada) rodando 100% num Web Worker — nunca toca a
  rede, nunca bloqueia a thread principal.
- **Diagnóstico técnico** por conversa: painel com o rastro completo
  (`trace_event`) de recebimento, roteamento (fila vs. inbox direto),
  aceite/recusa na fila, canal/número de envio de cada saída e conversas
  iniciadas pelo agente — pensado para responder "onde travou" sem abrir o
  banco.

### 📊 Contatos e pipeline kanban

Cada contato que escreve entra sozinho no pipeline (etapas editáveis:
Novo → Em conversa → Interessado → Cliente → Perdido). Agente sem
`conversations:view_all` só vê leads ligados a conversas atribuídas a ele —
tanto no board quanto no endpoint de mover lead entre etapas.

### 🤖 Agente de IA com o conhecimento do negócio

Nome, tom, instruções e regras de escalado configuráveis; knowledge base em
pares pergunta/resposta e blocos livres. Responde só com o que sabe, agrupa
rajadas de mensagens numa resposta, escala para humano por pedido do
cliente, decisão própria ou falha detectada. Provedor LLM via adaptador
compatível com OpenRouter (config por env var, com override por organização
em `src/server/ai/config.ts`).

### 📄 Modelos de mensagem (templates)

- Criar, editar (categoria/corpo — nome e idioma são fixos na Meta), excluir
  e sincronizar, com suporte a **múltiplas variáveis** (`{{1}}`, `{{2}}`...
  sequenciais) — cada uma com seu `example.body_text` gerado automaticamente
  (a Meta recusa "Invalid parameter" sem isso).
- **Amarrado à WABA certa**: um modelo é registrado numa WABA específica na
  Meta; a instância pode ter mais de um número conectado em WABAs
  diferentes, e criar/editar/excluir/sincronizar/enviar (inbox e campanhas)
  sempre usa a WABA em que o modelo de fato vive — não "o número padrão da
  organização".
- **Departamento por modelo** (opcional, metadado local): reatribuível a
  qualquer momento sem tocar a Meta. Agente sem `view_all` só vê, no
  seletor de envio, modelos sem departamento + os do departamento dele.
- **Sincronizar importa** modelos que existem na Meta mas não localmente
  (essencial depois de um banco limpo, ou quando o modelo foi criado direto
  no Gerenciador do WhatsApp).
- Edição/exclusão exigem owner/admin.

### 📣 Campanhas (disparo em massa)

Canal oficial (modelo aprovado) e não oficial (WhatsApp Web/Baileys, com
aviso de risco de ban obrigatório na UI e intervalo entre envios sempre
configurável, nunca fixo no código). Destinatários por CSV ou filtro do CRM.
Envio via WABA/número corretos por template (mesma correção acima), nunca
"sticky" no canal de uma conversa já existente de outro tipo.

### 📞 Canais WhatsApp

- **Oficial** (Cloud API/Graph): cliente único (`src/lib/meta/`), N números
  por organização, cada um podendo pertencer a um departamento.
- **Não oficial** (motor Baileys nativo, conexão direta ao protocolo — sem
  gateway de terceiro): coexiste com o oficial por organização.
- Diagnóstico de reconexão: `isAuthError` só classifica como token
  vencido/revogado quando a Meta responde HTTP 401 ou `code 190` — o
  `type: "OAuthException"` sozinho é usado pela Meta como categoria genérica
  (inclui erros de payload, não só de token) e não decide mais isso sozinho.
  Toda vez que um número é marcado "reconectar", fica logado o `status`/
  `code`/`type`/`message` reais da Meta para diagnóstico.

### 🔌 Automações N8N

Aba Automações dentro de Campanhas: lista workflows do N8N do próprio
operador/agência (auto-hospedado), executa com um clique, mostra histórico
de execuções. URL + API key por organização, cifradas (`src/server/n8n/`).
Sem configurar, degrada para uma tela de setup — nunca trava o resto do
produto.

### 🎨 Aparência personalizável

- **Branding da organização**: cor de destaque white-label, injetada via CSS
  vars no `<head>` (server-side).
- **Aparência pessoal por membro**: cor de destaque e intensidade, fundo do
  chat (predefinidos + cor customizada), persistidos no servidor por sessão
  (não localStorage) — resolvidos com a mesma matemática de contraste HSL do
  branding da org, com pré-visualização instantânea.
- **Tema** (claro/escuro/sistema) e **wallpaper**, com padrão anti-flash
  (script inline no `<head>` aplicado antes da hidratação).
- **Barra lateral recolhível**, com o mesmo padrão anti-flash.

### 🔐 Segurança, multi-tenancy e observabilidade

- `organization_id` obrigatório em toda tabela de domínio; toda query passa
  por `scoped()`.
- Segredos cifrados em repouso (AES-256-GCM) — token da Meta, credenciais
  N8N/SMTP; nunca em log ou resposta ao cliente (token só mostra os últimos
  4 dígitos).
- Webhooks com dedup por `wa_message_id` UNIQUE; estados monotônicos (nunca
  regride, ex.: `read` tardio não sobrescreve com `delivered`).
- Telas de configuração restritas por papel: agente não vê Canais,
  Inteligência IA, Modelos, Servidor SMTP nem Laboratório — nem na UI nem
  nas rotas de API correspondentes.
- Log de auditoria (`Auditoria`) para ações críticas da organização.
- **Sandbox do Laboratório**: conversas `is_test` nunca tocam a API real —
  guardrail, não validação best-effort.

### 📱 PWA

Instalável, com push notifications (VAPID) e layout ajustado para a janela
mais estreita do app instalado.

## Mapa do código

Ver a tabela completa em [`CLAUDE.md`](CLAUDE.md#mapa-do-código-fronteiras-de-modificação).
Resumo dos pontos mais tocados:

| Área | Caminho |
|---|---|
| Agente de IA (prompt, ações, config) | `src/server/ai/` |
| Laboratório (personas, juiz) | `src/server/lab/` |
| Canal oficial (Graph API) | `src/lib/meta/` + `src/server/whatsapp/` |
| Canal não oficial (Baileys) | `src/server/baileys/` |
| Fila e distribuição | `src/server/queue/manager.ts` |
| Campanhas | `src/server/campaigns/` + `src/lib/campaigns/` |
| Automações N8N | `src/server/n8n/` |
| Ingestão/envio de mensagens | `src/server/inbox/` |
| Modelos (templates) | `src/server/whatsapp/templates.ts` |
| Aparência/branding | `src/lib/branding.ts` + `src/server/branding.ts` |
| Schema/migrações | `src/lib/db/schema.ts` → `pnpm db:generate` → `drizzle/` |
| Mocks de ambiente de teste | `src/app/api/dev/` (atrás de `src/lib/dev-guard.ts`, 404 incondicional em produção) |

## Variáveis de ambiente

Ver `.env.example` (cada uma com guia inline). Essenciais: `APP_BASE_URL`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` (32 bytes base64),
`META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET` (opcional, assinatura),
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (push — no
`docker-compose.yml`, precisam estar listadas no bloco `environment:` do
serviço `app`, não só na UI de variáveis do Portainer, senão não chegam ao
container). IA:

```bash
OPENROUTER_API_TOKEN=sk-or-...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=anthropic/claude-haiku-4.5   # opcional: juiz mais barato
```

N8N e SMTP não são env var — são configuração cifrada por organização, pela
própria UI (Configurações → Email / Campanhas → Automações N8N).

## Definição de Pronto

`pnpm typecheck && pnpm lint && pnpm build && pnpm test` é o piso, não o teto
— toda feature exige self-test de comportamento de ponta a ponta antes de
"pronta". Detalhe completo: [`CLAUDE.md`](CLAUDE.md#definição-de-pronto-reforçada-obrigatória).

E2E executável (Playwright) — ver [`playwright.config.ts`](playwright.config.ts):
`pnpm test:e2e` contra uma instância no ar, com `E2E_BASE_URL` e
`E2E_OWNER_INVITE_CMD`; com mocks (`E2E_MOCKS=1`) cobre também caixa de
entrada e API interna. O CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
roda tudo isso, instala a imagem com o instalador e só então publica.

## Instalar e verificar uma instância

```bash
scripts/install/vocero-install.sh --name cliente --url https://crm.cliente.com.br \
  --owner-email dono@cliente.com.br --org "Nome do negócio" --port 3010
```

Gera os segredos (arquivo `instances/<nome>/vocero.env`, permissão 600 —
guarde uma cópia), sobe app + Postgres com volumes e rede próprios, cria o
**convite do proprietário** (link de uso único para o e-mail informado) e
imprime o relatório de verificação. Em produção, uma instância vazia **não**
aceita cadastro público: só o link do convite cria a conta dona.

- Portainer: `--mode portainer` só gera o arquivo de variáveis.
- Novo convite (link perdido/expirado): `node bootstrap-owner.mjs --email ...`
  no container `app` — invalida o anterior.
- Verificar qualquer instância: `scripts/install/vocero-verify.sh https://crm.cliente.com.br`.
- Bot MDF-e (n8n): `--addon-mdfe` ou `scripts/install/addon-mdfe.sh`.
- Versão fixa da imagem: `VOCERO_VERSION=1.1.0` (o CI publica `latest`,
  `sha-xxxxxxx` e as tags `v*`); a versão aparece em `/api/health`.

Roteiro para assistente de IA: [`INSTALL-IA.md`](INSTALL-IA.md).

## Deploy

Stack via Portainer ("Redeploy from git repository", **Pull and redeploy**
para buscar commits novos) ou docker compose. Migrações do Drizzle aplicam
automaticamente ao iniciar o container. Healthcheck em `/api/health`.

## Cumprimento das políticas da Meta

1. Opt-in: só escreve para quem iniciou a conversa ou aceitou receber
   mensagens; janela de 24h respeitada, texto livre bloqueado fora dela.
2. Modelos aprovados para reabrir conversas — sem contornar a aprovação da
   Meta.
3. Laboratório 100% interno — clientes simulados jamais tocam a API real
   (bloqueado por design e coberto por teste).
4. Campanhas (disparo em massa) existem como extensão explícita do produto,
   com aviso de risco no canal não oficial e intervalo entre envios sempre
   configurável.
5. Dados do cliente no servidor do cliente/operador; token cifrado em
   repouso; webhook validado por URL secreta e assinatura opcional.

## Roadmap

- Multimedia completa na caixa de entrada (hoje: indicador de tipo).
- RAG para knowledge bases grandes (hoje: injeta completo com aviso de
  tamanho).
- Personas configuráveis do Laboratório e comparativas entre execuções.
- Analytics de conversas e modelos.
- Painel super-admin com feature flags por cliente (multi-tenant de
  verdade) — planejado, ainda não iniciado.
