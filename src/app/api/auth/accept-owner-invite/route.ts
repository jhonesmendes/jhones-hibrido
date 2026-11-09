import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { logAudit } from "@/server/auth/audit";
import { resolveMembership } from "@/server/auth/on-signup";
import {
  claimOwnerInvite,
  normalizeEmail,
  OwnerInviteError,
  releaseOwnerInvite,
} from "@/server/auth/owner-invite";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

/**
 * Cria a conta do PROPRIETÁRIO a partir do convite da instalação (spec 009).
 *
 * Ordem: reserva o convite (atômico) → cria a conta pelo caminho interno (o
 * hook `onUserCreated` cria a organização e o deixa como owner) → confere a
 * membership. Se a conta não sair, a reserva é desfeita para o link valer de
 * novo; se sair sem ser dono (corrida improvável), a conta é removida.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const email = normalizeEmail(body.data.email);

  let invite;
  try {
    invite = await claimOwnerInvite(body.data.token, email);
  } catch (err) {
    if (err instanceof OwnerInviteError) {
      return apiError(err.code === "org_exists" ? 409 : 422, err.code, err.message);
    }
    throw err;
  }

  let signUpResponse: Response;
  try {
    signUpResponse = await runInternalSignup(() =>
      getAuth().api.signUpEmail({
        body: { name: body.data.name, email, password: body.data.password },
        asResponse: true,
      })
    );
  } catch (err) {
    await releaseOwnerInvite(invite.id);
    const message = err instanceof Error ? err.message : "Não foi possível criar a conta";
    return apiError(422, "signup_failed", message);
  }
  if (!signUpResponse.ok) {
    await releaseOwnerInvite(invite.id);
    const data = (await signUpResponse.json().catch(() => null)) as { message?: string } | null;
    return apiError(
      signUpResponse.status,
      "signup_failed",
      data?.message ?? "Não foi possível criar a conta"
    );
  }

  const { user } = (await signUpResponse.json()) as { user: { id: string } };
  const membership = await resolveMembership(user.id);
  if (!membership || membership.role !== "owner") {
    await getDb()
      .delete(schema.user)
      .where(eq(schema.user.id, user.id))
      .catch((e) => console.error("[accept-owner-invite] falha ao limpar conta:", e));
    return apiError(409, "org_exists", "Esta instância já tem proprietário");
  }

  if (invite.organizationName) {
    await getDb()
      .update(schema.organization)
      .set({ name: invite.organizationName })
      .where(eq(schema.organization.id, membership.organizationId));
  }
  await logAudit({
    organizationId: membership.organizationId,
    memberId: membership.memberId,
    action: "owner_invite.used",
    resource: "owner_invite",
    req,
  });

  const res = Response.json({ ok: true }, { status: 201 });
  for (const cookie of signUpResponse.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
