import { asc, eq, sql } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { requirePermission, resolvePermissions } from "@/lib/auth/require-permission";
import { ensureDepartmentHasStages } from "@/server/pipeline/stage-templates";

export const dynamic = "force-dynamic";

/** Datos completos del kanban: etapas ordenadas + tarjetas con su contacto. */
export const GET = withAuth(async (session) => {
  await requirePermission(session, "pipeline:view");
  const db = getDb();

  // Sem departamento ativo (Visão consolidada, só owner) = sem filtro,
  // igual à Caixa de entrada. Com departamento ativo, filtro ESTRITO — sem
  // passe-livre pra etapa/lead sem departamento (mesma regra de
  // `listConversations`, ver comentário lá sobre o bug real que isso corrigiu).
  const activeDepartmentId = session.activeDepartmentId ?? null;
  if (activeDepartmentId) {
    // Departamento criado antes desta separação por departamento existir
    // (ou o clone na criação falhou) ainda não tem etapa própria — clona
    // sob demanda pra não mostrar um board vazio.
    await ensureDepartmentHasStages(session.organizationId, activeDepartmentId);
  }

  const stages = await db
    .select()
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        activeDepartmentId ? eq(schema.pipelineStage.departmentId, activeDepartmentId) : undefined
      )
    )
    .orderBy(asc(schema.pipelineStage.position));

  // Um contato pode ter mais de uma conversa (uma por canal — ver
  // ConversationChannel em ingest.ts); o card do lead só precisa de UMA
  // pra linkar "abrir conversa" — a mais recentemente ativa DENTRO do
  // mesmo departamento do lead (senão "abrir conversa" de um card de
  // Tecnologia podia abrir uma conversa de outro departamento). Subquery
  // escalar em vez de LEFT JOIN pra não duplicar o card por conversa.
  const conversationIdSql = sql<string | null>`(
    select c.id from conversation c
    where c.contact_id = ${schema.contact.id} and c.is_test = false
      and c.department_id is not distinct from ${schema.lead.departmentId}
    order by coalesce(c.last_message_at, c.created_at) desc
    limit 1
  )`;

  // Sem "Ver todas as conversas", o pipeline segue a mesma regra da caixa
  // de entrada (FR-007): só mostra leads de contatos com pelo menos uma
  // conversa atribuída a este membro — senão qualquer agente via o board
  // inteiro da organização, vazando conversas de outros atendentes.
  const effective = await resolvePermissions(session.memberId, session.role);
  const ownLeadsOnly = !effective.has("conversations:view_all")
    ? sql`exists (
        select 1 from conversation c2
        where c2.contact_id = ${schema.contact.id}
          and c2.is_test = false
          and c2.assigned_to = ${session.memberId}
      )`
    : undefined;

  const leads = await db
    .select({
      lead: schema.lead,
      contact: schema.contact,
      conversationId: conversationIdSql,
    })
    .from(schema.lead)
    .innerJoin(schema.contact, eq(schema.lead.contactId, schema.contact.id))
    .where(
      scoped(
        schema.lead.organizationId,
        session.organizationId,
        activeDepartmentId ? eq(schema.lead.departmentId, activeDepartmentId) : undefined,
        ownLeadsOnly
      )
    )
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
