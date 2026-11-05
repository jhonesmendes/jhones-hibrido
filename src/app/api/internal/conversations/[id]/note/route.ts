import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { addConversationNote, TransferError } from "@/server/inbox/transfer";
import { resolveInternalCaller } from "@/server/integrations/internal-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ note: z.string().trim().min(1).max(1000) });

/** A automação grava uma nota nas observações do contato da conversa. */
export async function POST(req: Request, ctx: Params) {
  const caller = await resolveInternalCaller(req);
  if (caller instanceof Response) return caller;

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { id } = await ctx.params;

  try {
    await addConversationNote(caller.organizationId, id, body.data.note);
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof TransferError) return apiError(404, err.code, err.message);
    throw err;
  }
}
