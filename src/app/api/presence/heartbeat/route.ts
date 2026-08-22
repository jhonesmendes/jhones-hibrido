import { withAuth } from "@/lib/api";
import { touchPresence } from "@/server/presence/status";

export const dynamic = "force-dynamic";

/** Sinal de atividade do navegador (ver `presence-heartbeat.tsx`) — tira o
 * membro de "away"/"offline" de volta pra "online" automaticamente, sem
 * mexer em "busy" (estado manual). Chamado periodicamente enquanto a aba
 * está visível e o usuário interagiu recentemente. */
export const POST = withAuth(async (session) => {
  await touchPresence(session.memberId);
  return Response.json({ ok: true });
});
