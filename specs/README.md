# specs/

Aqui pousa o trabalho SDD. Cada feature cria sua própria pasta numerada:

```
specs/
└─ NNN-nome-feature/
   ├─ spec.md         # O QUÊ e POR QUÊ (comportamento observável, sem implementação)
   ├─ plan.md         # COMO (decisões técnicas, Constitution Check)
   ├─ research.md     # decisões a verificar (DV-...) e sua resolução
   ├─ data-model.md   # entidades e relações
   ├─ contracts/      # contratos de API/endpoints
   ├─ quickstart.md   # como testar a feature
   ├─ checklists/     # checklists de qualidade
   └─ tasks.md        # tarefas dependency-ordered (seu estado durável)
```

Não crie essas pastas manualmente: elas são geradas pelos comandos do Spec Kit
(`/speckit-specify`, `/speckit-plan`, `/speckit-tasks`). O número `NNN` é atribuído por
`/speckit-git-feature` (ou pelo script `create-new-feature.ps1`).

Ver [../docs/sdd-workflow.md](../docs/sdd-workflow.md).
