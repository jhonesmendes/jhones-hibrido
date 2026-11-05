import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { TransferError, transferConversationToDepartment } from "@/server/inbox/transfer";
import { resolveInternalCaller } from "@/server/integrations/internal-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    departmentId: z.string().trim().min(1).optional(),
    departmentName: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).max(120).nullish(),
    note: z.string().trim().min(1).max(1000).nullish(),
  })
  .refine((b) => Boolean(b.departmentId) !== Boolean(b.departmentName), {
    message: "Informe departmentId OU departmentName",
  });

/** A automação passa a conversa para um departamento humano. */
export async function POST(req: Request, ctx: Params) {
  const caller = await resolveInternalCaller(req);
  if (caller instanceof Response) return caller;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { departmentId, departmentName, reason, note } = body.data;
  const { id } = await ctx.params;

  try {
    const result = await transferConversationToDepartment({
      organizationId: caller.organizationId,
      conversationId: id,
      department: departmentId ? { id: departmentId } : { name: departmentName! },
      reason,
      note,
    });
    return Response.json({ success: true, conversationId: id, ...result });
  } catch (err) {
    if (err instanceof TransferError) return apiError(404, err.code, err.message);
    throw err;
  }
}
