import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  serializeTemplate,
  TemplateError,
  templateErrorStatus,
  updateTemplateAssignment,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  departmentId: z.string().trim().min(1).nullable(),
});

/** Reatribui o departamento do modelo — metadado local, sem chamada à Meta,
 * então pode mudar a qualquer momento (mesmo com o modelo já aprovado). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin reatribuem modelos");
  }
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    const template = await updateTemplateAssignment(
      session.organizationId,
      id,
      body.data.departmentId
    );
    return Response.json({ template: serializeTemplate(template) });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }
});
