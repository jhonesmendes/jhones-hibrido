---
name: project-direction-multitenant-client-product
description: Vocero passou a ser um produto sob encomenda do dono (não mais só o open source genérico) — vai virar multi-cliente com feature flags por cliente via painel super-admin, mas isso é passo futuro
metadata:
  type: project
---

Em 2026-07-27 o dono avisou que este repositório foi "passado" para ele e
que o projeto vai virar um **produto personalizado, vendido por cliente**
(não mais só a instância open source genérica descrita no `CLAUDE.md`
original). Duas coisas mudam concretamente, confirmado via
[[AskUserQuestion]]:

- **Recorte de funcionalidades por cliente**: cada cliente terá uma
  configuração diferente do que está disponível. Exemplos que o dono deu:
  - Alguns clientes: só canal oficial (Meta Cloud API).
  - Outros: híbrido (oficial + não oficial/Baileys).
  - Disparo em massa / mensagens de marketing (Campanhas): alguns clientes
    terão, outros não.
- **Deploy/infra dedicado por cliente**: cada cliente vai ter seu próprio
  domínio/servidor — ainda em aberto, sem domínio/servidor definido no
  momento desta conversa.

**O mecanismo que vai controlar isso é um painel super-admin** que o dono
está desenvolvendo à parte, onde ele vai poder ligar/desligar cada feature
por cliente. **Isso é o PRÓXIMO passo, não agora.** A prioridade atual e
explícita do dono é: "vamos resolver essa questão de funcionamento dessa
versão até o estado onde ela está" — ou seja, terminar de estabilizar a
versão atual (motor Baileys nativo, ver [[sprint4_baileys_native_engine]])
antes de começar a construir multi-tenancy de feature flags/painel
super-admin.

**Como aplicar**: não adiantar trabalho de feature-flagging por cliente ou
painel super-admin sem o dono pedir explicitamente — ele vai trazer isso
quando chegar a hora. Enquanto isso, continuar tratando a instância atual
como single-tenant funcional (a `organization_id` já dá a base de
multi-tenancy técnica; o que falta é a camada de "quais features cada
organização vê", que ainda não existe e não deve ser construída
prematuramente).
