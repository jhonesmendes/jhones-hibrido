import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createInviteToken } from "@/server/auth/invite-tokens";
import { logAudit } from "@/server/auth/audit";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

/** Lista convites pendentes (não usados) da organização (US3). */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.inviteToken.id,
      email: schema.inviteToken.email,
      role: schema.inviteToken.role,
      expiresAt: schema.inviteToken.expiresAt,
      createdAt: schema.inviteToken.createdAt,
    })
    .from(schema.inviteToken)
    .where(
      and(
        scoped(schema.inviteToken.organizationId, session.organizationId),
        isNull(schema.inviteToken.usedAt)
      )
    );

  const invites = rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    expired: r.expiresAt.getTime() < Date.now(),
  }));

  return Response.json({ invites });
});

const channelAccessSchema = z.object({
  canView: z.boolean(),
  canSend: z.boolean(),
});

const bodySchema = z.object({
  role: z.enum(["admin", "agent"]),
  email: z.string().trim().email().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  channels: z
    .object({
      official: channelAccessSchema.optional(),
      unofficial: channelAccessSchema.optional(),
    })
    .optional(),
  departmentId: z.string().trim().min(1).optional(),
  departmentRole: z.enum(["admin", "agent"]).optional(),
  expiresIn: z.enum(["24h", "7d", "30d"]),
});

/** Gera um link de convite (US3) — owner/admin. */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin convidam membros");
  }
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  if (body.data.departmentId) {
    const db = getDb();
    const rows = await db
      .select({ id: schema.department.id })
      .from(schema.department)
      .where(
        and(
          eq(schema.department.id, body.data.departmentId),
          scoped(schema.department.organizationId, session.organizationId)
        )
      )
      .limit(1);
    if (!rows[0]) {
      return apiError(404, "not_found", "Departamento não encontrado");
    }
  }

  const invite = await createInviteToken({
    organizationId: session.organizationId,
    role: body.data.role,
    email: body.data.email,
    permissions: body.data.permissions,
    channels: body.data.channels,
    departmentId: body.data.departmentId,
    departmentRole: body.data.departmentRole,
    expiresIn: body.data.expiresIn,
    createdBy: session.memberId,
  });

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "invite.created",
    resource: "invite_token",
    resourceId: invite.id,
    req,
    metadata: { role: body.data.role, expiresIn: body.data.expiresIn },
  });

  return Response.json(
    {
      url: `${getEnv().APP_BASE_URL}${invite.url}`,
      expiresAt: invite.expiresAt.toISOString(),
    },
    { status: 201 }
  );
});
