import { ingestInboundMessage } from "@/server/inbox/ingest";
import { getAdapter } from "@/lib/unofficial";
import type { UnofficialChannel } from "@/server/unofficial/channel";

/**
 * Ingesta de eventos del gateway NO oficial: normaliza con el adaptador
 * del proveedor y reutiliza el pipeline idempotente del inbox.
 */

/** Prefijo del ID para que jamás colisione con los `wamid.` de Meta. */
export function unofficialMessageId(
  provider: UnofficialChannel["provider"],
  providerMessageId: string
): string {
  return `unof:${provider}:${providerMessageId}`;
}

export async function processUnofficialWebhook(
  channel: UnofficialChannel,
  body: unknown
): Promise<void> {
  const adapter = getAdapter(channel.provider);
  const messages = adapter.parseWebhook(body);

  for (const m of messages) {
    if (!m.from) continue;
    await ingestInboundMessage({
      organizationId: channel.organizationId,
      from: m.from,
      profileName: m.fromMe ? null : m.pushName,
      waMessageId: unofficialMessageId(channel.provider, m.providerMessageId),
      type: m.type,
      text: m.text,
      timestamp: m.timestamp === null ? "" : String(m.timestamp),
      channel: "unofficial",
      fromMe: m.fromMe,
    });
  }
}
