import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { requirePermission } from "@/lib/auth/require-permission";
import {
  getContactById,
  getContactStage,
  serializeContact,
} from "@/server/contacts";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contato não encontrado");
  // ?departmentId= vem de quem já sabe a conversa específica (painel de
  // detalhes do inbox) — pega o lead DESSE departamento, não um qualquer
  // (contato pode ter card em mais de um). Sem o param, usa o departamento
  // ativo da sessão (ex.: tela de Contatos, sem conversa em foco).
  const departmentIdParam = new URL(req.url).searchParams.get("departmentId");
  const departmentId = departmentIdParam !== null ? departmentIdParam || null : session.activeDepartmentId;
  const stageRow = await getContactStage(session.organizationId, id, departmentId);
  return Response.json({
    contact: serializeContact(contact),
    stage: stageRow
      ? {
          id: stageRow.stage.id,
          name: stageRow.stage.name,
          position: stageRow.stage.position,
          kind: stageRow.stage.kind,
        }
      : null,
    lead: stageRow ? { id: stageRow.lead.id } : null,
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  comment: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.name !== undefined) set.name = body.data.name;
  if (body.data.reference !== undefined) set.reference = body.data.reference;
  if (body.data.comment !== undefined) set.comment = body.data.comment;
  if (body.data.notes !== undefined) set.notes = body.data.notes;
  if (body.data.archived !== undefined) {
    set.archivedAt = body.data.archived ? new Date() : null;
  }

  const db = getDb();
  const updated = await db
    .update(schema.contact)
    .set(set)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        eq(schema.contact.id, id)
      )
    )
    .returning();
  if (!updated[0]) return apiError(404, "not_found", "Contato não encontrado");
  return Response.json({ contact: serializeContact(updated[0]) });
});

/** Exclui um contato de vez — pensado pra corrigir um cadastro errado
 * (número/nome digitado errado), não pra "limpar a base": leads e
 * conversas cascateiam pelo schema (contact_id → cascade); histórico de
 * campanha não cascateia de propósito — desvincula em vez de bloquear,
 * mesmo padrão já usado em deleteConversation. */
export const DELETE = withAuth(async (session, req: Request, ctx: Params) => {
  await requirePermission(session, "contacts:delete");
  const { id } = await ctx.params;

  const db = getDb();
  await db
    .update(schema.campaignRecipient)
    .set({ contactId: null })
    .where(eq(schema.campaignRecipient.contactId, id));

  const deleted = await db
    .delete(schema.contact)
    .where(
      scoped(schema.contact.organizationId, session.organizationId, eq(schema.contact.id, id))
    )
    .returning({ id: schema.contact.id });
  if (!deleted[0]) return apiError(404, "not_found", "Contato não encontrado");

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "contact.deleted",
    resource: "contact",
    resourceId: id,
    req,
  });

  return Response.json({ deleted: true });
});
