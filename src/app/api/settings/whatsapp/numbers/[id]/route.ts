import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  deleteCredentialsById,
  getCredentialsById,
  saveCredentials,
  updateCredentialsMeta,
} from "@/server/whatsapp/credentials";
import { subscribeAppToWaba, testConnection } from "@/server/whatsapp/connect";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Departamento dono deste número (v0.1); null = sem departamento. */
  departmentId: z.string().trim().min(1).nullable().optional(),
  /** Reconexão: token novo para o MESMO número (wabaId/phoneNumberId
   * continuam os já salvos — não dá pra "mudar de número" editando). */
  token: z.string().trim().min(1).optional(),
});

/** Edita nome/descrição/ativação, ou reconecta com um token novo. Só owner/admin. */
export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const { id } = await params;
  const existing = await getCredentialsById(id, session.organizationId);
  if (!existing) return apiError(404, "not_found", "Número não encontrado");

  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  if (body.data.token) {
    const check = await testConnection(existing.phoneNumberId, body.data.token);
    if (!check.ok) {
      const status = check.code === "meta_unavailable" ? 503 : 422;
      return apiError(status, check.code, check.message);
    }
    await saveCredentials({
      organizationId: session.organizationId,
      wabaId: existing.wabaId,
      phoneNumberId: existing.phoneNumberId,
      token: body.data.token,
      displayPhoneNumber: check.displayPhoneNumber,
      verifiedName: check.verifiedName,
    });
    await subscribeAppToWaba(existing.wabaId, body.data.token);
  }

  const { token: _token, ...meta } = body.data;
  if (Object.keys(meta).length > 0) {
    await updateCredentialsMeta(id, session.organizationId, meta);
  }

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.connected",
    resource: "meta_credentials",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const { id } = await params;
  const existing = await getCredentialsById(id, session.organizationId);
  if (!existing) return apiError(404, "not_found", "Número não encontrado");

  await deleteCredentialsById(id, session.organizationId);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.disconnected",
    resource: "meta_credentials",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});
