import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { getAuth, runInternalSignup } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import {
  checkInviteToken,
  consumeInviteToken,
  InviteConsumeError,
} from "@/server/auth/invite-tokens";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const CONSUME_ERROR_MESSAGE: Record<InviteConsumeError["code"], string> = {
  invalid: "Convite inválido",
  expired: "Convite expirado",
  used: "Convite já utilizado",
  email_mismatch: "Este convite é restrito a outro e-mail",
};

/**
 * Cria a conta a partir de um convite (US3, FR-012) — não passa pelo gate de
 * registro público fechado (`runInternalSignup`), e loga a pessoa
 * automaticamente encaminhando os cookies de sessão que o Better Auth gera.
 */
export async function POST(req: Request) {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  // Falha rápido no caso comum (token já usado/expirado) antes de criar a
  // conta no Better Auth — evita o caso órfão (user sem member) que só a
  // corrida genuína ainda pode produzir (ver catch abaixo).
  const check = await checkInviteToken(body.data.token);
  if (!check.ok) {
    return apiError(422, check.code, CONSUME_ERROR_MESSAGE[check.code]);
  }
  if (check.email && check.email !== body.data.email) {
    return apiError(422, "email_mismatch", CONSUME_ERROR_MESSAGE.email_mismatch);
  }

  const auth = getAuth();
  let signUpResponse: Response;
  try {
    signUpResponse = await runInternalSignup(() =>
      auth.api.signUpEmail({
        body: { name: body.data.name, email: body.data.email, password: body.data.password },
        asResponse: true,
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível criar a conta";
    if (/exist/i.test(message)) {
      return apiError(409, "duplicate", "Já existe uma conta com esse e-mail");
    }
    return apiError(422, "invalid", message);
  }

  if (!signUpResponse.ok) {
    const data = (await signUpResponse.json().catch(() => null)) as {
      message?: string;
    } | null;
    return apiError(
      signUpResponse.status,
      "signup_failed",
      data?.message ?? "Não foi possível criar a conta"
    );
  }
  const { user } = (await signUpResponse.json()) as { user: { id: string } };

  try {
    const { organizationId, memberId } = await consumeInviteToken(
      body.data.token,
      user.id,
      body.data.email
    );
    await logAudit({
      organizationId,
      memberId,
      action: "invite.used",
      resource: "invite_token",
      req,
    });
  } catch (err) {
    if (err instanceof InviteConsumeError) {
      // Corrida genuína (dois aceites do mesmo token quase simultâneos):
      // a conta do Better Auth já foi criada antes de sabermos que o
      // convite tinha acabado de ser consumido por outra requisição.
      // Best-effort: remove o user órfão em vez de deixar uma conta sem
      // organização (cascade cuida de account/session).
      await getDb()
        .delete(schema.user)
        .where(eq(schema.user.id, user.id))
        .catch((cleanupErr) =>
          console.error("[accept-invite] falha ao limpar user órfão:", cleanupErr)
        );
      return apiError(422, err.code, CONSUME_ERROR_MESSAGE[err.code]);
    }
    throw err;
  }

  const res = Response.json({ ok: true }, { status: 201 });
  for (const cookie of signUpResponse.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
