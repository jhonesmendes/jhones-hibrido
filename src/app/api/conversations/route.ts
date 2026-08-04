import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { resolvePermissions } from "@/lib/auth/require-permission";
import {
  getMostRecentConversationForContact,
  listConversations,
  serializeConversation,
  updateConversation,
} from "@/server/inbox/queries";
import {
  getOrCreateContact,
  getOrCreateConversation,
  resolveDefaultChannelForNewConversation,
} from "@/server/inbox/ingest";
import { logTrace } from "@/server/observability/trace";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const sinceParam = url.searchParams.get("since");
  const since = sinceParam ? new Date(sinceParam) : undefined;

  // Sem conversations:view_all, só vê as conversas atribuídas a si (FR-007)
  // — inclusive owner, se abriu mão dessa permissão para si mesmo. Pertencer
  // ao departamento do número NÃO basta sozinho (ver comentário em
  // listConversations).
  let assignedToFilter: string | undefined;
  const effective = await resolvePermissions(session.memberId, session.role);
  if (!effective.has("conversations:view_all")) {
    assignedToFilter = session.memberId;
  }

  const conversations = await listConversations(
    session.organizationId,
    since && !Number.isNaN(since.getTime()) ? since : undefined,
    assignedToFilter,
    session.activeDepartmentId ?? undefined
  );
  return Response.json({ conversations });
});

const createSchema = z.union([
  z.object({ contactId: z.string().min(1) }),
  z.object({
    phone: z
      .string()
      .trim()
      .regex(/^\d{7,15}$/, "Telefone em dígitos, com código do país (ex.: 5511912345678)"),
    name: z.string().trim().max(120).optional(),
  }),
]);

/**
 * Cria (ou encontra) a conversa de um contato — atalho "iniciar conversa"
 * do inbox e do cadastro. Idempotente: reusa os helpers do ingest.
 */
export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  let contact: typeof schema.contact.$inferSelect;

  if ("contactId" in body.data) {
    const rows = await db
      .select()
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          session.organizationId,
          eq(schema.contact.id, body.data.contactId)
        )
      )
      .limit(1);
    if (!rows[0]) return apiError(404, "not_found", "Contato não encontrado");
    contact = rows[0];
  } else {
    const result = await getOrCreateContact(
      session.organizationId,
      body.data.phone,
      body.data.name ?? null
    );
    contact = result.contact;
  }

  // Um contato pode ter mais de uma conversa (uma por canal — ver
  // ConversationChannel). "Iniciar conversa" sem escolher canal explícito
  // abre a mais recente já existente; só cria uma nova (no canal padrão
  // da organização) se o contato nunca conversou por nenhum canal ainda.
  let conversation = await getMostRecentConversationForContact(
    session.organizationId,
    contact.id
  );
  if (!conversation) {
    const channel = await resolveDefaultChannelForNewConversation(session.organizationId);
    if (!channel) {
      return apiError(
        422,
        "no_channel_connected",
        "Nenhum canal de WhatsApp conectado — conecte um em Configurações → Canais"
      );
    }
    conversation = await getOrCreateConversation(
      session.organizationId,
      contact.id,
      channel,
      session.activeDepartmentId
    );
    await logTrace({
      organizationId: session.organizationId,
      conversationId: conversation.id,
      type: "conversation.started_by_agent",
      channel: channel.type,
      channelId:
        channel.type === "official" ? channel.metaCredentialId : channel.unofficialChannelId,
      memberId: session.memberId,
      detail: { contactId: contact.id },
    });
  }

  // Sem isso, uma conversa criada manualmente por quem não tem
  // conversations:view_all nasce com assignedTo=null e desaparece pro
  // próprio criador (o filtro de "minhas conversas" em GET não bate com
  // NULL) — a UI mostra "criei, mas não abre". Quem já tem view_all
  // (inclusive owner, por padrão) não precisa: já enxerga qualquer
  // conversa sem dono.
  if (conversation.assignedTo === null) {
    const effective = await resolvePermissions(session.memberId, session.role);
    if (!effective.has("conversations:view_all")) {
      const updated = await updateConversation(session.organizationId, conversation.id, {
        assignedTo: session.memberId,
      });
      if (updated) conversation = updated;
    }
  }

  return Response.json(
    { conversation: serializeConversation(conversation, contact) },
    { status: 201 }
  );
});
