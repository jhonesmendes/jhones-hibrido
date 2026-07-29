import { and, eq, isNull } from "drizzle-orm";
import { apiError, withAuth } from "@/lib/api";
import { logAudit } from "@/server/auth/audit";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Revoga um convite pendente (owner/admin) — invalida o link sem apagar o histórico. */
export const DELETE = withAuth(
  async (session, req: Request, ctx: Params) => {
    if (session.role !== "owner" && session.role !== "admin") {
      return apiError(403, "forbidden", "Só owner/admin revogam convites");
    }
    const { id } = await ctx.params;
    const db = getDb();
    const updated = await db
      .update(schema.inviteToken)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.inviteToken.id, id),
          scoped(schema.inviteToken.organizationId, session.organizationId),
          isNull(schema.inviteToken.usedAt)
        )
      )
      .returning({ id: schema.inviteToken.id });

    if (updated.length === 0) {
      return apiError(404, "not_found", "Convite não encontrado ou já usado");
    }

    await logAudit({
      organizationId: session.organizationId,
      memberId: session.memberId,
      action: "invite.revoked",
      resource: "invite_token",
      resourceId: id,
      req,
    });

    return Response.json({ ok: true });
  }
);
