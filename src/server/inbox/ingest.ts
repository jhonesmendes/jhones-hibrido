import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { sendPushToOrganization } from "@/server/push/send";
import { getCredentialsByOrg, getCredentialsByPhoneNumberId } from "@/server/whatsapp/credentials";
import { resolveDefaultUnofficialChannelId } from "@/server/settings/unofficial-channels";
import { downloadMetaMedia, getMetaMediaMeta } from "@/lib/meta/client";
import type { WebhookMedia, WebhookValue } from "@/server/inbox/webhook";
import { applyStatusUpdate } from "@/server/inbox/status";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { maybeRunAgentTurn } from "@/server/ai/trigger";
import { onInboundMedia } from "@/server/pipeline/followup-document";
import {
  distributeConversation,
  findActiveQueueEntry,
  getDepartmentQueueConfig,
  routeConversationToQueue,
} from "@/server/queue/manager";
import { handleSelectionReply, sendSelectionGreeting } from "@/server/queue/selection";
import { LOCAL_MEDIA_MARKER, MEDIA_TYPES, serializeMessage } from "@/server/inbox/message-format";

// Re-exportados por compatibilidade — outros módulos importam esses dois
// símbolos daqui (`@/server/inbox/ingest`); a definição real vive em
// message-format.ts pra `send.ts` não precisar importar ingest.ts de volta
// (send.ts → ingest.ts → selection.ts → send.ts seria um ciclo).
export { LOCAL_MEDIA_MARKER, serializeMessage };

/** Tipos de conteúdo suportados; o resto é ignorado sem erro. */
const SUPPORTED_TYPES = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

export async function getOrCreateContact(
  organizationId: string,
  phone: string,
  name?: string | null,
  kind: "individual" | "group" = "individual"
) {
  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId,
      phone,
      kind,
      name: name?.trim() || phone,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (inserted[0]) return { contact: inserted[0], isNew: true };

  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      and(
        eq(schema.contact.organizationId, organizationId),
        eq(schema.contact.phone, phone)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("contato não encontrado após upsert");

  // Reativar se estava arquivado (o nome editado pelo operador é respeitado).
  if (existing.archivedAt) {
    await db
      .update(schema.contact)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(schema.contact.id, existing.id));
    existing.archivedAt = null;
  }
  return { contact: existing, isNew: false };
}

/**
 * Departamento dono do canal que recebeu a mensagem (v0.1) — canal ainda
 * sem departamento vinculado devolve `null` (conversa fica visível a
 * todos, ver comentário do campo em schema.ts).
 */
async function resolveChannelDepartmentId(input: {
  metaCredentialId?: string | null;
  unofficialChannelId?: string | null;
}): Promise<string | null> {
  const db = getDb();
  if (input.metaCredentialId) {
    const rows = await db
      .select({ departmentId: schema.metaCredentials.departmentId })
      .from(schema.metaCredentials)
      .where(eq(schema.metaCredentials.id, input.metaCredentialId))
      .limit(1);
    return rows[0]?.departmentId ?? null;
  }
  if (input.unofficialChannelId) {
    const rows = await db
      .select({ departmentId: schema.unofficialChannel.departmentId })
      .from(schema.unofficialChannel)
      .where(eq(schema.unofficialChannel.id, input.unofficialChannelId))
      .limit(1);
    return rows[0]?.departmentId ?? null;
  }
  return null;
}

/** Identidade do canal de uma conversa — não é mais um detalhe "sticky"
 * que muda sozinho, é a chave que distingue conversas do mesmo contato
 * (ver comentário de `conversation.channel` em schema.ts). */
export type ConversationChannel =
  | { type: "official"; metaCredentialId: string }
  | { type: "unofficial"; unofficialChannelId: string };

/**
 * Busca (ou cria) a conversa deste contato NESTE canal específico —
 * um contato pode ter uma conversa por número oficial + uma por canal
 * WhatsApp Web, todas independentes. `departmentId` só se aplica à
 * criação (conversas já existentes mantêm o departamento atual).
 */
export async function getOrCreateConversation(
  organizationId: string,
  contactId: string,
  channel: ConversationChannel,
  departmentId?: string | null
) {
  const db = getDb();
  const metaCredentialId = channel.type === "official" ? channel.metaCredentialId : null;
  const unofficialChannelId = channel.type === "unofficial" ? channel.unofficialChannelId : null;

  const inserted = await db
    .insert(schema.conversation)
    .values({
      id: newId("conversation"),
      organizationId,
      contactId,
      departmentId,
      channel: channel.type,
      metaCredentialId,
      unofficialChannelId,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];

  const rows = await db
    .select()
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.contactId, contactId),
        eq(schema.conversation.isTest, false),
        eq(schema.conversation.channel, channel.type),
        channel.type === "official"
          ? eq(schema.conversation.metaCredentialId, channel.metaCredentialId)
          : eq(schema.conversation.unofficialChannelId, channel.unofficialChannelId)
      )
    )
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error("conversa não encontrada após upsert");
  return existing;
}

/** Canal padrão pra uma conversa NOVA sem canal explícito escolhido —
 * prefere o número oficial (se conectado), senão o canal WhatsApp Web
 * padrão da organização. `null` quando não há nenhum canal conectado
 * ainda (a chamador decide o que fazer — normalmente um erro claro). */
export async function resolveDefaultChannelForNewConversation(
  organizationId: string
): Promise<ConversationChannel | null> {
  const official = await getCredentialsByOrg(organizationId);
  if (official) return { type: "official", metaCredentialId: official.id };
  const unofficialChannelId = await resolveDefaultUnofficialChannelId(organizationId);
  if (unofficialChannelId) return { type: "unofficial", unofficialChannelId };
  return null;
}

/**
 * Processa o `value` de uma mudança `messages` do webhook: mensagens
 * recebidas (idempotentes por wa_message_id) e atualizações de status.
 */
export async function processMessagesValue(value: WebhookValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return;

  const credentials = await getCredentialsByPhoneNumberId(phoneNumberId);
  if (!credentials) {
    // Caso típico: webhook/override configurado ANTES de salvar a conexão
    // no wizard — o evento chega mas não há organização para rotear.
    console.warn(
      `[webhook] evento para phone_number_id desconhecido (${phoneNumberId}): ` +
        "salve a conexão em Configurações → WhatsApp para receber mensagens"
    );
    return;
  }

  const organizationId = credentials.organizationId;

  for (const status of value.statuses ?? []) {
    await applyStatusUpdate(organizationId, status);
  }

  for (const msg of value.messages ?? []) {
    if (!SUPPORTED_TYPES.has(msg.type)) continue; // reações, etc.: ignorar
    const profileName = value.contacts?.find(
      (c) => c.wa_id === msg.from
    )?.profile?.name;

    const mediaField: WebhookMedia | undefined =
      msg.image ?? msg.document ?? msg.audio ?? msg.video ?? msg.sticker;
    const media = mediaField
      ? await downloadOfficialMedia(mediaField, credentials.token)
      : null;

    await ingestInboundMessage({
      organizationId,
      metaCredentialId: credentials.id,
      from: msg.from,
      profileName: profileName ?? null,
      waMessageId: msg.id,
      type: msg.type,
      text: msg.text?.body ?? mediaField?.caption ?? null,
      timestamp: msg.timestamp,
      media,
    });
  }
}

/**
 * Baixa mídia do canal oficial (2 passos do Graph API: metadados → bytes) e
 * guarda localmente — igual ao WhatsApp Web, nunca depende de uma URL da
 * Meta ainda viva no momento em que o agente/usuário abre a conversa (essas
 * URLs expiram em minutos). Uma falha aqui não derruba a ingestão da
 * mensagem: ela entra sem mídia anexada, em vez de travar o webhook.
 */
async function downloadOfficialMedia(
  field: WebhookMedia,
  token: string
): Promise<{ mimeType: string; dataBase64: string; filename: string | null } | null> {
  try {
    const meta = await getMetaMediaMeta(field.id, token);
    const buffer = await downloadMetaMedia(meta.url, token);
    return {
      mimeType: field.mime_type ?? meta.mimeType,
      dataBase64: buffer.toString("base64"),
      filename: field.filename ?? null,
    };
  } catch (err) {
    console.error("[webhook] falha ao baixar mídia oficial:", err);
    return null;
  }
}

export async function ingestInboundMessage(input: {
  organizationId: string;
  from: string;
  profileName: string | null;
  waMessageId: string;
  type: string;
  text: string | null;
  timestamp: string;
  /** Canal de origem — identidade da conversa (ver ConversationChannel).
   * Padrão: official. */
  channel?: "official" | "unofficial";
  /** Número oficial que recebeu — OBRIGATÓRIO quando `channel` é
   * "official" (identidade da conversa, não mais sticky). */
  metaCredentialId?: string | null;
  /** Canal não oficial (sessão Baileys) que recebeu — OBRIGATÓRIO quando
   * `channel` é "unofficial" (identidade da conversa, não mais sticky). */
  unofficialChannelId?: string | null;
  /**
   * true = eco de uma mensagem enviada pelo próprio número (típico de
   * gateways não oficiais: inclui o que foi enviado a partir do telefone).
   * É registrado como saída, sem unread nem turno do agente.
   */
  fromMe?: boolean;
  /** URL da mídia no gateway (servida ao navegador via /api/media/[id]). */
  mediaUrl?: string | null;
  /** Bytes de mídia já baixados (sem URL de terceiro persistente). */
  media?: { mimeType: string; dataBase64: string; filename?: string | null } | null;
  /** Grupo do canal não oficial (a Cloud API oficial não suporta grupos). */
  contactKind?: "individual" | "group";
}): Promise<void> {
  const db = getDb();
  const { organizationId } = input;
  const channel = input.channel ?? "official";
  const fromMe = input.fromMe ?? false;

  const { contact } = await getOrCreateContact(
    organizationId,
    input.from,
    input.profileName,
    input.contactKind ?? "individual"
  );
  const channelDepartmentId = await resolveChannelDepartmentId({
    metaCredentialId: input.metaCredentialId,
    unofficialChannelId: input.unofficialChannelId,
  });
  // Departamento com fila ativa: a conversa NÃO recebe department_id ainda
  // — fica invisível na Caixa de Entrada normal (exceto pra quem já tem
  // view_all, tipo o owner) até queue/manager.ts rotear de fato. Ver
  // ROADMAP_queue_routing.md § "Decisão de visibilidade".
  const queueConfig = channelDepartmentId
    ? await getDepartmentQueueConfig(channelDepartmentId)
    : null;
  const queueEnabled = queueConfig?.queueEnabled === true;

  const conversationChannel: ConversationChannel =
    channel === "official"
      ? { type: "official", metaCredentialId: input.metaCredentialId ?? "" }
      : { type: "unofficial", unofficialChannelId: input.unofficialChannelId ?? "" };
  if (
    (conversationChannel.type === "official" && !conversationChannel.metaCredentialId) ||
    (conversationChannel.type === "unofficial" && !conversationChannel.unofficialChannelId)
  ) {
    throw new Error(
      `ingestInboundMessage: canal '${channel}' sem credencial/id do canal — não dá pra saber a qual conversa esta mensagem pertence`
    );
  }

  const conversation = await getOrCreateConversation(
    organizationId,
    contact.id,
    conversationChannel,
    queueEnabled ? null : channelDepartmentId
  );

  const waTimestamp = toDate(input.timestamp);

  // Idempotência dura: mesmo wa_message_id → sem efeitos adicionais.
  // Cobre também o eco do gateway para envios feitos a partir do CRM.
  const inserted = await db
    .insert(schema.message)
    .values({
      id: newId("message"),
      organizationId,
      conversationId: conversation.id,
      waMessageId: input.waMessageId,
      direction: fromMe ? "out" : "in",
      type: input.type,
      text: input.text,
      mediaUrl: input.mediaUrl ?? (input.media ? LOCAL_MEDIA_MARKER : null),
      status: fromMe ? "sent" : "delivered",
      waTimestamp,
    })
    .onConflictDoNothing({ target: [schema.message.waMessageId] })
    .returning();
  const message = inserted[0];
  if (!message) return; // duplicado

  if (input.media) {
    await db
      .insert(schema.messageMedia)
      .values({
        id: newId("messageMedia"),
        organizationId,
        messageId: message.id,
        mimeType: input.media.mimeType,
        dataBase64: input.media.dataBase64,
        filename: input.media.filename ?? null,
        sizeBytes: Math.ceil((input.media.dataBase64.length * 3) / 4),
      })
      .onConflictDoNothing({ target: [schema.messageMedia.messageId] });
  }

  // channel/metaCredentialId/unofficialChannelId NÃO são mais tocados aqui:
  // são identidade da conversa, fixados na criação (getOrCreateConversation)
  // — nunca mudam depois, é isso que corrige a resposta saindo pelo número
  // errado quando o mesmo contato fala com mais de um canal da empresa.
  await db
    .update(schema.conversation)
    .set(
      fromMe
        ? { lastMessageAt: waTimestamp, updatedAt: new Date() }
        : {
            lastInboundAt: waTimestamp,
            lastMessageAt: waTimestamp,
            unreadCount: sql`${schema.conversation.unreadCount} + 1`,
            // Sem fila: sticky, igual ao canal. Com fila: NUNCA mexido aqui
            // — uma vez roteada, quem decide department_id é
            // queue/manager.ts (acceptQueuedConversation); antes de
            // roteada, fica null de propósito (ver comentário acima).
            ...(queueEnabled ? {} : { departmentId: channelDepartmentId }),
            updatedAt: new Date(),
          }
    )
    .where(eq(schema.conversation.id, conversation.id));

  // Fila de atendimento (Sprint Q2/Q3): só mensagem real do cliente,
  // conversa individual (grupo não tem "um" agente dono — fora de escopo
  // por ora), e NUNCA para conversas do Laboratório (guardrail de sandbox).
  if (!fromMe && !conversation.isTest && contact.kind !== "group" && channelDepartmentId && queueEnabled) {
    await routeQueueMessage(conversation.id, channelDepartmentId, input.text ?? "").catch(
      (err) => console.error("[queue] falha ao rotear conversa para a fila:", err)
    );
  }

  // Grupo não é lead nem alvo de follow-up de pipeline (Foco Vertical): o
  // pipeline é sobre converter conversas individuais, não threads coletivas.
  if (contact.kind !== "group") {
    await onLeadActivity(organizationId, contact.id, waTimestamp);
    if (!fromMe && MEDIA_TYPES.has(input.type)) {
      await onInboundMedia(organizationId, contact.id);
    }
  }

  publish(organizationId, {
    type: "message.new",
    data: {
      conversationId: conversation.id,
      message: serializeMessage(
        message,
        input.media
          ? {
              filename: input.media.filename ?? null,
              sizeBytes: Math.ceil((input.media.dataBase64.length * 3) / 4),
              mimeType: input.media.mimeType,
            }
          : null
      ),
    },
  });
  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversation.id } },
  });

  if (!fromMe) {
    sendPushToOrganization(organizationId, {
      title: contact.name || input.from,
      body: input.text?.trim() || MEDIA_PUSH_LABELS[input.type] || "Nova mensagem",
      icon: `/api/contacts/${contact.id}/avatar`,
      url: `/inbox?contact=${contact.id}`,
      conversationId: conversation.id,
    }).catch((err) => console.error("[push] falha ao notificar organização:", err));

    // O agente de IA responde conversas individuais, não grupos: uma
    // resposta automática numa thread coletiva sem pedido é intrusiva e
    // foge do escopo do produto (converter conversas, não moderar grupos).
    // Em fila ainda não roteada, a IA genérica também se cala — quem
    // responde primeiro é o roteamento (Modo A) ou a seleção do Modo B
    // (Sprint Q3); ver ROADMAP_queue_routing.md, gap #4.
    const waitingInQueue = queueEnabled && !conversation.departmentId;
    if (contact.kind !== "group" && !waitingInQueue) await maybeRunAgentTurn(conversation.id);
  }
}

/**
 * Ponto único de entrada da fila a partir do ingest: se já há uma seleção
 * em aberto (Modo B, status 'selecting'), a mensagem do cliente é a
 * ESCOLHA, não uma nova entrada. Senão, cria a linha e dispara o modo
 * configurado (Modo A distribui direto; Modo B manda a saudação).
 */
async function routeQueueMessage(
  conversationId: string,
  departmentId: string,
  text: string
): Promise<void> {
  const active = await findActiveQueueEntry(conversationId, departmentId);
  if (active) {
    if (active.status === "selecting") await handleSelectionReply(active.id, text);
    return; // waiting/assigned/accepted: já em andamento, nada a fazer aqui
  }

  const created = await routeConversationToQueue(conversationId, departmentId);
  if (!created) return;

  const config = await getDepartmentQueueConfig(departmentId);
  if (config?.routingMode === "client-selection") {
    await sendSelectionGreeting(created.queueId);
  } else {
    await distributeConversation(created.queueId);
  }
}

function toDate(timestamp: string): Date {
  const n = Number(timestamp);
  if (Number.isFinite(n) && n > 0) return new Date(n * 1000);
  return new Date();
}

const MEDIA_PUSH_LABELS: Record<string, string> = {
  image: "Imagem",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Contato compartilhado",
};
