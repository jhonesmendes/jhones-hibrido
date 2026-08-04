import webpush from "web-push";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getVapidConfig } from "@/server/push/vapid";

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url: string;
  conversationId: string;
};

/** Envia a notificação só para as inscrições de UM membro (Sprint Q2: fila
 * de atendimento — "nova conversa pra você", diferente do broadcast de
 * organização usado hoje pelo restante do produto). Mesma lógica de
 * limpeza de inscrição morta (410/404) do `sendPushToOrganization`. */
export async function sendPushToMember(
  memberId: string,
  payload: PushPayload
): Promise<void> {
  const vapid = getVapidConfig();
  if (!vapid) return;

  const db = getDb();
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(eq(schema.pushSubscription.memberId, memberId));
  if (subs.length === 0) return;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(schema.pushSubscription)
            .where(eq(schema.pushSubscription.id, sub.id));
        } else {
          console.error("[push] falha ao enviar notificação para membro:", err);
        }
      }
    })
  );
}

/**
 * Envia a notificação para todas as inscrições da organização (todo membro
 * com push ativado recebe — não há "dono" de conversa hoje). Uma inscrição
 * que o navegador não reconhece mais (410 Gone/404) é removida; qualquer
 * outra falha é só logada — nunca derruba a ingestão da mensagem que
 * disparou a notificação.
 */
export async function sendPushToOrganization(
  organizationId: string,
  payload: PushPayload
): Promise<void> {
  const vapid = getVapidConfig();
  if (!vapid) return; // Web Push não configurado nesta instância — sem-op.

  const db = getDb();
  const subs = await db
    .select()
    .from(schema.pushSubscription)
    .where(scoped(schema.pushSubscription.organizationId, organizationId));
  if (subs.length === 0) return;

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(schema.pushSubscription)
            .where(eq(schema.pushSubscription.id, sub.id));
        } else {
          console.error("[push] falha ao enviar notificação:", err);
        }
      }
    })
  );
}
