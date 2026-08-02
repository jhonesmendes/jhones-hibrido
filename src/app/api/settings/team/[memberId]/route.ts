import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { logAudit } from "@/server/auth/audit";
import { memberUpdateErrorStatus, MemberUpdateError, updateMember } from "@/server/auth/member-management";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ memberId: string }> };

const channelAccessSchema = z.object({
  canView: z.boolean(),
  canSend: z.boolean(),
});

const patchSchema = z.object({
  role: z.enum(["owner", "admin", "agent"]).optional(),
  isActive: z.boolean().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  channels: z
    .object({
      official: channelAccessSchema.optional(),
      unofficial: channelAccessSchema.optional(),
    })
    .optional(),
  agentProfileId: z.string().trim().min(1).nullable().optional(),
});

/** Alteração administrativa de membro (US2): papel, status, permissões, canais. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam membros");
  }
  const { memberId } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  try {
    await updateMember(session.organizationId, memberId, session.role, body.data);
  } catch (err) {
    if (err instanceof MemberUpdateError) {
      return apiError(memberUpdateErrorStatus(err), err.code, err.message);
    }
    throw err;
  }

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.role_changed",
    resource: "member",
    resourceId: memberId,
    req,
    metadata: { patch: body.data },
  });

  return Response.json({ ok: true });
});
