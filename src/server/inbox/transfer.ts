import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import { routeQueueMessage } from "@/server/inbox/ingest";
import { getConversation, serializeConversation } from "@/server/inbox/queries";
import { logTrace } from "@/server/observability/trace";
import { findActiveQueueEntry } from "@/server/queue/manager";

/** Mesmo limite de `contact.notes` na API de contatos. */
export const MAX_CONTACT_NOTES_LENGTH = 4000;

export class TransferError extends Error {
  constructor(public readonly code: "not_found" | "department_not_found", message: string) {
    super(message);
    this.name = "TransferError";
  }
}

/** Acrescenta a nota da automação; passando do limite, sai o trecho mais antigo. */
export function appendContactNote(existing: string | null, note: string, at: Date): string {
  const line = `[${at.toISOString().slice(0, 16).replace("T", " ")} UTC] ${note}`;
  const merged = existing?.trim() ? `${existing.trim()}\n${line}` : line;
  return merged.length > MAX_CONTACT_NOTES_LENGTH ? merged.slice(-MAX_CONTACT_NOTES_LENGTH) : merged;
}

async function appendNoteToContact(
  organizationId: string,
  contact: { id: string; notes: string | null },
  note: string,
  now: Date
): Promise<void> {
  await getDb()
    .update(schema.contact)
    .set({ notes: appendContactNote(contact.notes, note, now), updatedAt: now })
    .where(and(eq(schema.contact.organizationId, organizationId), eq(schema.contact.id, contact.id)));
}

/** Grava a nota da automação nas observações do contato da conversa. */
export async function addConversationNote(
  organizationId: string,
  conversationId: string,
  note: string
): Promise<void> {
  const row = await getConversation(organizationId, conversationId);
  if (!row) throw new TransferError("not_found", "Conversa não encontrada");
  await appendNoteToContact(organizationId, row.contact, note, new Date());
}

/**
 * Passa a conversa de uma automação para um departamento humano.
 *
 * Sem fila no destino, a conversa fica no departamento (`departmentPinnedAt`
 * impede o ingest de devolvê-la ao departamento do canal) e sem responsável.
 * Com fila, entra nela: quem define o departamento é o aceite do agente, como
 * em qualquer conversa roteada. Se já está com alguém desse departamento,
 * continua com essa pessoa.
 */
export async function transferConversationToDepartment(input: {
  organizationId: string;
  conversationId: string;
  department: { id: string } | { name: string };
  reason?: string | null;
  note?: string | null;
}): Promise<{ departmentId: string; departmentName: string; queued: boolean }> {
  const { organizationId, conversationId, department } = input;
  const db = getDb();
  const row = await getConversation(organizationId, conversationId);
  if (!row) throw new TransferError("not_found", "Conversa não encontrada");
  const { conversation, contact } = row;

  const [target] = await db
    .select({
      id: schema.department.id,
      name: schema.department.name,
      queueEnabled: schema.department.queueEnabled,
    })
    .from(schema.department)
    .where(
      and(
        eq(schema.department.organizationId, organizationId),
        eq(schema.department.isActive, true),
        "id" in department
          ? eq(schema.department.id, department.id)
          : eq(schema.department.name, department.name)
      )
    )
    .limit(1);
  if (!target) throw new TransferError("department_not_found", "Departamento não encontrado");

  const now = new Date();
  const keepsAssignee = conversation.departmentId === target.id && Boolean(conversation.assignedTo);
  const queued = target.queueEnabled && !keepsAssignee && contact.kind !== "group";

  await db
    .update(schema.conversation)
    .set({
      departmentId: queued ? null : target.id,
      departmentPinnedAt: queued ? null : now,
      assignedTo: keepsAssignee ? conversation.assignedTo : null,
      // Mesmo sinal da escalada pelo agente de IA: a conversa pede um humano.
      handoffAt: now,
      handoffReason: "modelo",
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    );

  if (input.note) {
    await appendNoteToContact(organizationId, contact, input.note, now);
  }

  if (queued && !(await findActiveQueueEntry(conversationId, target.id))) {
    await routeQueueMessage(conversationId, target.id, "");
  }

  await logTrace({
    organizationId,
    conversationId,
    type: "conversation.transferred",
    detail: {
      fromDepartmentId: conversation.departmentId,
      departmentId: target.id,
      queued,
      reason: input.reason ?? null,
      note: input.note ?? null,
    },
  });

  const updated = await getConversation(organizationId, conversationId);
  if (updated) {
    publish(organizationId, {
      type: "conversation.updated",
      data: { conversation: serializeConversation(updated.conversation, updated.contact) },
    });
  }

  return { departmentId: target.id, departmentName: target.name, queued };
}
