import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { withAuth, parseBody } from "@/lib/api";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  await db
    .insert(schema.pushSubscription)
    .values({
      id: newId("pushSubscription"),
      organizationId: session.organizationId,
      memberId: session.memberId,
      endpoint: body.data.endpoint,
      p256dh: body.data.keys.p256dh,
      auth: body.data.keys.auth,
    })
    .onConflictDoUpdate({
      target: schema.pushSubscription.endpoint,
      set: {
        organizationId: session.organizationId,
        memberId: session.memberId,
        p256dh: body.data.keys.p256dh,
        auth: body.data.keys.auth,
      },
    });

  return Response.json({ ok: true });
});
