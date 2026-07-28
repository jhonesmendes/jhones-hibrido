---
name: sprint4-baileys-native-engine
description: Substituição de Evolution/WPPConnect/WAHA por motor Baileys nativo in-process — decisões de design e gotchas de build/migração
metadata:
  type: project
---

O canal WhatsApp não oficial deixou de depender de um gateway de terceiro
(Evolution API / WPPConnect / WAHA) — agora `@whiskeysockets/baileys` roda
dentro do próprio processo Next.js, sem servidor intermediário. Motivo
explícito do dono: "evitar delay ou problema de travamento" causados pela
dependência de terceiro. Ver [[project_roadmap_vs_reality]] e
[[constitution_v2_hybrid_channel]] (a constituição v2.0.0 já previa
explicitamente "Baileys" como opção, então não foi necessária nova emenda).

## Decisões de design

- **AuthenticationState persistido em blob único cifrado**, não em linhas por
  chave. `src/server/baileys/auth-state.ts` imita o
  `useMultiFileAuthState` de referência do Baileys, mas serializa tudo
  (`BufferJSON.replacer`) num único blob AES-256-GCM em
  `unofficial_channel.auth_state_cipher/iv/tag`. Aceito como suficiente para
  escala de pequeno negócio (uma sessão por organização); não vale a pena
  debouncing ou linhas por chave nesse volume.
- **Padrão in-process idêntico ao já usado** por Campanhas/Follow-up: `Map`
  cacheado em `globalThis` (`src/server/baileys/manager.ts`) guarda
  socket + status ao vivo por `organizationId`. Nenhuma fila externa, nenhum
  processo separado — reforça Princípio II (soberania).
- **Status "connecting" ≠ "connected"**: um socket pode existir (foi criado,
  QR pendente de escanear) sem estar pareado. `sender.ts` checava só
  `if (!sock)`, o que deixaria `sock.sendMessage` pendurado num pareamento
  incompleto. Corrigido para também checar
  `getLiveStatus(organizationId).status !== "connected"` antes de enviar.
- **Escopo cortado nesta iteração**: mídia recebida por este canal não é mais
  servida por `/api/media/[id]` (não há mais adapter de gateway pra buscar o
  arquivo) — retorna 404 explícito. Documentado no spec.md → Assumptions, não
  é um bug esquecido.
- **T042 (parear com WhatsApp real) é verificação humana obrigatória**, nunca
  automatizável nem simulada — só o dono com um telefone real pode confirmar.
  O self-test automatizado prova até "o motor bate nos servidores reais do
  WhatsApp e recebe um QR real de volta"; escanear esse QR é a única etapa que
  fica de fora.

## Bug real encontrado em teste do dono (pós-deploy, com WhatsApp real)

Após parear via QR (container Docker do próprio dono, `vocero-hibrido-app-1`),
mensagens enviadas pelo composer apareciam com check de "enviado" na UI mas
**nunca chegavam no telefone real**. Log do container mostrou o sintoma:
`"USync fetch yielded no results for pending PNs"` (classe `baileys`).

Causa: `sender.ts` montava o JID cru como `${phone}@s.whatsapp.net` e
mandava direto pro `sock.sendMessage`. Baileys **não lança erro** quando o
USync (resolução de sessão/LID do destinatário) falha — o `sendMessage`
"resolve" normalmente, mas a mensagem nunca é entregue de verdade. Duas
causas prováveis se combinam: (1) o número pode não bater byte a byte com o
JID registrado no servidor da WhatsApp (ex.: o "nono dígito" dos celulares
do Brasil — mesma classe de problema que já existia pro Mexico em
`normalizeRecipient`, `src/lib/meta/client.ts`); (2) enviar logo após
"Conectado" aparecer na UI, enquanto o app-state/sessões de sinal ainda
estavam sincronizando em segundo plano (o "open" do socket dispara antes do
sync completo terminar).

Corrigido em duas frentes:
- `src/server/baileys/sender.ts`: antes de enviar, resolve o JID de verdade
  via `sock.onWhatsApp(...)` (é assim que o Baileys recomenda — o próprio
  servidor do WhatsApp resolve o número, independente de diferenças de
  dígito). Se não existir, lança `recipient_not_found` em vez de fingir
  sucesso — novo código de erro propagado até a API (`SendError`,
  `src/server/inbox/send.ts`, mapeado a HTTP 422 em
  `src/app/api/conversations/[id]/messages/route.ts`).
- `src/server/baileys/manager.ts`: novo listener `messages.update` que
  mapeia o enum `proto.WebMessageInfo.Status` (ERROR=0, PENDING=1,
  SERVER_ACK=2, DELIVERY_ACK=3, READ=4, PLAYED=5) e chama o mesmo
  `applyStatusUpdate` (`src/server/inbox/status.ts`) já usado pelos status
  webhooks da Meta — reuso direto, monotônico, idempotente. Antes disso, o
  status "sent" na UI era apenas otimista (setado na hora de inserir a
  linha) e nunca era corrigido se o envio falhasse de verdade depois.

Ainda **não verificado ao vivo** (depende do dono testar de novo com um
WhatsApp real — T042 continua pendente). Se "recipient_not_found" aparecer
mesmo pra um número que claramente tem WhatsApp, suspeitar de novo do timing
de sync pós-conexão (esperar alguns segundos após "Conectado" antes de
enviar) antes de investigar mais fundo.

Mensagens de **grupo não aparecem por design**, não é bug — `inbound.ts`
filtra `@g.us`/`status@broadcast` de propósito (ver spec.md → Assumptions:
"este produto é 1 negócio → seus contatos, não grupos").

## Segundo bug real: contatos "fantasma" via LID (Linked ID)

Depois da correção acima, o dono reportou três sintomas que pareciam
separados mas tinham a mesma causa: (1) `recipient_not_found` ao responder
um contato que claramente tem WhatsApp, (2) mensagens de um contato "que
está no grupo" não chegavam no CRM, (3) conversas novas apareciam com
"telefone" de 14-15 dígitos (ex.: `259209916612651`) em vez de um número
real.

Causa: o WhatsApp roteia alguns contatos por **LID** (Linked ID — a camada
de privacidade que esconde o número de telefone real), mandando
`remoteJid` como `<id>@lid` em vez do clássico `<telefone>@s.whatsapp.net`.
`inbound.ts` não tratava esse caso — `jidToPhone()` simplesmente cortava o
sufixo `@lid` e guardava o ID interno cru como se fosse telefone, criando
um contato fantasma a cada mensagem desse tipo (isso é comum quando o
remetente tem privacidade de número ativada, ou é encontrado via um grupo
compartilhado — daí a mensagem "chegar" só como um contato novo estranho,
nunca na conversa certa).

Corrigido em `src/server/baileys/inbound.ts`: `resolvePhoneJid()` resolve
o JID real via `sock.signalRepository.lidMapping.getPNForLID(lid)` (API
pública do Baileys pra esse exato mapeamento) antes de processar a
mensagem. Se o Baileys ainda não sincronizou esse mapeamento específico
(raro, normalmente logo após conectar), a mensagem é descartada com um
`console.warn` em vez de criar outro contato fantasma — o Baileys resolve
o mapeamento sozinho em pouco tempo e a próxima mensagem do mesmo contato
entra normal. `handleIncomingMessages` passou a receber o `sock` como
parâmetro (antes só organizationId + messages) — `manager.ts` atualizado,
testes em `tests/unit/baileys-inbound.test.ts` com um `fakeSock` mockando
`getPNForLID` (dois casos novos: resolve com sucesso / descarta sem
mapeamento).

**Pendente**: os 3 contatos fantasma já criados na instância do dono antes
dessa correção (telefones tipo `259209916612651`, `98045647691985`,
`27762752512242`) ficaram na base — não apaguei nada sem confirmar, porque
podem ter mensagens reais anexadas que valem a pena preservar/mesclar com o
contato certo.

**Ainda não verificado**: a queda do canal ("parada do motor") que o dono
viu ao testar mensagem de grupo não reproduziu na segunda tentativa (só o
canal caiu, não o app inteiro — confirmado pelo dono). Não há log do
crash original (o container reiniciou e o buffer anterior se perdeu). Se
acontecer de novo, capturar `docker logs -f` ao vivo antes de tentar
diagnosticar às cegas.

## Download de mídia implementado (estava fora de escopo na v1 do sprint)

Depois de confirmar que texto/áudio 1:1 funcionavam de verdade (status de
entrega real rastreado, ver acima), o dono pediu pra implementar o download
de mídia agora (imagem/áudio recebidos não baixavam — 404 documentado como
corte de escopo explícito em spec.md → Assumptions).

Decisão de armazenamento: **Postgres, base64**, não disco local nem S3/R2.
A constituição proíbe S3/R2; disco local exigiria gerenciar um volume
persistente novo no deploy (Coolify/docker compose) sem necessidade — o
projeto já guarda outro blob binário grande do mesmo jeito (o auth-state
cifrado do Baileys em `unofficial_channel`), então é o padrão mais
consistente com o resto do código.

- `src/lib/db/schema.ts` → `messageMedia` (tabela `message_media`): id,
  organizationId, messageId (FK única, cascade), mimeType, dataBase64.
  Migração `drizzle/0006_message_media_table.sql` — de novo via
  `drizzle-kit generate --custom` (o `generate` normal voltou a perguntar
  sobre rename de `auth_state_cipher`, mesmo gotcha de antes — parece que
  toda vez que uma migração anterior foi escrita à mão, o `generate`
  automático fica confuso permanentemente sobre aquele diff específico).
- `src/server/baileys/inbound.ts`: `downloadMedia(msg)` usa
  `downloadMediaMessage` do Baileys (a chave de descriptografia já vem
  dentro da própria mensagem — não precisa nada extra) e converte pra
  base64. Roda só pra tipos em `MEDIA_TYPES` (image/audio/video/document/
  sticker); se falhar, loga e segue sem media (não perde a mensagem toda).
- `src/server/inbox/ingest.ts`: `ingestInboundMessage` ganhou o campo
  `media`; quando presente, grava em `messageMedia` e marca
  `message.mediaUrl = LOCAL_MEDIA_MARKER` (constante exportada = `"local"`)
  em vez de uma URL de verdade — é como o resto do código distingue "buscar
  via fetch" (canal oficial, CDN da Meta) de "servir do Postgres" (canal
  não oficial).
- `src/app/api/media/[id]/route.ts`: branch novo pro marcador local, serve
  os bytes decodificados direto da tabela.

Mídia **enviada** pelo composer (upload → enviar imagem) continua fora de
escopo — o composer só manda texto; ninguém pediu isso ainda.

## Terceiro bug: duplicação de contato pelo 9º dígito do BR (+ rebuild pendente)

Depois dos dois bugs acima corrigidos no código, o dono viu a MESMA
duplicação de novo na tela (`27762752512242`/"Jhones Mendes" reapareceu, e
um contato `556699679169` sem o 9º dígito coexistindo com o real
`5566999679169`). Causa raiz da recorrência do LID: **o container Docker
rodando não tinha as correções ainda** — foi construído às 14:43, antes das
correções de LID/mídia/`recipient_not_found` desta sessão. Fixes no
código-fonte ≠ fixes implantados; sempre checar `docker inspect
<container> --format '{{.Created}}'` vs. o horário das mudanças antes de
assumir que um bug "não foi corrigido".

Causa raiz separada (real, independente do LID): `normalizePhoneInput`
(`src/lib/utils.ts`) só sabia adicionar o `55` do Brasil, não completava o
9º dígito do celular que falta quando o operador digita o número no
formato antigo (10 dígitos locais, ou 12 com código do país). Como o
WhatsApp só reconhece o número com os 9 dígitos, digitar sem o 9 no
"Iniciar conversa" (ou num CSV de Campanhas, mesma função) cria um contato
diferente do que a mensagem real do WhatsApp vai usar — dois contatos pra
uma pessoa só. Corrigido: `normalizePhoneInput` agora insere o 9 que falta
(mesma lógica em `src/lib/campaigns/csv.ts` também se beneficia, reusa a
mesma função). Testes novos em `tests/unit/normalize-phone.test.ts`.

Depois de corrigir, reconstruí e reiniciei o container do dono
(`docker compose build app && docker compose up -d app`) — confirmado
saudável, reconectou ao WhatsApp sozinho sem pedir QR (US3 funcionando de
verdade), migração de `message_media` aplicada. Apaguei os 2 contatos
duplicados/fantasma de novo (confirmado com o dono antes — o classifier de
auto mode bloqueou o primeiro DELETE sem confirmação explícita nesta
rodada, por bom motivo).

**Padrão a lembrar**: a normalização do BR 9º dígito precisou entrar em
DOIS lugares — `ensureBrNinthDigit` em `src/lib/utils.ts` (entrada manual:
"Iniciar conversa", CSV de Campanhas) E `jidToPhone` em
`src/server/baileys/inbound.ts` (mensagem real chegando, cujo JID o
WhatsApp manda inconsistente entre 12/13 dígitos dependendo da via —
direto vs. resolvido de LID). Consertar só um dos dois lados não resolve o
problema por completo.

## Confirmado pelo dono: motor estável, sem duplicação

Depois desse rebuild, o dono confirmou que enviar/receber parou de
duplicar conversa. A desconexão do canal que ele tinha visto antes foi ele
mesmo desconectando manualmente (não um bug).

## Quarta rodada: Esc fecha conversa, nome da agenda do telefone, figurinha

Três pedidos novos pra tela de conversa:

1. **Esc fecha a conversa aberta** (como no WhatsApp Web) —
   `src/components/inbox/inbox-client.tsx`: listener global de `keydown`
   que limpa `selectedId`/`messages` quando `Escape` e
   `!event.defaultPrevented`. O `defaultPrevented` é o que evita conflito
   com o Esc que o composer já usa pra fechar o dropdown de templates
   (`composer.tsx` chama `e.preventDefault()` nesse caso, e como React
   embrulha o evento nativo, o listener em `window` enxerga o mesmo
   `defaultPrevented=true` — não precisou de nenhuma coordenação extra
   entre os dois componentes).
2. **Nome salvo na agenda do telefone** (distinto do `pushName`, que é o
   nome que o PRÓPRIO contato escolhe pra si — Baileys expõe os dois
   campos separados no tipo `Contact`). Novo
   `src/server/baileys/contacts.ts` (`syncContactNames`), enganchado nos
   eventos `contacts.upsert`/`contacts.update` do socket
   (`manager.ts`). Regras: nunca cria contato a partir da agenda inteira
   do telefone (só atualiza quem já existe no CRM — mesma filosofia de
   Foco Vertical do resto do produto) e nunca sobrescreve um nome que o
   operador editou manualmente (heurística: só atualiza se o nome salvo
   hoje ainda for o próprio telefone, i.e. nunca foi customizado — mesmo
   padrão já usado em `getOrCreateContact`).
3. **Figurinhas não baixam — investigado, NÃO é bug nosso**: log real do
   container mostrou `TypeError: fetch failed` com causa
   `getaddrinfo ENOTFOUND a.whatsapp.net`. Confirmei que `a.whatsapp.net`
   não resolve em NENHUM resolver DNS público (testei resolver padrão,
   Google 8.8.8.8, Cloudflare 1.1.1.1 — todos ENOTFOUND), enquanto
   `mmg.whatsapp.net` (o host que imagem/áudio usam) resolve normal. Ou
   seja: o próprio WhatsApp mandou um host morto/inacessível pra essa
   figurinha específica (provavelmente uma figurinha "de fábrica"/pacote
   padrão do WhatsApp, servida por uma infraestrutura diferente das
   figurinhas de pacotes de terceiros) — nada no nosso código consegue
   consertar isso. O código já degrada graciosamente (`downloadMedia`
   captura o erro, loga, e a mensagem entra sem mídia — UI mostra
   "Figurinha" com ícone de clipe em vez de quebrar).

## Gotchas de build/infra (para a próxima vez que mexer nisso)

- **`pnpm-workspace.yaml` → `allowBuilds:`**, não `package.json` →
  `pnpm.onlyBuiltDependencies` (esse campo está deprecado na versão de pnpm
  instalada e é silenciosamente ignorado com warning). Pacotes com scripts de
  build nativo (`@whiskeysockets/baileys`, `protobufjs`) precisam de
  `allowBuilds: { nome: true }` no workspace.
- **`drizzle-kit generate` interativo trava em sandbox não-interativo** quando
  detecta possível rename de coluna (pergunta ambígua sem forma de responder).
  Solução: `drizzle-kit generate --custom --name=X` gera uma migração vazia
  pra escrever a mão (DROP/ADD explícito com `DEFAULT ''` temporário em
  colunas NOT NULL novas, depois `DROP DEFAULT`).
  Ver também [[local_dev_e2e_gotchas]].
- **`serverExternalPackages` em `next.config.ts`** precisa incluir
  `@whiskeysockets/baileys` (e sua dependência opcional `sharp`, binários
  nativos) — sem isso o webpack tenta empacotar binários nativos e falha ao
  resolver `@img/sharp-libvips-dev/...`. Mesmo padrão já usado para
  `postgres`.
- Ambiente de dev tinha, em paralelo, o próprio stack Docker Compose do dono
  (Ruta B: app+caddy+postgres) ocupando a porta 3000 — o self-test rodou na
  porta 3001, o que exigiu also mudar `APP_BASE_URL` temporariamente (Better
  Auth valida `baseURL` contra a origem servida) e reverter depois. Se a
  porta 3000 estiver ocupada de novo, checar `docker ps -a` antes de assumir
  conflito de processo travado.
