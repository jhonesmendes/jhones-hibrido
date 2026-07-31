import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { withAuth, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ endpoint: z.string().trim().url() });

export const POST = withAuth(async (_session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  await db
    .delete(schema.pushSubscription)
    .where(eq(schema.pushSubscription.endpoint, body.data.endpoint));

  return Response.json({ ok: true });
});
