import { getLiveStatus, getSocket } from "@/server/baileys/manager";

export class BaileysSendError extends Error {
  code: "not_connected" | "recipient_not_found" | "send_failed";
  constructor(code: BaileysSendError["code"], message: string) {
    super(message);
    this.name = "BaileysSendError";
    this.code = code;
  }
}

/**
 * Resuelve el JID real del destinatario contra los servidores de WhatsApp
 * (`onWhatsApp`) en vez de asumir `${phone}@s.whatsapp.net` a ciegas. Esto
 * es necesario porque WhatsApp resuelve del lado del servidor casos donde el
 * número guardado no coincide byte a byte con el JID registrado (p. ej. el
 * "nono dígito" de los celulares de Brasil) — enviar al JID crudo en esos
 * casos falla en silencio (Baileys no lanza error; el mensaje simplemente
 * nunca llega). Si el número no existe en WhatsApp, falla explícito en vez
 * de fingir un envío exitoso.
 */
async function resolveJid(
  sock: NonNullable<ReturnType<typeof getSocket>>,
  phone: string
): Promise<string> {
  const results = await sock.onWhatsApp(`${phone}@s.whatsapp.net`);
  const match = results?.find((r) => r.exists);
  if (!match) {
    throw new BaileysSendError(
      "recipient_not_found",
      "Este número não tem WhatsApp (ou o motor ainda está sincronizando — tente de novo em alguns segundos)"
    );
  }
  return match.jid;
}

/** Envía texto libre por el motor nativo; devuelve el ID del mensaje. */
export async function sendText(
  organizationId: string,
  phone: string,
  text: string
): Promise<string> {
  const sock = getSocket(organizationId);
  const live = await getLiveStatus(organizationId);
  // No basta con que exista un socket: puede estar "connecting" (pareo aún
  // no completado) — ahí `sock.sendMessage` quedaría esperando en vano.
  if (!sock || live.status !== "connected") {
    throw new BaileysSendError(
      "not_connected",
      "Não há canal não oficial conectado"
    );
  }

  try {
    const jid = await resolveJid(sock, phone);
    const result = await sock.sendMessage(jid, { text });
    if (!result?.key.id) {
      throw new BaileysSendError(
        "send_failed",
        "O WhatsApp não devolveu o ID da mensagem"
      );
    }
    return result.key.id;
  } catch (err) {
    if (err instanceof BaileysSendError) throw err;
    throw new BaileysSendError(
      "send_failed",
      err instanceof Error ? err.message : "Falha ao enviar a mensagem"
    );
  }
}
