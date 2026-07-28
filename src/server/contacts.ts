import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { parseRecipientsCsv } from "@/lib/campaigns/csv";
import { getOrCreateContact } from "@/server/inbox/ingest";

export function serializeContact(c: typeof schema.contact.$inferSelect) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    notes: c.notes,
    archivedAt: c.archivedAt?.toISOString() ?? null,
  };
}

export async function getContactById(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

function csvVar(vars: Record<string, string>, key: string): string | undefined {
  const found = Object.keys(vars).find((k) => k.toLowerCase() === key);
  const value = found ? vars[found]?.trim() : undefined;
  return value || undefined;
}

export type ImportContactsResult = {
  imported: number;
  invalidRows: { line: number; reason: string }[];
};

/**
 * Importa contatos de um CSV `telefone,nome,notas` (reusa o parser de
 * Campanhas — telefone + colunas nomeadas). Contato existente (mesmo
 * telefone) não é duplicado: `getOrCreateContact` reusa a linha; nome/notas
 * só são sobrescritos quando a célula do CSV não está vazia — quem sobe o
 * CSV está editando de propósito, então aqui pode sobrescrever (diferente
 * da sincronização automática do nome da agenda do WhatsApp, que nunca
 * pisa um nome editado manualmente).
 */
export async function importContactsCsv(
  organizationId: string,
  csvText: string
): Promise<ImportContactsResult> {
  const { validRows, invalidRows } = parseRecipientsCsv(csvText);
  const db = getDb();

  let imported = 0;
  for (const row of validRows) {
    const name = csvVar(row.variables, "nome");
    const notes = csvVar(row.variables, "notas");
    const { contact } = await getOrCreateContact(organizationId, row.phone, name);

    const patch: { name?: string; notes?: string } = {};
    if (name) patch.name = name;
    if (notes) patch.notes = notes;
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.contact)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.contact.id, contact.id));
    }
    imported++;
  }

  return { imported, invalidRows };
}

/** Etapa actual del lead del contacto (si existe). */
export async function getContactStage(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select({ stage: schema.pipelineStage, lead: schema.lead })
    .from(schema.lead)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.lead.stageId, schema.pipelineStage.id)
    )
    .where(
      scoped(
        schema.lead.organizationId,
        organizationId,
        eq(schema.lead.contactId, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
