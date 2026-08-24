import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { phoneSchema } from "@/lib/phone-schema";
import { resolvePermissions } from "@/lib/auth/require-permission";
import {
  getMemberName,
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
  z.object({
    contactId: z.string().min(1),
    // Confirma que quer assumir uma conversa já atribuída a outro agente
    // (ver fluxo de "requiresClaim" abaixo) — sem isso, o pedido nunca
    // rouba a conversa de quem já é dono.
    claim: z.boolean().optional(),
  }),
  z.object({
    phone: phoneSchema,
    name: z.string().trim().max(120).optional(),
    claim: z.boolean().optional(),
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

  // Escopado ao departamento ATIVO de quem está chamando (não a org
  // inteira) — sem isso, um contato que já tinha conversa em outro
  // departamento devolvia essa conversa alheia, que a lista (filtrada
  // estrito por departamento — ver listConversations) nunca ia mostrar pra
  // quem chamou: a chamada "funcionava" mas a tela ficava em branco. Visão
  // consolidada do owner (sem departamento ativo) mantém o comportamento
  // antigo — qualquer departamento serve.
  const activeDepartmentId = session.activeDepartmentId ?? null;

  // Um contato pode ter mais de uma conversa (uma por canal — ver
  // ConversationChannel). "Iniciar conversa" sem escolher canal explícito
  // abre a mais recente já existente NESTE departamento; só cria uma nova
  // (no canal do departamento ativo, ou o padrão da organização se o
  // departamento não tiver número próprio) se o contato nunca conversou
  // ainda por nenhum canal deste departamento.
  let conversation = await getMostRecentConversationForContact(
    session.organizationId,
    contact.id,
    activeDepartmentId
  );
  if (!conversation) {
    const channel = await resolveDefaultChannelForNewConversation(
      session.organizationId,
      activeDepartmentId
    );
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
      activeDepartmentId
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

  // Já tem dono e não é quem está chamando: sem conversations:view_all,
  // devolver a conversa direto significaria abrir algo que a lista de quem
  // chamou nunca mostra (mesma tela em branco do bug de departamento) — em
  // vez disso, avisa quem é o dono atual e só reatribui se o pedido veio
  // com `claim: true` (confirmação explícita, ver diálogo no inbox).
  if (
    conversation.assignedTo !== null &&
    conversation.assignedTo !== session.memberId
  ) {
    const effective = await resolvePermissions(session.memberId, session.role);
    if (!effective.has("conversations:view_all")) {
      if (!body.data.claim) {
        const ownerName = await getMemberName(conversation.assignedTo);
        return Response.json({
          conversation: serializeConversation(conversation, contact),
          requiresClaim: true,
          currentOwner: { memberId: conversation.assignedTo, name: ownerName },
        });
      }
      const updated = await updateConversation(session.organizationId, conversation.id, {
        assignedTo: session.memberId,
      });
      if (updated) conversation = updated;
    }
  }

  // Sempre atribui a quem iniciou — "iniciar conversa" é uma reivindicação
  // explícita de dono. Sem isso, quem tem conversations:view_all cria a
  // conversa com assignedTo=null e, num departamento com fila ativa, a
  // resposta do cliente é tratada como "sem dono" e vai pra fila em vez de
  // cair como mensagem não lida na conversa que o agente já tinha aberto
  // (ver o mesmo guard em src/server/inbox/ingest.ts). Também resolve o
  // caso original: sem view_all, assignedTo=null some da lista de "minhas
  // conversas" pro próprio criador.
  if (conversation.assignedTo === null) {
    const updated = await updateConversation(session.organizationId, conversation.id, {
      assignedTo: session.memberId,
    });
    if (updated) conversation = updated;
  }

  return Response.json(
    { conversation: serializeConversation(conversation, contact) },
    { status: 201 }
  );
});
