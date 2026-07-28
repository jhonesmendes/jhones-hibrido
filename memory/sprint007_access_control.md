---
name: sprint007-access-control
description: Feature 007-controle-acesso-seguranca (roles owner/admin/agent, permissões, convites, SMTP, auditoria) — decisões de design, descobertas contra o código real, e progresso do MVP (US1+US2)
metadata:
  type: project
---

Pedido pelo dono em 2026-07-28 a partir de um documento próprio
(`seguranca_acesso.md`, colado no chat) descrevendo roles simplificados
(owner/admin/agent), permissões ajustáveis por membro, convite por token,
SMTP + recuperação de senha, e auditoria. Spec formal criada via
`speckit-specify` → `speckit-plan` → `speckit-tasks` antes de codar
(`specs/007-controle-acesso-seguranca/`), seguindo o loop-sdd do CLAUDE.md.

## Emenda de constituição necessária (v2.0.0 → v2.1.0, MINOR)

O documento do dono pedia SMTP configurável pelo owner. A constituição
(Princípio II) tinha a lista de dependências externas em runtime FECHADA em
duas categorias (canal WhatsApp + LLM opcional). Antes de assumir que SMTP
"passa" por ser opcional, validei contra o código real: não havia nenhum
client de e-mail (nodemailer ou equivalente), nenhum hook
`sendResetPassword` configurado no plugin `emailAndPassword` do Better Auth
— ou seja, recuperação de senha automática NÃO existia mesmo, confirmando a
lacuna que a feature veio preencher. Emendei a constituição adicionando SMTP
como 3ª categoria opcional (operador possui/configura o próprio servidor,
não é um SaaS de e-mail transacional embutido tipo SendGrid) — MINOR porque
é aditivo, não redefine nada. `src/lib/crypto` já é genérico o bastante para
cifrar a senha SMTP sem mudança nenhuma.

## Duas correções feitas DURANTE o planejamento (antes de codar)

Ao ler o código real durante o `/speckit-plan`, encontrei que a spec recém-
escrita tinha duas suposições erradas:

1. **Já existe uma tela de equipe** (`src/app/api/settings/team/route.ts` +
   `team-client.tsx`) onde o owner cria contas diretamente com senha
   temporária — sem token, sem e-mail. A spec original dizia "convite por
   token é o ÚNICO caminho para criar conta", o que teria substituído (e
   quebrado) esse fluxo já em produção. Corrigido: convite por token é
   COMPLEMENTAR — é o único caminho que um `admin` (não só `owner`) pode
   usar, e não exige compartilhar senha manualmente.
2. **`member_channel` não precisa de `channel_id`** — o schema real só
   permite UM canal oficial e UM não oficial por organização
   (`meta_credentials`/`unofficial_channel` são `UNIQUE(organization_id)`).
   O documento do dono imaginava múltiplos canais nomeados ("Oficial —
   Suporte TI", "Oficial — CCD"), que não existe neste produto (uma
   instância = um negócio). Simplificado para `channel_type` apenas.

**Lição**: mesmo com uma spec já "fechada" pelo dono, sempre validar contra
o código real na fase de plano — a spec foi escrita antes de eu re-explorar
o repo a fundo, e apareceram 2 conflitos reais que teriam causado retrabalho
ou regressão se não corrigidos antes de codar.

## Decisões técnicas do MVP (US1 + US2, implementado e verificado ao vivo)

- **Permissão efetiva** = default do papel (`DEFAULT_PERMISSIONS[role]`) +
  overrides em `member_permission` (presença de linha SEMPRE vence,
  `granted: true|false`). Mesmo padrão para `member_channel` (ausência de
  linha = liberado por padrão — é uma restrição opcional, não uma allowlist
  vazia).
- **`SessionContext` ganhou `memberId`** (antes só tinha `userId`) —
  necessário porque `member_permission`/`member_channel`/`assigned_to`
  chaveiam por `member.id`, não `user.id`. `requireSession()` agora também
  rejeita quando `member.isActive === false`, reavaliado a CADA requisição
  (não só no login) — cobre o caso de alguém já logado ser desativado a
  meio da sessão.
- **`ForbiddenError` plugado em `withAuth`** (`src/lib/api.ts`) → 403
  automático, mesmo padrão que já existia para `UnauthorizedError` → 401.
- **`requireChannelAccess`/`requireConversationAccess` no nível de ROTA, não
  em `src/server/inbox/send.ts`** — `send.ts`/`sendText` também é chamado
  pela IA, pelo follow-up automático e por campanhas, nenhum dos quais tem
  um "membro" agindo (são disparos do sistema). Checar no nível da rota
  HTTP é o lugar certo porque é ali que existe uma sessão de membro.
- **Rotas ficam finas, lógica em `server/`**: a lógica de `updateMember`
  (bloqueio de último-owner, diff de permissões/canais contra o default)
  foi extraída para `src/server/auth/member-management.ts` em vez de ficar
  dentro do `route.ts` — replicando o padrão já usado no projeto
  (`campaigns/send.ts`, etc.) e, principalmente, porque **este projeto não
  testa `route.ts` diretamente** (nenhum teste em `tests/unit/` importa um
  arquivo `route.ts`) — a lógica só é testável em unit se morar em
  `server/`.
- **UI sem Dialog/Select/Checkbox**: o kit de componentes deste projeto só
  tem Badge/Button/Card/Input/Label/Textarea. O modal de edição de membro
  segue o mesmo padrão já usado em `stage-manager.tsx` (`<div
  className="fixed inset-0 ...">` com overlay + `stopPropagation`), não um
  componente Dialog dedicado.

## Gotcha do self-test: member.id usa o prefixo "org_"

`onUserCreated` (código pré-existente) usa `newId("organization")` para
gerar o ID da linha de `member`, não `newId("member")` — um member ID real
começa com `org_`, igual a um organization ID. Ao rodar o self-test ao vivo,
peguei acidentalmente o `member.id` (retornado por uma query `select id,
role, ... from member`) pensando que era o `organization.id`, e o script de
seed falhou com FK violation. Lição: ao inspecionar dados deste projeto,
**não assumir o tipo de uma linha pelo prefixo do ID** — vários tipos
diferentes podem compartilhar prefixo por causa desse detalhe histórico.

## Self-test ao vivo sem navegador disponível

Esta sessão não tinha uma ferramenta de browser/Playwright disponível
(`ToolSearch` não encontrou nenhuma). Self-test do MVP foi feito via HTTP
real contra o dev server (`next dev`, porta 3002 porque 3000 já estava
ocupada) + cookies de sessão reais (`curl -c/-b`) + contas de teste criadas
via um script one-off (`runInternalSignup`, mesmo padrão usado pela rota
`/api/settings/team`, para contornar o registro público fechado). Cobriu
13 cenários (permissão negada/concedida, visibilidade de conversa por
atribuição, acesso a canal, conta desativada em sessão já aberta E no
login, bloqueio de último-owner, admin não mexe em owner) — toda a LÓGICA
de segurança (que mora inteiramente no servidor) foi exercitada de ponta a
ponta. **O que ficou pendente**: confirmação visual de que o modal de
edição (`team-client.tsx`) renderiza e funciona corretamente num navegador
real — não reportado como "feito", marcado como pendente de verificação
humana/Playwright (Princípio IX).

## Estado no fim desta sessão

MVP (Setup+Foundational+US1+US2) implementado, testado (27 testes unitários
novos, 164 no total, todos verdes) e verificado ao vivo via API. Faltam
US3 (convite por token), US4 (SMTP+reset de senha), US5 (auditoria) e
Polish. Ver `specs/007-controle-acesso-seguranca/tasks.md` para o estado
exato task-a-task.
