# Feature Specification: Redesign "Atlas" + White-label (002-diseno-atlas-white-label)

**Feature Branch**: `002-diseno-atlas-white-label`

**Created**: 2026-07-10

**Status**: Draft

**Input**: Adotar o sistema de design do handoff "Atlas — Caixa de entrada unificada"
(protótipo hi-fi gerado com Claude Design; referência local, não commitada) em
todo o app, e tornar o CRM white-label: nome e cor de acento configuráveis
a partir de Configurações.

## Contexto

- Referência de design: handoff hi-fi com tokens exatos (modo claro, estética
  Linear/Notion, neutros frios, um único acento azul aço apagado `#3f5972`,
  tipografia Geist, raios 7/10/14, sombras suaves). É RECRIADO com o stack do
  repositório (Tailwind + variáveis CSS); o código do protótipo não é copiado.
- Vocero é genérico: cada instância é operada por um negócio diferente → a marca
  visível (nome + acento) deve ser dele, não "Vocero".

## User Stories

### US1 — Sistema de design Atlas em todo o app (P1)

Como usuário do CRM, toda a interface (caixa de entrada, pipeline, contatos, agente,
laboratório, configurações, login) usa o tema claro sóbrio do handoff: mesmos
tokens de cor/tipografia/raios/sombras, nav lateral estilo Atlas (brand
em cima, itens com tinta de acento no ativo, usuário embaixo) e componentes
consistentes (pílulas, badges, cartões, inputs com halo de acento no focus).

**Aceitação**:
1. Tokens globais portados para variáveis CSS + Tailwind (valores EXATOS da
   seção Design Tokens do handoff; o acento via variáveis para poder
   mudá-lo em runtime).
2. Nav esquerda 224px conforme o handoff: brand (quadro 30px com inicial + nome
   do CRM + subtítulo), itens com badge de não lidos na Caixa de entrada, Ajustes e
   usuário no rodapé.
3. Tipografia Geist (self-hosted via next/font — sem CDN em runtime,
   Constituição II) com fallbacks do handoff.
4. Login/registro e todas as páginas retematizadas (adeus tema escuro).

### US2 — Caixa de entrada redesenhada (P1)

Como operador, a caixa de entrada replica a tela do handoff: lista de 360px
(busca com ⌘K visual, filtros pílula Todas/Não lidas, linhas com presença,
preview com "Você:", badge de não lidos, tag do negócio/etapa), conversa com fundo
`#f4f5f7`, separador de dia, balões (recebido branco / enviado `#f2f5f8` com
duplo check de acento), composer com chips de modelos aprovados e botão
enviar de acento, e **painel de detalhes colapsável** (contato + etapa com
stepper do pipeline + notas + toggle IA + handoff).

**Aceitação**:
1. Layout de 4 colunas: nav 224 · lista 360 · conversa flex-1 · painel 320 colapsável
   (transição 0.22s, botão para reabrir no cabeçalho do chat).
2. Balões agrupados por remetente consecutivo; hora dentro do balão; duplo
   check com cor de acento conforme o estado (lido).
3. Stepper vertical de etapas do pipeline no painel (feito/atual/pendente
   conforme a etapa do lead), substitui o badge estático.
4. Filtros: "Todas" e "Não lidas" com contagens (o Vocero não tem atribuição de
   agentes na v1 — "Sem atribuição/Minhas" é omitido).
5. Busca por nome/telefone/preview.
6. Toda a funcionalidade existente é mantida (SSE, janela de 24h, modelos,
   IA, marcar como lido).

### US3 — White-label a partir de Configurações (P1)

Como negócio/agência, em Configurações → Marca eu defino o **nome do CRM** e
a **cor de acento**, e toda a UI os reflete instantaneamente (brand da nav,
título do documento, acentos, botões, badges).

**Aceitação**:
1. Nova aba Configurações → Marca: input de nome (padrão "Vocero") e
   seletor de acento com as 4 opções sóbrias do handoff (Azul aço,
   Grafite, Verde apagado, Ameixa) + opção de cor personalizada (color
   picker) da qual se derivam hover/soft/tint/text automaticamente.
2. Persistência por organização no BD (`organization.metadata` ou tabela
   própria); GET público na sessão; aplicado como variáveis CSS no layout
   (SSR, sem flash).
3. O nome aparece em: brand da nav, `<title>`, página de login (que é
   pública: usa o nome da única org da instância).
4. Sem configuração → padrões (nome "Vocero", acento azul aço `#3f5972`).

## Edge cases

- Acento personalizado com contraste insuficiente sobre branco → derivar
  `--accent-text` escurecido e validar que o texto branco sobre o acento
  cumpra contraste razoável (se muito claro, escurecer o acento base).
- Nome vazio → volta ao padrão. Comprimento máx 30.
- Painel colapsado persiste em localStorage.
- `prefers-reduced-motion` → transições ~0ms.

## Success Criteria

- **SC-1**: Comparação visual com o handoff: a caixa de entrada replica layout,
  tokens e estados (revisão com capturas, julgamento humano final).
- **SC-2**: Mudar nome+acento em Configurações se reflete em toda a UI sem
  recarregar manualmente e persiste após recarregar.
- **SC-3**: Os E2E funcionais de 001 seguem verdes (sem regressão de
  comportamento).
- **SC-4**: Sem novas dependências de runtime (fonte self-hosted; Constituição II).

## Out of Scope

Modo escuro, atribuição de conversas a agentes ("Sem atribuição/Minhas"),
negócios/deals com valor monetário (o painel mostra contato+lead reais do
Vocero), logo por imagem (v1: inicial sobre acento), densidade configurável.
