import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  listCredentialsByOrg,
  saveCredentials,
  tokenLast4,
} from "@/server/whatsapp/credentials";
import { subscribeAppToWaba, testConnection } from "@/server/whatsapp/connect";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

/** Lista todos os números oficiais da organização (v0.1: N por org).
 * Restrito a owner/admin — canais são configuração da organização, não
 * algo que um agente comum deva ver (token last4) nem gerenciar. */
export const GET = withAuth(async (session) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const rows = await listCredentialsByOrg(session.organizationId);
  return Response.json({
    numbers: rows.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      departmentId: c.departmentId,
      wabaId: c.wabaId,
      phoneNumberId: c.phoneNumberId,
      displayPhoneNumber: c.displayPhoneNumber,
      verifiedName: c.verifiedName,
      status: c.status,
      isActive: c.isActive,
      tokenLast4: tokenLast4(c.token),
    })),
  });
});

const postSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).optional(),
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Adiciona um novo número oficial: revalida contra a Meta, criptografa e
 * inscreve (mesmo fluxo do wizard original, agora sem substituir números
 * existentes — cada `phoneNumberId` é uma linha própria). */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const check = await testConnection(body.data.phoneNumberId, body.data.token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  const { id } = await saveCredentials({
    organizationId: session.organizationId,
    name: body.data.name,
    description: body.data.description ?? null,
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });

  // Best-effort: necessária no modo direto; o modo agência usa seu override.
  await subscribeAppToWaba(body.data.wabaId, body.data.token);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.connected",
    resource: "meta_credentials",
    resourceId: id,
    req,
  });

  return Response.json({
    ok: true,
    id,
    displayPhoneNumber: check.displayPhoneNumber,
  });
});
