import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ============================================================
 * Auth (Better Auth + plugin organization)
 * ============================================================ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("active_organization_id"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** owner | admin | agent — ver src/lib/auth/permissions.ts. */
    role: text("role").notNull().default("agent"),
    /** Membro inativo não consegue logar (FR-009). */
    isActive: boolean("is_active").notNull().default(true),
    /** Preferência pessoal: mensagens de grupo aparecem misturadas na aba
     * "Todas" da Caixa de Entrada (true, padrão) ou só na aba "Grupos". Não
     * afeta ingestão/entrega — só o que este membro vê. */
    groupsInInbox: boolean("groups_in_inbox").notNull().default(true),
    /** Departamento ativo (v0.1) — preferência pessoal do membro, igual a
     * `groupsInInbox`: não é estado de sessão do better-auth, é a fonte de
     * verdade para qual departamento a Caixa de Entrada/Pipeline/Contatos
     * mostram. Null = visão consolidada (normalmente só faz sentido para
     * owner) ou organização ainda sem departamentos cadastrados. */
    activeDepartmentId: text("active_department_id").references(
      () => department.id,
      { onDelete: "set null" }
    ),
    /** Perfil de agente IA padrão deste atendente (v0.1) — usado quando a
     * conversa está atribuída a ele (`conversation.assignedTo`) e não tem
     * override próprio. Null = não define padrão neste nível da chain. */
    agentProfileId: text("agent_profile_id").references(() => agentProfile.id, {
      onDelete: "set null",
    }),
    /** Aparência pessoal (Configurações → Preferências), mesmo padrão de
     * `groupsInInbox`: por membro, salva no servidor (acompanha em
     * qualquer dispositivo), nunca afeta outros agentes. Todos nullable =
     * "usar o padrão da organização/sistema" — igual a nunca ter mexido. */
    accentHex: text("accent_hex"),
    /** 30–100: quão saturada a cor de destaque pessoal fica (ver
     * `resolvePersonalAccentSet` em lib/branding.ts). Null = 75 (padrão). */
    accentIntensity: integer("accent_intensity"),
    /** Preset ("warm"|"cool"|"stone"|"forest") ou hex customizado
     * ("#rrggbb") do fundo do painel de conversa. Null/"default" = usa
     * `--chat-bg` do tema normal, sem override nenhum. */
    chatBg: text("chat_bg"),
    /** 0–100: intensidade da mistura do `chatBg` sobre o neutro base. Null
     * = 40 (padrão). */
    chatBgIntensity: integer("chat_bg_intensity"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    // Um usuário nunca pode ter mais de uma membership na mesma organização
    // — sem isso, `resolveMembership` (sem ORDER BY, .limit(1)) pode
    // resolver pra um member_id diferente a cada login, deixando
    // atribuições (conversation.assigned_to) "invisíveis" pro próprio dono.
    uniqueIndex("member_org_user_uq").on(t.organizationId, t.userId),
  ]
);

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

/**
 * Departamento (v0.1) — terceiro nível de escopo entre organização e
 * indivíduo: equipe com número(s) próprio(s), pipeline e agente IA
 * próprios. Nada de nome de setor fixo no código — tudo vem daqui.
 * `department_id` nas tabelas de domínio abaixo é NULLABLE de propósito:
 * organizações sem departamento cadastrado continuam funcionando como
 * hoje (owner vê tudo, filtro por dept é "sem restrição").
 */
export const department = pgTable(
  "department",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    color: text("color").default("#1d4ed8"),
    icon: text("icon").default("building"),
    isActive: boolean("is_active").notNull().default(true),
    /** Perfil de agente IA padrão deste departamento (v0.1, Etapa 6) — usado
     * quando a conversa não tem override próprio nem vem de um atendente
     * com perfil definido. Faz o papel do "pipeline.agent_profile_id" do
     * desenho original: este projeto não modela pipelines nomeados
     * separados, só `pipeline_stage` (já com `department_id`), então o
     * departamento é o nível certo para pendurar esse padrão. */
    agentProfileId: text("agent_profile_id").references(() => agentProfile.id, {
      onDelete: "set null",
    }),
    /** Fila e roteamento (Sprint Q, v0.1). Opt-in explícito: default
     * `false` preserva o comportamento atual para todo departamento já
     * existente — só quem liga a fila muda de comportamento. Ver
     * ROADMAP_queue_routing.md § "Decisão de visibilidade". */
    queueEnabled: boolean("queue_enabled").notNull().default(false),
    /** automatic | client-selection */
    routingMode: text("routing_mode").notNull().default("automatic"),
    /** round-robin | least-busy | first-available | manual */
    distributionMode: text("distribution_mode").default("round-robin"),
    /** Modo B: saudação com placeholders (ex.: "Olá {{nome}}!..."), texto
     * puro — nunca depende de LLM/IA configurada (Princípio II: IA é
     * opcional). */
    selectionGreeting: text("selection_greeting"),
    /** numbered | letters */
    selectionFormat: text("selection_format").default("numbered"),
    selectionShowOnlyOnline: boolean("selection_show_only_online").default(true),
    selectionTimeoutSeconds: integer("selection_timeout_seconds").default(105),
    /** auto-assign | queue | ai-assumes */
    selectionTimeoutAction: text("selection_timeout_action").default("auto-assign"),
    acceptTimeoutSeconds: integer("accept_timeout_seconds").default(120),
    /** next-agent | queue | ai-assumes */
    acceptTimeoutAction: text("accept_timeout_action").default("next-agent"),
    maxConversationsPerAgent: integer("max_conversations_per_agent").default(5),
    maxQueueSize: integer("max_queue_size").default(50),
    queueMessage: text("queue_message"),
    noAgentsMessage: text("no_agents_message"),
    offlineMessage: text("offline_message"),
    transferMessage: text("transfer_message"),
    awayMessage: text("away_message"),
    /** Modo B, Cenário 2: agente escolhido pelo cliente não respondeu a
     * tempo — mensagem antes de reoferecer as opções restantes. */
    selectionUnavailableMessage: text("selection_unavailable_message"),
    /** Horário de funcionamento — Cenário 6 (v0.1). Chave por dia da
     * semana (mon..sun), cada uma `{ enabled, start, end }` em HH:mm no
     * fuso de `timezone` abaixo. Dia ausente ou `enabled:false` = fechado. */
    businessHours: jsonb("business_hours"),
    /** Fuso IANA usado pra interpretar `business_hours` (gap #6 resolvido,
     * Sprint Q4). Default é o fuso mais comum entre os clientes do Vocero;
     * cada departamento pode ajustar. */
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("department_org_slug_uq").on(t.organizationId, t.slug)]
);

/**
 * Presença do agente (Sprint Q, v0.1) — UMA linha por membro, org-wide
 * (não por departamento: ver ROADMAP_queue_routing.md, gap #7). A
 * elegibilidade "pertence ao departamento certo" é resolvida à parte via
 * `member_department` no momento do roteamento.
 */
export const agentStatus = pgTable("agent_status", {
  id: text("id").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .unique()
    .references(() => member.id, { onDelete: "cascade" }),
  /** offline | online | busy | away */
  status: text("status").notNull().default("offline"),
  maxConversations: integer("max_conversations").notNull().default(5),
  currentConversations: integer("current_conversations").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at"),
  /** Última vez que este agente recebeu uma conversa da fila (Sprint Q2) —
   * separado de `updatedAt` (que também muda ao trocar de status manual)
   * porque é o ponteiro do round-robin: null vem primeiro na fila. */
  lastAssignedAt: timestamp("last_assigned_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Fila de atendimento (Sprint Q, v0.1) — Modo A (round-robin/first-available)
 * em `src/server/queue/manager.ts`, Modo B (seleção pelo cliente) em
 * `src/server/queue/selection.ts`. Ver ROADMAP_queue_routing.md.
 */
export const conversationQueue = pgTable("conversation_queue", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversation.id, { onDelete: "cascade" }),
  departmentId: text("department_id")
    .notNull()
    .references(() => department.id, { onDelete: "cascade" }),
  /** waiting | selecting | assigned | accepted | abandoned | expired */
  status: text("status").notNull().default("waiting"),
  assignedTo: text("assigned_to").references(() => member.id),
  assignedAt: timestamp("assigned_at"),
  acceptedAt: timestamp("accepted_at"),
  timeoutAt: timestamp("timeout_at"),
  attempt: integer("attempt").notNull().default(1),
  position: integer("position"),
  /** Quando a IA/sistema enviou as opções ao cliente (Modo B). */
  selectionSentAt: timestamp("selection_sent_at"),
  /** O que o cliente digitou em resposta à seleção (Modo B). */
  clientChoice: text("client_choice"),
  /** Opções exatamente como apresentadas ao cliente (Modo B, Sprint Q3):
   * `[{ label: "1", memberId: "mb_...", name: "Ana" }]` — precisa ficar
   * congelado no momento do envio porque a disponibilidade dos agentes
   * pode mudar antes da resposta chegar (senão "1" apontaria pra gente
   * diferente da que foi de fato oferecida). */
  selectionOptions: jsonb("selection_options"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Vínculo de membro a departamento, com role específico do departamento. */
export const memberDepartment = pgTable(
  "member_department",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => department.id, { onDelete: "cascade" }),
    /** admin | agent — dentro do departamento (independe do role de org). */
    role: text("role", { enum: ["admin", "agent"] })
      .notNull()
      .default("agent"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_department_member_dept_uq").on(
      t.memberId,
      t.departmentId
    ),
  ]
);

/** Concessão/revogação individual de permissão por membro dentro de um
 * departamento — mesmo padrão de `memberPermission`, com escopo de dept. */
export const memberDepartmentPermission = pgTable(
  "member_department_permission",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    departmentId: text("department_id")
      .notNull()
      .references(() => department.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_department_permission_uq").on(
      t.memberId,
      t.departmentId,
      t.permission
    ),
  ]
);

/* ============================================================
 * Domínio (toda tabela leva organization_id NOT NULL + índice org-first)
 * ============================================================ */

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** "phone" guarda o número (individual) ou o ID numérico do JID de
     * grupo — sem o sufixo `@g.us` (canal não oficial apenas: a Cloud API
     * oficial não suporta grupos). Continua único por org, então serve
     * como o mesmo identificador estável nos dois casos. */
    phone: text("phone").notNull(),
    kind: text("kind", { enum: ["individual", "group"] })
      .notNull()
      .default("individual"),
    name: text("name").notNull(),
    reference: text("reference"),
    comment: text("comment"),
    notes: text("notes"),
    // Foto de perfil — só o canal WhatsApp Web consegue buscar (Baileys);
    // a Cloud API oficial da Meta não expõe foto de contato. Cache local
    // (sem S3/R2) porque a URL do CDN do WhatsApp é temporária.
    avatarBase64: text("avatar_base64"),
    avatarMimeType: text("avatar_mime_type"),
    avatarUpdatedAt: timestamp("avatar_updated_at"),
    archivedAt: timestamp("archived_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contact_org_phone_uq").on(t.organizationId, t.phone),
    index("contact_org_name_idx").on(t.organizationId, t.name),
  ]
);

export const pipelineStage = pgTable(
  "pipeline_stage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    /** open = etapa normal · won / lost = âncoras não apagáveis */
    kind: text("kind", { enum: ["open", "won", "lost"] })
      .notNull()
      .default("open"),
    /** Departamento dono da etapa (v0.1). Null = pipeline compartilhado
     * entre toda a organização (comportamento atual, pré-departamentos). */
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("stage_org_pos_idx").on(t.organizationId, t.position)]
);

export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => pipelineStage.id),
    position: integer("position").notNull().default(0),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lead_contact_uq").on(t.contactId),
    index("lead_org_stage_idx").on(t.organizationId, t.stageId, t.position),
  ]
);

export const conversation = pgTable(
  "conversation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    /** Conversa do Laboratório: jamais toca a API real do WhatsApp. */
    isTest: boolean("is_test").notNull().default(false),
    /**
     * Canal desta conversa. "official" = Cloud API da Meta ·
     * "unofficial" = motor Baileys nativo. IDENTIDADE, não mais sticky:
     * fixado na criação (junto com `metaCredentialId`/`unofficialChannelId`
     * abaixo) e nunca mais mudado — cada número/canal tem sua PRÓPRIA
     * conversa com o mesmo contato (ver índices únicos abaixo). Corrige o
     * bug de "resposta saindo pelo número errado": antes, um contato só
     * podia ter 1 conversa por organização inteira, e o canal "seguia" a
     * última mensagem recebida — se o mesmo telefone escrevia pra dois
     * números da empresa, a resposta ia pelo canal errado.
     */
    channel: text("channel", { enum: ["official", "unofficial"] })
      .notNull()
      .default("official"),
    /** Departamento dono da conversa (v0.1). Null = organização ainda sem
     * departamentos, ou conversa anterior à migração — visível a todos. */
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    /** Número oficial específico ao qual esta conversa pertence (v0.1,
     * multi-número) — identidade, fixado na criação (ver comentário de
     * `channel`). Preenchido só quando `channel = 'official'`. */
    metaCredentialId: text("meta_credential_id").references(
      () => metaCredentials.id,
      { onDelete: "set null" }
    ),
    /** Canal não oficial específico ao qual esta conversa pertence (v0.1,
     * multi-sessão Baileys) — identidade, mesmo padrão de
     * `metaCredentialId`. Preenchido só quando `channel = 'unofficial'`. */
    unofficialChannelId: text("unofficial_channel_id").references(
      () => unofficialChannel.id,
      { onDelete: "set null" }
    ),
    /** Override manual do perfil de agente (v0.1) — maior prioridade na
     * cadeia de resolução (conversa > atendente > departamento > padrão da
     * org). Null = segue o padrão resolvido normalmente. */
    agentProfileId: text("agent_profile_id").references(() => agentProfile.id, {
      onDelete: "set null",
    }),
    aiEnabled: boolean("ai_enabled").notNull().default(true),
    handoffAt: timestamp("handoff_at"),
    handoffReason: text("handoff_reason", {
      enum: ["cliente", "modelo", "error", "ventana"],
    }),
    lastInboundAt: timestamp("last_inbound_at"),
    lastMessageAt: timestamp("last_message_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    /** Agente responsável (FR-007); null = não atribuída. */
    assignedTo: text("assigned_to").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // Uma conversa real por contato POR canal específico — não mais uma
    // por contato na organização inteira (ver comentário de `channel`
    // acima). Dois índices parciais porque um contato só amarra a UM dos
    // dois (metaCredentialId OU unofficialChannelId, nunca os dois);
    // NULL nunca colide consigo mesmo num índice único do Postgres, então
    // isso não impede conversas antigas (pré-migração) que ainda não
    // tinham essa identidade preenchida.
    uniqueIndex("conversation_org_contact_meta_cred_uq")
      .on(t.organizationId, t.contactId, t.metaCredentialId)
      .where(sql`${t.isTest} = false and ${t.channel} = 'official'`),
    uniqueIndex("conversation_org_contact_unofficial_uq")
      .on(t.organizationId, t.contactId, t.unofficialChannelId)
      .where(sql`${t.isTest} = false and ${t.channel} = 'unofficial'`),
    index("conversation_org_last_idx").on(t.organizationId, t.lastMessageAt),
  ]
);

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    /** ID do WhatsApp — UNIQUE (idempotência). Nullable em saídas de teste. */
    waMessageId: text("wa_message_id").unique(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    type: text("type").notNull().default("text"),
    text: text("text"),
    status: text("status", {
      enum: ["pending", "sent", "delivered", "read", "failed"],
    })
      .notNull()
      .default("pending"),
    error: text("error"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    waTimestamp: timestamp("wa_timestamp"),
    /** URL da mídia no gateway (imagem, áudio, vídeo, documento, sticker). */
    mediaUrl: text("media_url"),
    /** Mensagem citada (responder/quote) — nula quando não é resposta a
     * nada. `set null` em vez de cascade: apagar a mensagem original não
     * deve arrastar a que a citou. */
    replyToMessageId: text("reply_to_message_id").references(
      (): AnyPgColumn => message.id,
      { onDelete: "set null" }
    ),
    /** Agente humano que mandou (via composer) — assinatura no painel
     * interno (`get("sender name")`), NUNCA vai pro WhatsApp. Nulo pra
     * mensagens automáticas (IA/fila/campanha/follow-up), inbound, e
     * mensagens antigas anteriores a este campo. */
    sentByMemberId: text("sent_by_member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("message_org_conv_idx").on(
      t.organizationId,
      t.conversationId,
      t.createdAt
    ),
  ]
);

/**
 * Canal oficial (Cloud API da Meta). v0.1: N números por organização — a
 * unique antiga era só em `organization_id`, hoje cada linha é um canal
 * (`name`/`description` identificam qual é qual na UI). `department_id`
 * nullable: canal ainda não vinculado a um departamento fica visível à
 * organização toda (comportamento pré-departamentos).
 */
export const metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull().default("Principal"),
    description: text("description"),
    wabaId: text("waba_id").notNull(),
    phoneNumberId: text("phone_number_id").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    verifiedName: text("verified_name"),
    tokenCipher: text("token_cipher").notNull(),
    tokenIv: text("token_iv").notNull(),
    tokenTag: text("token_tag").notNull(),
    status: text("status", { enum: ["connected", "reconnect_required"] })
      .notNull()
      .default("connected"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // O webhook roteia por phone_number_id: precisa ser único na instância.
    uniqueIndex("meta_credentials_phone_uq").on(t.phoneNumberId),
  ]
);

/**
 * Canal de WhatsApp NÃO oficial — motor próprio (Baileys), conexão direta com
 * o protocolo do WhatsApp Web, sem gateway de terceiros. Complementa a Cloud
 * API oficial no modelo híbrido: captação pelo número oficial, automação por
 * este. A sessão (credenciais + chaves do Signal) é cifrada em repouso, igual
 * ao token da Meta.
 */
export const unofficialChannel = pgTable(
  "unofficial_channel",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull().default("WhatsApp"),
    description: text("description"),
    /** JSON `{ creds, keys }` do Baileys, cifrado. */
    authStateCipher: text("auth_state_cipher").notNull(),
    authStateIv: text("auth_state_iv").notNull(),
    authStateTag: text("auth_state_tag").notNull(),
    displayPhoneNumber: text("display_phone_number"),
    status: text("status", {
      enum: ["disconnected", "connecting", "connected"],
    })
      .notNull()
      .default("disconnected"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("unofficial_channel_org_idx").on(t.organizationId)]
);

/**
 * Bytes de mídia (imagem/áudio/vídeo/documento/sticker) do canal não
 * oficial nativo. Autohospedado por decisão da constituição (proibido
 * S3/R2) — sem infraestrutura nova, reusa o mesmo Postgres já usado pra
 * tudo (mesmo padrão de blob em texto que `unofficial_channel` já usa pro
 * auth-state cifrado). O canal oficial não usa esta tabela: sua mídia é
 * proxied direto do CDN da Meta via `message.mediaUrl`.
 */
export const messageMedia = pgTable("message_media", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  messageId: text("message_id")
    .notNull()
    .unique()
    .references(() => message.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  /** Nome original (documentos) — usado no card do documento e ao encaminhar/baixar. */
  filename: text("filename"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Perfil de agente IA — v0.1: N perfis reutilizáveis por organização (não
 * mais 1 único). Cada perfil pode ser o padrão de um departamento
 * (`department.agentProfileId`) e/ou de um atendente (`member.agentProfileId`),
 * com override manual por conversa (`conversation.agentProfileId`).
 * `enabled` agora significa "perfil ativo/selecionável" (arquivar em vez de
 * apagar), não mais "liga a IA para a org inteira" — quem liga/desliga por
 * conversa específica é `conversation.aiEnabled`, sem relação com este campo.
 */
export const agentProfile = pgTable(
  "agent_profile",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Assistente"),
    tone: text("tone"),
    instructions: text("instructions"),
    escalationRules: text("escalation_rules"),
    greeting: text("greeting"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("agent_profile_org_idx").on(t.organizationId)]
);

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: ["qa", "block"] }).notNull(),
    question: text("question"),
    answer: text("answer"),
    content: text("content"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("kb_org_idx").on(t.organizationId)]
);

export const template = pgTable(
  "template",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    language: text("language").notNull(),
    category: text("category").notNull(),
    body: text("body").notNull(),
    status: text("status", {
      enum: ["draft", "pending", "approved", "rejected"],
    })
      .notNull()
      .default("draft"),
    rejectionReason: text("rejection_reason"),
    waTemplateId: text("wa_template_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("template_org_name_lang_uq").on(
      t.organizationId,
      t.name,
      t.language
    ),
  ]
);

/**
 * Campanha de disparo em massa: oficial (template aprovado + {{1}}) ou não
 * oficial (texto livre + variáveis nomeadas, canal já conectado). Roda
 * in-process (Constituição II) — sem fila externa.
 */
export const campaign = pgTable(
  "campaign",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    departmentId: text("department_id").references(() => department.id, {
      onDelete: "set null",
    }),
    channel: text("channel", { enum: ["official", "unofficial"] }).notNull(),
    /** Somente canal oficial. */
    templateId: text("template_id").references(() => template.id),
    /** Somente canal não oficial: corpo com {{variavel}} nomeada. */
    messageTemplate: text("message_template"),
    sendIntervalMs: integer("send_interval_ms").notNull().default(5000),
    status: text("status", {
      enum: ["draft", "sending", "sent", "cancelled"],
    })
      .notNull()
      .default("draft"),
    total: integer("total").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    /** Agendamento (opcional): o scheduler dispara sozinho quando chega a hora. */
    scheduledAt: timestamp("scheduled_at"),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("campaign_org_created_idx").on(t.organizationId, t.createdAt),
    index("campaign_scheduled_idx")
      .on(t.scheduledAt)
      .where(sql`${t.status} = 'draft' and ${t.scheduledAt} is not null`),
  ]
);

export const campaignRecipient = pgTable(
  "campaign_recipient",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaign.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    phone: text("phone").notNull(),
    /** {"1": "valor"} (oficial) ou {"nome": "...", ...} (não oficial). */
    variables: jsonb("variables"),
    contactId: text("contact_id").references(() => contact.id),
    conversationId: text("conversation_id").references(() => conversation.id),
    messageId: text("message_id").references(() => message.id),
    status: text("status", { enum: ["pending", "sent", "failed"] })
      .notNull()
      .default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("campaign_recipient_campaign_idx").on(t.campaignId, t.status)]
);

/**
 * Configuração de follow-up automático do pipeline — singular por
 * organização (este projeto não modela múltiplos pipelines nomeados).
 * Nada de negócio fixo no código: etapas, intervalo e mensagem vêm daqui.
 */
export const pipelineFollowup = pgTable(
  "pipeline_followup",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    triggerStageId: text("trigger_stage_id").references(() => pipelineStage.id),
    intervalValue: integer("interval_value").notNull().default(4),
    intervalUnit: text("interval_unit", { enum: ["hours", "days"] })
      .notNull()
      .default("hours"),
    message: text("message"),
    successStageId: text("success_stage_id").references(() => pipelineStage.id),
    expiredStageId: text("expired_stage_id").references(() => pipelineStage.id),
    requiresDocument: boolean("requires_document").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pipeline_followup_org_uq").on(t.organizationId)]
);

/**
 * Registro de lembretes de follow-up enviados — existe para não reenviar
 * a mais (idempotência) e para saber a quem venceu o prazo de carência.
 * Já é criado com o resultado da tentativa (não é uma fila com data futura).
 */
export const followupSend = pgTable(
  "followup_send",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: text("status", {
      enum: ["sent", "failed", "cancelled", "expired"],
    }).notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    // No máximo um lembrete "ativo" (aguardando resolução) por lead.
    uniqueIndex("followup_send_lead_active_uq")
      .on(t.leadId)
      .where(sql`${t.status} = 'sent'`),
    index("followup_send_org_idx").on(t.organizationId),
  ]
);

export const agentTestRun = pgTable(
  "agent_test_run",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["running", "done", "failed"] })
      .notNull()
      .default("running"),
    score: integer("score"),
    error: text("error"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    // Lock de concorrência no BD: no máximo 1 execução ativa por organização.
    uniqueIndex("test_run_org_running_uq")
      .on(t.organizationId)
      .where(sql`${t.status} = 'running'`),
    index("test_run_org_idx").on(t.organizationId, t.startedAt),
  ]
);

export const agentTestCase = pgTable(
  "agent_test_case",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => agentTestRun.id, { onDelete: "cascade" }),
    persona: text("persona").notNull(),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "set null",
    }),
    transcript: jsonb("transcript"),
    veredicto: text("veredicto", { enum: ["verde", "amarillo", "rojo"] }),
    hallazgos: jsonb("hallazgos"),
    status: text("status", {
      enum: ["pending", "running", "done", "judge_failed"],
    })
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("test_case_run_idx").on(t.runId)]
);

/**
 * Concessão/revogação individual de permissão por membro — sobrepõe o
 * default do papel (src/lib/auth/permissions.ts). Ausência de linha = usa o
 * default; presença sempre vence.
 */
export const memberPermission = pgTable(
  "member_permission",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_permission_member_perm_uq").on(
      t.memberId,
      t.permission
    ),
  ]
);

/**
 * Restrição opcional de acesso a canal por membro — por TIPO de canal
 * (official/unofficial), não por número específico: mesmo com N números
 * por organização (v0.1), a permissão aqui é "pode usar o canal oficial?"
 * / "pode usar o não oficial?", igual desde antes do multi-número. Sem
 * channel_id de propósito. Ausência de linha = acesso liberado por padrão.
 */
export const memberChannel = pgTable(
  "member_channel",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    channelType: text("channel_type", {
      enum: ["official", "unofficial"],
    }).notNull(),
    canView: boolean("can_view").notNull().default(true),
    canSend: boolean("can_send").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("member_channel_member_type_uq").on(
      t.memberId,
      t.channelType
    ),
  ]
);

/**
 * Convite de uso único: papel + permissões/canais iniciais + expiração. O
 * token em si nunca é persistido — só seu hash (token_hash), como uma senha.
 */
export const inviteToken = pgTable(
  "invite_token",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    email: text("email"),
    role: text("role", { enum: ["admin", "agent"] }).notNull(),
    initialPermissions: jsonb("initial_permissions"),
    initialChannels: jsonb("initial_channels"),
    /** Departamento ao qual o convidado já entra vinculado (v0.1),
     * opcional — null = convite sem departamento (comportamento atual). */
    initialDepartmentId: text("initial_department_id").references(
      () => department.id,
      { onDelete: "set null" }
    ),
    initialDepartmentRole: text("initial_department_role", {
      enum: ["admin", "agent"],
    }),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    usedBy: text("used_by").references(() => member.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => member.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("invite_token_org_idx").on(t.organizationId)]
);

/**
 * Configuração do provedor de IA por organização — opcional, sobrepõe as
 * variáveis de ambiente (OPENROUTER_*) quando presente. Continua atrás do
 * único adaptador compatível com OpenRouter (Constituição II): `baseUrl`
 * aceita qualquer endpoint compatível com a API de chat completions da
 * OpenAI, não é uma integração nova por provedor.
 */
export const aiConfig = pgTable("ai_config", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  apiKeyCipher: text("api_key_cipher"),
  apiKeyIv: text("api_key_iv"),
  apiKeyTag: text("api_key_tag"),
  apiKeyLast4: text("api_key_last4"),
  model: text("model").notNull(),
  fallbackModel: text("fallback_model"),
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(500),
  contextMessages: integer("context_messages").notNull().default(20),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Servidor N8N do próprio operador/agência (Constituição II v2.2.0) —
 * opcional, um por organização, auto-hospedado. Usado só para listar/
 * executar workflows e ver histórico de execuções na aba Automações de
 * Campanhas — nunca é pré-requisito de uso da instância.
 */
export const n8nConfig = pgTable("n8n_config", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  baseUrl: text("base_url").notNull(),
  apiKeyCipher: text("api_key_cipher").notNull(),
  apiKeyIv: text("api_key_iv").notNull(),
  apiKeyTag: text("api_key_tag").notNull(),
  apiKeyLast4: text("api_key_last4").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Servidor SMTP do próprio operador (Constituição II v2.1.0) — opcional, um
 * por organização. Usado só para convites (futuro) e recuperação de senha.
 */
export const smtpConfig = pgTable("smtp_config", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  host: text("host").notNull(),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  user: text("user").notNull(),
  passwordCipher: text("password_cipher").notNull(),
  passwordIv: text("password_iv").notNull(),
  passwordTag: text("password_tag").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Token de recuperação de senha — uso único, expira em 1h. */
export const passwordResetToken = pgTable("password_reset_token", {
  id: text("id").primaryKey(),
  memberId: text("member_id")
    .notNull()
    .references(() => member.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Inscrição Web Push (Constituição I): permite notificar o membro mesmo com
 * o navegador fechado, usando só o padrão nativo Push API + VAPID do
 * próprio navegador — sem depender de um servidor de push de terceiro
 * escolhido pelo operador (o endpoint é do serviço de push do próprio
 * navegador do usuário, inerente ao protocolo Web Push). `p256dh`/`auth` não
 * são segredos do operador: são as chaves públicas de criptografia da
 * inscrição, exigidas pelo padrão para o servidor cifrar o payload.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("push_subscription_org_idx").on(t.organizationId)]
);

/** Registro imutável de ações críticas — nunca UPDATE/DELETE de aplicação. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    memberId: text("member_id").references(() => member.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resource: text("resource"),
    resourceId: text("resource_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_org_created_idx").on(t.organizationId, t.createdAt),
    index("audit_log_org_member_idx").on(t.organizationId, t.memberId),
  ]
);

/**
 * Rastro técnico do ciclo de vida de UMA mensagem/conversa — recebimento,
 * roteamento (caixa direta vs. fila), atribuição na fila, aceite/recusa,
 * envio de resposta e início manual de conversa pelo agente. Existe pra
 * diagnosticar "cadê a mensagem" sem depender de acesso direto ao banco:
 * cada evento é uma linha imutável, nunca UPDATE/DELETE — só INSERT — e
 * nunca deve derrubar o fluxo real se a escrita falhar (ver `logTrace`
 * em `src/server/observability/trace.ts`).
 */
export const traceEvent = pgTable(
  "trace_event",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversation.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    channel: text("channel"),
    channelId: text("channel_id"),
    memberId: text("member_id").references(() => member.id, { onDelete: "set null" }),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("trace_event_conversation_idx").on(t.conversationId, t.createdAt),
    index("trace_event_org_created_idx").on(t.organizationId, t.createdAt),
  ]
);
