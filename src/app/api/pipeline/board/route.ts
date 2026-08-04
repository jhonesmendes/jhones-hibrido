import { asc, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/** Datos completos del kanban: etapas ordenadas + tarjetas con su contacto. */
export const GET = withAuth(async (session) => {
  const db = getDb();

  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, session.organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  // Um contato pode ter mais de uma conversa (uma por canal — ver
  // ConversationChannel em ingest.ts); o card do lead só precisa de UMA
  // pra linkar "abrir conversa" — a mais recentemente ativa. Subquery
  // escalar em vez de LEFT JOIN pra não duplicar o card por conversa.
  const conversationIdSql = sql<string | null>`(
    select c.id from conversation c
    where c.contact_id = ${schema.contact.id} and c.is_test = false
    order by coalesce(c.last_message_at, c.created_at) desc
    limit 1
  )`;

  const leads = await db
    .select({
      lead: schema.lead,
      contact: schema.contact,
      conversationId: conversationIdSql,
    })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .where(scoped(schema.lead.organizationId, session.organizationId))
    .orderBy(asc(schema.lead.position));

  return Response.json({
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      kind: s.kind,
    })),
    leads: leads.map((r) => ({
      id: r.lead.id,
      stageId: r.lead.stageId,
      position: r.lead.position,
      lastActivityAt: r.lead.lastActivityAt?.toISOString() ?? null,
      contact: {
        id: r.contact.id,
        name: r.contact.name,
        phone: r.contact.phone,
      },
      conversationId: r.conversationId,
    })),
  });
});
