import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deleteTemplate,
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
  updateTemplate,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  category: z.enum(["UTILITY", "MARKETING"]),
  body: z.string().trim().min(1).max(1024),
});

/** Editar (rejeitado → tentar de novo, sem apagar e recriar). Nome/idioma
 * são fixos na Meta, só categoria e corpo mudam aqui. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin editam modelos");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    const template = await updateTemplate(session.organizationId, id, body.data);
    return Response.json({ template: serializeTemplate(template) });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});

export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin excluem modelos");
  }
  const { id } = await ctx.params;
  try {
    await deleteTemplate(session.organizationId, id);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
