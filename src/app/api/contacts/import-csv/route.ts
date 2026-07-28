import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { importContactsCsv } from "@/server/contacts";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ csvText: z.string().min(1) });

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await importContactsCsv(session.organizationId, body.data.csvText);
  return Response.json(result);
});
