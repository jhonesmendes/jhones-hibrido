# Data Model — Vocero CRM v1 (001-vocero-core)

Convenções globais:

- IDs: `text` com nanoid prefixado (`ct_`, `cv_`, `msg_`, `ld_`, `stg_`, `cred_`, `agp_`,
  `kb_`, `tpl_`, `run_`, `case_`). Os do plugin de auth mantêm seu formato próprio.
- Toda tabela de domínio tem `organization_id text NOT NULL` com FK para `organization`
  (`ON DELETE CASCADE`) e índice org-first (`(organization_id, ...)`).
- Timestamps: `created_at` / `updated_at` `timestamptz` com default `now()`.
- Enums como `text` com CHECK via Drizzle enum de texto (portabilidade de migrações).

## Auth (Better Auth + plugin organization — schema gerado pela biblioteca)

`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`
(sem UI de convites na v1; a tabela existe porque o plugin a exige).

## Domínio

### contact
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `ct_` |
| organization_id | text NOT NULL FK→organization CASCADE | índice org-first |
| phone | text NOT NULL | E.164 sem `+` (formato wa_id da Meta) |
| profile_name | text | nome do perfil do WA (editável) |
| notes | text | notas livres |
| archived_at | timestamptz NULL | arquivamento reversível |
| created_at / updated_at | timestamptz | |

UNIQUE `(organization_id, phone)`. Avatar = iniciais + cor estável derivada do id
(hash → paleta), não é persistido.

### pipeline_stage
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `stg_` |
| organization_id | text NOT NULL FK CASCADE | |
| name | text NOT NULL | |
| position | integer NOT NULL | ordem no kanban |
| color | text NOT NULL | cor da etapa |
| kind | text NOT NULL default 'open' | `open` \| `won` \| `lost` (âncoras) |
| created_at / updated_at | | |

Seed: Novo → Em conversa → Interessado → Cliente(won) → Perdido(lost). Regra: não é
possível excluir a última etapa `won` nem a última `lost`; excluir uma etapa com leads
exige etapa de destino.

### lead
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `ld_` |
| organization_id | text NOT NULL FK CASCADE | |
| contact_id | text NOT NULL FK→contact CASCADE | UNIQUE (1 lead ativo por contato na v1) |
| stage_id | text NOT NULL FK→pipeline_stage | |
| position | integer NOT NULL default 0 | ordem dentro da coluna |
| value_note | text | dado livre do negócio (p. ex. valor) |
| last_activity_at | timestamptz | para o cartão |
| created_at / updated_at | | |

### conversation
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `cv_` |
| organization_id | text NOT NULL FK CASCADE | |
| contact_id | text NOT NULL FK→contact CASCADE | |
| is_test | boolean NOT NULL default false | Laboratório; excluída da caixa de entrada/SSE |
| ai_enabled | boolean NOT NULL default true | toggle por conversa |
| handoff_at | timestamptz NULL | badge "atendimento humano"; IA silenciada se NOT NULL |
| handoff_reason | text NULL | `cliente` \| `modelo` \| `error` \| `ventana` |
| last_inbound_at | timestamptz NULL | base do cálculo da janela de 24h |
| last_message_at | timestamptz NULL | ordem da caixa de entrada + catch-up SSE |
| unread_count | integer NOT NULL default 0 | |
| created_at / updated_at | | |

UNIQUE parcial `(organization_id, contact_id) WHERE is_test = false` (uma conversa
real por contato; as de teste são N).

### message
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `msg_` |
| organization_id | text NOT NULL FK CASCADE | |
| conversation_id | text NOT NULL FK→conversation CASCADE | índice `(conversation_id, created_at)` |
| direction | text NOT NULL | `in` \| `out` |
| type | text NOT NULL default 'text' | `text` \| `image` \| `audio` \| `video` \| `document` \| `sticker` \| `template` \| `unsupported` |
| body | text | texto ou corpo renderizado do template |
| wa_message_id | text UNIQUE NULL | idempotência (as `is_test` não têm) |
| status | text NOT NULL default 'pending' | out: `pending`→`sent`→`delivered`→`read` \| `failed`; in: `received` |
| error_detail | text NULL | falha de envio |
| ai_generated | boolean NOT NULL default false | resposta do agente |
| wa_timestamp | timestamptz NULL | timestamp da Meta (override no mock) |
| created_at | timestamptz | |

### meta_credentials
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `cred_` |
| organization_id | text NOT NULL FK CASCADE UNIQUE | 1 conexão por org (v1) |
| waba_id | text NOT NULL | |
| phone_number_id | text NOT NULL UNIQUE | roteamento do webhook |
| display_phone | text | número legível (da validação) |
| verified_name | text | nome verificado (da validação) |
| token_cipher / token_iv / token_tag | text NOT NULL | AES-256-GCM |
| status | text NOT NULL default 'connected' | `connected` \| `invalid` |
| created_at / updated_at | | |

### agent_profile
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `agp_` |
| organization_id | text NOT NULL FK CASCADE UNIQUE | 1 perfil por org |
| enabled | boolean NOT NULL default false | toggle global |
| name | text NOT NULL default 'Asistente' | |
| tone | text | |
| instructions | text | |
| escalation_rules | text | |
| greeting | text | |
| created_at / updated_at | | |

### kb_entry
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `kb_` |
| organization_id | text NOT NULL FK CASCADE | |
| kind | text NOT NULL | `qa` \| `block` |
| question | text NULL | obrigatório se kind=qa |
| answer | text NULL | obrigatório se kind=qa |
| content | text NULL | obrigatório se kind=block |
| position | integer NOT NULL default 0 | |
| created_at / updated_at | | |

### template
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `tpl_` |
| organization_id | text NOT NULL FK CASCADE | |
| name | text NOT NULL | snake_case exigido pela Meta |
| language | text NOT NULL | p. ex. `es_MX` |
| category | text NOT NULL | `MARKETING` \| `UTILITY` |
| body | text NOT NULL | máx. UMA variável `{{1}}` |
| status | text NOT NULL default 'draft' | `draft` \| `pending` \| `approved` \| `rejected` |
| rejection_reason | text NULL | |
| wa_template_id | text NULL | id retornado pela Graph |
| created_at / updated_at | | |

UNIQUE `(organization_id, name, language)`.

### agent_test_run
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `run_` |
| organization_id | text NOT NULL FK CASCADE | |
| status | text NOT NULL default 'running' | `running` \| `completed` \| `failed` |
| score | integer NULL | 0–100 ao concluir |
| error | text NULL | |
| started_at / finished_at | timestamptz | |

Lock de concorrência: UNIQUE parcial `(organization_id) WHERE status = 'running'`
(máx. 1 execução ativa por org, em nível de BD). No boot: `UPDATE ... SET status='failed'
WHERE status='running'`.

### agent_test_case
| Coluna | Tipo | Notas |
|---|---|---|
| id | text PK | `case_` |
| organization_id | text NOT NULL FK CASCADE | |
| run_id | text NOT NULL FK→agent_test_run CASCADE | |
| persona | text NOT NULL | chave da persona roteirizada |
| conversation_id | text NULL FK→conversation SET NULL | a conversa `is_test` |
| transcript | jsonb NOT NULL default '[]' | `[{role:'cliente'\|'agente', text, at}]` |
| veredicto | text NULL | `verde` \| `amarillo` \| `rojo` (NULL = o juiz falhou) |
| hallazgos | jsonb NOT NULL default '[]' | `[{tipo, evidencia, sugerencia?}]` |
| status | text NOT NULL default 'pending' | `pending` \| `running` \| `done` \| `judge_failed` |
| created_at | | |

## Relações (resumo)

organization 1—N {contact, pipeline_stage, lead, conversation, message, kb_entry,
template, agent_test_run, agent_test_case} · 1—1 {meta_credentials, agent_profile} ·
contact 1—1 lead · contact 1—1 conversa real (N de teste) · conversation 1—N message ·
agent_test_run 1—6 agent_test_case.

## Score do Laboratório

`score = round(100 * (verdes + 0.5 * amarillos) / casos_con_veredicto)`; os
`judge_failed` são excluídos do denominador e exibidos à parte. Delta = score da
execução atual − score da execução anterior concluída.
