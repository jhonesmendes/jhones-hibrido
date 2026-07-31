import { desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { serializeContact } from "@/server/contacts";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const includeArchived = url.searchParams.get("archived") === "true";

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        session.organizationId,
        // Grupos vivem só no Inbox — a página de Contatos é sobre leads
        // individuais (Foco Vertical), não threads coletivas.
        eq(schema.contact.kind, "individual"),
        q
          ? or(
              ilike(schema.contact.name, `%${q}%`),
              ilike(schema.contact.phone, `%${q}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(200);

  const contacts = rows
    .filter((c) => includeArchived || !c.archivedAt)
    .map(serializeContact);
  return Response.json({ contacts });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "Telefone em dígitos, com código do país (ex.: 5511912345678)"),
  reference: z.string().trim().max(200).optional(),
  comment: z.string().trim().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const inserted = await db
    .insert(schema.contact)
    .values({
      id: newId("contact"),
      organizationId: session.organizationId,
      name: body.data.name,
      phone: body.data.phone,
      reference: body.data.reference ?? null,
      comment: body.data.comment ?? null,
      notes: body.data.notes ?? null,
    })
    .onConflictDoNothing({
      target: [schema.contact.organizationId, schema.contact.phone],
    })
    .returning();
  if (!inserted[0]) {
    return apiError(409, "duplicate", "Já existe um contato com esse telefone");
  }
  return Response.json(
    { contact: serializeContact(inserted[0]) },
    { status: 201 }
  );
});
