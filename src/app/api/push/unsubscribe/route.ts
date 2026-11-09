import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { withAuth, parseBody } from "@/lib/api";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ endpoint: z.string().trim().url() });

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  await db
    .delete(schema.pushSubscription)
    // Só a inscrição do próprio membro: sem isso, qualquer usuário logado
    // que soubesse o endpoint removia o push de outra pessoa.
    .where(
      scoped(
        schema.pushSubscription.organizationId,
        session.organizationId,
        eq(schema.pushSubscription.memberId, session.memberId),
        eq(schema.pushSubscription.endpoint, body.data.endpoint)
      )
    );

  return Response.json({ ok: true });
});
