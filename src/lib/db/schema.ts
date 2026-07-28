import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
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

export const member = pgTable("member", {
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
    phone: text("phone").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
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
     * Canal ativo da conversa. "official" = Cloud API da Meta ·
     * "unofficial" = gateway não oficial (Evolution/WPPConnect/WAHA).
     * Sticky: é atualizado para o canal da última mensagem recebida, assim
     * as respostas saem por onde o cliente escreveu (modelo híbrido).
     */
    channel: text("channel", { enum: ["official", "unofficial"] })
      .notNull()
      .default("official"),
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
    // Uma conversa real por contato; as de teste não competem.
    uniqueIndex("conversation_org_contact_real_uq")
      .on(t.organizationId, t.contactId)
      .where(sql`${t.isTest} = false`),
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

export const metaCredentials = pgTable(
  "meta_credentials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meta_credentials_org_uq").on(t.organizationId),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("unofficial_channel_org_uq").on(t.organizationId)]
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
  (t) => [uniqueIndex("agent_profile_org_uq").on(t.organizationId)]
);

export const kbEntry = pgTable(
  "kb_entry",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("campaign_org_created_idx").on(t.organizationId, t.createdAt)]
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
 * Restrição opcional de acesso a canal por membro. Sem channel_id: cada
 * organização tem no máximo um canal oficial e um não oficial hoje
 * (meta_credentials/unofficial_channel são UNIQUE por organização).
 * Ausência de linha = acesso liberado por padrão.
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
