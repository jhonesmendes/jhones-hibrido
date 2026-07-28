# Plan: 002-diseno-atlas-white-label

**Spec**: [spec.md](spec.md) · **Branch**: `002-diseno-atlas-white-label`

## Decisões técnicas

- **Tokens**: variáveis CSS em `globals.css` (`:root`) com os valores exatos
  do handoff; o Tailwind mapeia para as variáveis (a paleta atual é reescrita —
  o tema escuro desaparece). O acento SEMPRE via `--accent*` para poder
  sobrescrevê-lo em runtime (white-label).
- **Acento**: presets do handoff (`ACCENTS`: steel `#3f5972`, graphite
  `#4b5563`, teal `#3f6b66`, plum `#5f5470`, cada um com
  hover/soft/tint/text). Cor personalizada → derivação em
  `src/lib/branding.ts` (hover = escurecer 12%, soft/tint = misturas com branco,
  text = escurecer 25%; se a luminância da base for muito alta, escurecer a
  base para contraste com texto branco).
- **Persistência white-label**: `organization.metadata` (JSON, coluna já
  existente do Better Auth) → `{ brandName, accent }`. API
  `GET/PUT /api/settings/branding` (PUT somente para owner). O GET também responde sem
  sessão com a marca da única org (para o login) — expõe apenas nome+cor.
- **Aplicação SSR sem flash**: o root layout (server) lê a marca e renderiza
  `<style>:root{--accent:…}</style>` + `<title>`; as mudanças em Configurações
  atualizam com `router.refresh()`.
- **Fonte**: Geist self-hosted via `next/font/google` com `display: swap`
  (o next/font baixa no BUILD e serve local — sem CDN em runtime ✓).
- **Estrutura**: todos os componentes/páginas e sua lógica são mantidos; a
  mudança é de apresentação (classes/estrutura visual) + painel colapsável +
  stepper + filtros/busca client-side já existentes ou triviais.
- **Ícones**: mantém-se lucide-react (stroke fino 1.7 via prop).

## Constitution check

Sem novas dependências de runtime (fonte no build) ✓ · metadata por org ✓ ·
sem mudanças de webhook/idempotência ✓ · verificação ao vivo com Playwright ✓.

## Tarefas

- [X] T201 Tokens Atlas: `globals.css` (variáveis exatas) + `tailwind.config.ts`
      remapeado + fonte Geist via next/font em `src/app/layout.tsx`
- [X] T202 `src/lib/branding.ts`: presets ACCENTS, derivação de acento
      personalizado (+contraste), tipos; unit test de derivação/contraste
- [X] T203 API `GET/PUT /api/settings/branding` (metadata da org; GET sem
      sessão → marca da única org; PUT somente para owner, Zod name≤30/hex)
- [X] T204 Root layout SSR: injetar variáveis de acento + título com o nome;
      login usa o nome da marca
- [X] T205 Nav Atlas: reescrever `(app)/layout.tsx` + `nav-link` (brand com
      inicial sobre acento, badge de não lidos na Caixa de entrada, Ajustes+usuário embaixo)
- [X] T206 Caixa de entrada: lista (buscador, filtros Todas/Não lidas, linhas do
      handoff com presença/preview/badge/tag de etapa)
- [X] T207 Conversa + composer: fundo do chat, separador de dia, balões agrupados com
      hora interna e duplo check, chips de modelos aprovados, botão enviar de acento
- [X] T208 Painel de detalhes colapsável: contato, stepper de etapas do
      pipeline (move o lead ao clicar em uma etapa), notas, IA/handoff;
      persistência em localStorage; botão para reabrir
- [X] T209 Retematizar páginas restantes (pipeline, contatos, agente, laboratório,
      configurações, auth) com os componentes/tokens novos
- [X] T210 Configurações → Marca: UI (nome + presets + color picker custom,
      pré-visualização), salvar + refresh
- [X] T211 Gate (typecheck/lint/build/test) + E2E: roteiro
      `tests/e2e/us-diseno.md` — regressão funcional da caixa de entrada (SSE, enviar,
      janela fechada), colapsar/reabrir painel, stepper move etapa,
      white-label muda nome+acento e persiste; novas capturas para o README
- [X] T212 Commit + merge na main após verificação (o OK do fluxo 001 é assumido
      SOMENTE se o dono der o aval — perguntar antes do merge)
