import type { Contact, WASocket } from "@whiskeysockets/baileys";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ensureBrNinthDigit } from "@/lib/utils";
import { publish } from "@/server/events/bus";

function jidToPhone(jid: string): string {
  return ensureBrNinthDigit(jid.replace(/:\d+/, "").replace(/@.*$/, ""));
}

/**
 * Sincroniza o nome salvo na agenda do telefone (`Contact.name` do Baileys —
 * distinto do `pushName`, que é o nome que o próprio contato escolheu pra si)
 * pros contatos que JÁ existem no CRM. Nunca cria contato novo a partir da
 * agenda inteira do telefone (fora de escopo — o CRM só conhece quem já
 * conversou) nem sobrescreve um nome que o operador editou manualmente: só
 * atualiza quando o nome salvo hoje ainda é o próprio telefone (nunca foi
 * customizado), mesma filosofia de `getOrCreateContact` (reactivar sem
 * pisar o nome editado).
 */
export async function syncContactNames(
  organizationId: string,
  sock: WASocket,
  contacts: Partial<Contact>[]
): Promise<void> {
  const db = getDb();
  for (const c of contacts) {
    const name = c.name?.trim();
    if (!name || !c.id) continue;

    const jid = c.id.endsWith("@lid")
      ? await sock.signalRepository.lidMapping.getPNForLID(c.id)
      : c.id;
    if (!jid) continue;

    const phone = jidToPhone(jid);
    const updated = await db
      .update(schema.contact)
      .set({ name, updatedAt: new Date() })
      .where(
        and(
          eq(schema.contact.organizationId, organizationId),
          eq(schema.contact.phone, phone),
          eq(schema.contact.name, phone)
        )
      )
      .returning({ id: schema.contact.id });
    if (!updated[0]) continue;

    const convRows = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, organizationId),
          eq(schema.conversation.contactId, updated[0].id)
        )
      )
      .limit(1);
    const conv = convRows[0];
    if (conv) {
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conv.id } },
      });
    }
  }
}
