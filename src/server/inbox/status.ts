import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import type { WebhookStatus } from "@/server/inbox/webhook";

/** Ordem monotônica de estados: nunca regredir (um delivered tardio não sobrescreve read). */
const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export function isUpgrade(current: string, next: string): boolean {
  if (next === "failed") return current !== "failed";
  const c = STATUS_RANK[current];
  const n = STATUS_RANK[next];
  if (c === undefined || n === undefined) return false;
  return n > c;
}

export async function applyStatusUpdate(
  organizationId: string,
  status: WebhookStatus
): Promise<void> {
  const next = status.status;
  if (!(next in STATUS_RANK) && next !== "failed") return; // status desconhecido

  const db = getDb();
  const rows = await db
    .select({
      id: schema.message.id,
      conversationId: schema.message.conversationId,
      status: schema.message.status,
    })
    .from(schema.message)
    .where(
      and(
        eq(schema.message.organizationId, organizationId),
        eq(schema.message.waMessageId, status.id)
      )
    )
    .limit(1);
  const msg = rows[0];
  if (!msg) return;
  if (!isUpgrade(msg.status, next)) return;

  const firstError = status.errors?.[0];
  const error =
    next === "failed"
      ? [
          firstError?.code ? `[${firstError.code}]` : null,
          firstError?.message ?? firstError?.title ?? "Falha no envio",
          firstError?.error_data?.details ?? null,
        ]
          .filter(Boolean)
          .join(" — ")
      : null;

  if (next === "failed") {
    // A mensagem que a Meta mostra (ex.: "Something went wrong") costuma ser
    // genérica demais — o payload cru às vezes tem mais pista no error_data.
    console.error(`[whatsapp] mensagem falhou — wa_message_id=${status.id}`, status.errors);
  }

  await db
    .update(schema.message)
    .set({ status: next as MessageStatus, error })
    .where(eq(schema.message.id, msg.id));

  publish(organizationId, {
    type: "message.status",
    data: {
      conversationId: msg.conversationId,
      messageId: msg.id,
      status: next,
    },
  });
}
