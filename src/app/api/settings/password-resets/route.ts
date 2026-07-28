import { apiError, withAuth } from "@/lib/api";
import { listPendingResets } from "@/server/auth/password-reset";

export const dynamic = "force-dynamic";

/** Solicitações de redefinição de senha pendentes (owner only, FR-018). */
export const GET = withAuth(async (session) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário vê solicitações pendentes");
  }
  const pending = await listPendingResets(session.organizationId);
  return Response.json({ pending });
});
