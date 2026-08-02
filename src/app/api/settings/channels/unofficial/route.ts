import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  createUnofficialChannel,
  listUnofficialChannels,
} from "@/server/settings/unofficial-channels";
import { getLiveStatus } from "@/server/baileys/manager";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lista todos os canais não oficiais da organização (v0.1: N por org),
 * com o status ao vivo (cache em memória do manager) sobreposto ao status
 * persistido — o estado inicial chega aqui, a atualização ao vivo por SSE
 * (evento `channel.status`, já com `channelId`). Restrito a owner/admin. */
export const GET = withAuth(async (session) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const rows = await listUnofficialChannels(session.organizationId);
  const channels = await Promise.all(
    rows.map(async (r) => {
      const live = await getLiveStatus(r.id);
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        departmentId: r.departmentId,
        isActive: r.isActive,
        status: live.status,
        qrCode: live.qrCode,
        phoneNumber: live.phoneNumber ?? r.displayPhoneNumber,
      };
    })
  );
  return Response.json({ channels });
});

const postSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).optional(),
});

/** Cria a linha do canal — só isso, não conecta ainda (ver `[id]/connect`).
 * Separar os dois passos deixa o usuário nomear o canal antes do QR. */
export const POST = withAuth(async (session, req: Request) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return apiError(403, "forbidden", "Só owner/admin gerenciam canais");
  }
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const channel = await createUnofficialChannel(session.organizationId, {
    name: body.data.name,
    description: body.data.description ?? null,
  });

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "channel.connected",
    resource: "unofficial_channel",
    resourceId: channel.id,
    req,
  });

  return Response.json({ channel: { id: channel.id, name: channel.name } }, {
    status: 201,
  });
});
