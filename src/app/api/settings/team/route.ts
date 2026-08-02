import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { resolveChannelAccess, resolvePermissions } from "@/lib/auth/require-permission";

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as (keyof typeof PERMISSIONS)[];

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const members = await db
    .select({
      id: schema.member.id,
      role: schema.member.role,
      isActive: schema.member.isActive,
      agentProfileId: schema.member.agentProfileId,
      createdAt: schema.member.createdAt,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(scoped(schema.member.organizationId, session.organizationId));

  const detailed = await Promise.all(
    members.map(async (m) => {
      const [permissions, official, unofficial] = await Promise.all([
        resolvePermissions(m.id, m.role),
        resolveChannelAccess(m.id, m.role, "official"),
        resolveChannelAccess(m.id, m.role, "unofficial"),
      ]);
      return {
        id: m.id,
        role: m.role,
        isActive: m.isActive,
        agentProfileId: m.agentProfileId,
        name: m.name,
        email: m.email,
        createdAt: m.createdAt.toISOString(),
        permissions: Object.fromEntries(
          ALL_PERMISSIONS.map((p) => [p, permissions.has(p)])
        ),
        channels: { official, unofficial },
      };
    })
  );

  return Response.json({ members: detailed });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

/** Alta de cuenta de equipo (owner only): email + contraseña temporal (FR-061). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode criar contas");
  }
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const auth = getAuth();
  let newUserId: string;
  try {
    const result = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: {
          name: body.data.name,
          email: body.data.email,
          password: body.data.password,
        },
      })
    );
    newUserId = result.user.id;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Não foi possível criar a conta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Já existe uma conta com esse e-mail");
    }
    return apiError(422, "invalid", message);
  }

  const db = getDb();
  await db
    .insert(schema.member)
    .values({
      id: newId("organization"),
      organizationId: session.organizationId,
      userId: newUserId,
      role: "agent",
    })
    .onConflictDoNothing();

  return Response.json({ ok: true }, { status: 201 });
});
