import { desc } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listMemberDepartments } from "@/server/settings/departments";
import {
  createTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

/** Owner/admin veem todos os modelos da org (gestão em Configurações). Um
 * agente só vê modelos sem departamento (uso geral) + os dos departamentos
 * dele — senão o seletor de "enviar modelo" no inbox mostraria modelos de
 * outras equipes que ele nem deveria usar. */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const templates = await db
    .select()
    .from(schema.template)
    .where(scoped(schema.template.organizationId, session.organizationId))
    .orderBy(desc(schema.template.createdAt));

  if (session.role === "owner" || session.role === "admin") {
    return Response.json({ templates: templates.map(serializeTemplate) });
  }

  const myDepartments = await listMemberDepartments(session.memberId);
  const myDepartmentIds = new Set(myDepartments.map((d) => d.id));
  const visible = templates.filter(
    (t) => !t.departmentId || myDepartmentIds.has(t.departmentId)
  );
  return Response.json({ templates: visible.map(serializeTemplate) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  language: z.string().trim().min(2).max(10),
  category: z.enum(["UTILITY", "MARKETING"]),
  body: z.string().trim().min(1).max(1024),
  credentialId: z.string().trim().min(1),
  departmentId: z.string().trim().min(1).nullable().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin criam modelos");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  try {
    const template = await createTemplate(session.organizationId, body.data);
    return Response.json(
      { template: serializeTemplate(template) },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
