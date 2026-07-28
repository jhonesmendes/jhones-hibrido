# Data Model: Segurança & Controle de Acesso

Todas as tabelas novas seguem o padrão já vigente no projeto: `id` (nanoid
prefixado), `organization_id` NOT NULL (direto ou via `member_id`), timestamps
`created_at`/`updated_at` onde aplicável, cifragem AES-256-GCM (`src/lib/crypto`)
para qualquer segredo.

## `member` (existente — alterado)

Sem migração de schema (a coluna `role: text` já existe). Migração de **dado**:
todo `member.role` que hoje não seja `"owner"` passa a `"agent"` (o plugin
`organization` do Better Auth usa `"member"` como default atual — vira
`"agent"`). Novo default na criação: `"agent"`.

Coluna nova, adicionada nesta feature:

- `is_active: boolean NOT NULL DEFAULT true` — login bloqueado quando `false`.

## `member_permission` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `mp_` |
| member_id | text NOT NULL → `member.id` ON DELETE CASCADE | |
| permission | text NOT NULL | uma das chaves fixas de `PERMISSIONS` |
| granted | boolean NOT NULL DEFAULT true | `false` = revogação explícita do default do papel |
| created_at | timestamp NOT NULL DEFAULT now() | |

`UNIQUE(member_id, permission)`. Ausência de linha = usa o default do papel
(`DEFAULT_PERMISSIONS[role]`). Presença de linha SEMPRE vence o default
(concessão ou revogação explícita).

## `member_channel` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `mc_` |
| member_id | text NOT NULL → `member.id` ON DELETE CASCADE | |
| channel_type | text NOT NULL, enum `official`\|`unofficial` | sem `channel_id`: no máximo um canal de cada tipo por organização hoje (`meta_credentials`/`unofficial_channel` já são `UNIQUE(organization_id)`) |
| can_view | boolean NOT NULL DEFAULT true | |
| can_send | boolean NOT NULL DEFAULT true | |
| created_at | timestamp NOT NULL DEFAULT now() | |

`UNIQUE(member_id, channel_type)`. Ausência de linha = acesso liberado por
padrão (mesma filosofia de "revogação explícita" da permissão — não é uma
allowlist vazia por padrão, é uma restrição opcional).

## `conversation.assigned_to` (coluna nova em tabela existente)

`assigned_to: text REFERENCES member(id) ON DELETE SET NULL, nullable`. Sem
índice novo dedicado — reaproveita o já existente `organization_id` +
filtragem em memória/query por `assigned_to = session.memberId` quando o
membro não tiver `conversations:view_all`.

## `invite_token` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `inv_` |
| organization_id | text NOT NULL → `organization.id` ON DELETE CASCADE | |
| token_hash | text NOT NULL UNIQUE | hash (sha256) do token opaco — o token em si só existe na URL, nunca persistido em claro |
| email | text, nullable | restringe o convite a um email específico quando presente |
| role | text NOT NULL | `admin` ou `agent` (nunca se convida um segundo owner por token) |
| initial_permissions | jsonb, nullable | overrides de permissão aplicados na criação da conta |
| initial_channels | jsonb, nullable | overrides de acesso a canal aplicados na criação |
| expires_at | timestamp NOT NULL | agora + 24h/7d/30d, escolhido na geração |
| used_at | timestamp, nullable | |
| used_by | text, nullable → `member.id` | |
| created_by | text NOT NULL → `member.id` | |
| created_at | timestamp NOT NULL DEFAULT now() | |

Consumo é atômico: `UPDATE invite_token SET used_at = now(), used_by = $1
WHERE id = $2 AND used_at IS NULL` dentro da mesma transação que cria o
`member` — `rowCount === 0` gera erro "convite já utilizado" mesmo sob corrida.

## `smtp_config` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `smtp_` |
| organization_id | text NOT NULL UNIQUE → `organization.id` ON DELETE CASCADE | um por organização |
| host | text NOT NULL | |
| port | integer NOT NULL DEFAULT 587 | |
| secure | boolean NOT NULL DEFAULT false | |
| user | text NOT NULL | |
| password_cipher/iv/tag | text NOT NULL (3 colunas) | mesmo padrão de `meta_credentials.token_*` |
| from_name | text NOT NULL | |
| from_email | text NOT NULL | |
| is_active | boolean NOT NULL DEFAULT true | permite desativar sem apagar a configuração |
| created_at / updated_at | timestamp | |

## `password_reset_token` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `prt_` |
| member_id | text NOT NULL → `member.id` ON DELETE CASCADE | |
| token_hash | text NOT NULL UNIQUE | mesmo padrão de hash do `invite_token` |
| expires_at | timestamp NOT NULL | agora + 1h |
| used_at | timestamp, nullable | |
| created_at | timestamp NOT NULL DEFAULT now() | |

Consumo atômico igual ao `invite_token`.

## `audit_log` (novo)

| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | prefixo `aud_` |
| organization_id | text NOT NULL → `organization.id` ON DELETE CASCADE | |
| member_id | text, nullable → `member.id` ON DELETE SET NULL | nullable: preserva o registro se o autor for removido depois |
| action | text NOT NULL | `user.login`, `invite.created`, `invite.used`, `channel.connected`, `channel.disconnected`, `campaign.sent`, `settings.permissions_changed`, `settings.smtp_changed`, `settings.role_changed` |
| resource | text, nullable | tipo do recurso afetado (`member`, `campaign`, `channel`...) |
| resource_id | text, nullable | |
| ip_address | text, nullable | |
| user_agent | text, nullable | |
| metadata | jsonb, nullable | contexto adicional específico da ação |
| created_at | timestamp NOT NULL DEFAULT now() | imutável — sem UPDATE/DELETE de aplicação |

Índice `(organization_id, created_at)` para a tela de auditoria; índice
adicional `(organization_id, member_id)` para o filtro por membro.

## Lista fixa de permissões (`src/lib/auth/permissions.ts`)

Mesmas 15 chaves do documento de origem — sem mudança de nome, já que são
strings de contrato (usadas em `member_permission.permission`, nunca
traduzidas nem alteradas livremente):

```
conversations:view_all, conversations:view_assigned, conversations:reply,
conversations:assign, pipeline:view, pipeline:move, contacts:view,
contacts:create, contacts:edit, campaigns:view, campaigns:create,
campaigns:send, reports:view, agent:view, agent:manage
```

Defaults por papel: `owner` e `admin` → todas; `agent` →
`conversations:view_assigned, conversations:reply, pipeline:view,
pipeline:move, contacts:view`.
