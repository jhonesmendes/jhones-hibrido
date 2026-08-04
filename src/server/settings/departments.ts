import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export class DepartmentError extends Error {
  code: "duplicate_slug" | "not_found";
  constructor(code: DepartmentError["code"], message: string) {
    super(message);
    this.name = "DepartmentError";
    this.code = code;
  }
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type DepartmentRow = typeof schema.department.$inferSelect;

export async function listDepartments(
  organizationId: string
): Promise<DepartmentRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.department)
    .where(scoped(schema.department.organizationId, organizationId))
    .orderBy(schema.department.createdAt);
}

/** Departamentos aos quais um membro pertence (para o seletor de quem não é owner). */
export async function listMemberDepartments(
  memberId: string
): Promise<DepartmentRow[]> {
  const db = getDb();
  const rows = await db
    .select({ department: schema.department })
    .from(schema.memberDepartment)
    .innerJoin(
      schema.department,
      eq(schema.memberDepartment.departmentId, schema.department.id)
    )
    .where(eq(schema.memberDepartment.memberId, memberId));
  return rows.map((r) => r.department);
}

export async function createDepartment(
  organizationId: string,
  input: {
    name: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
  }
): Promise<DepartmentRow> {
  const db = getDb();
  const baseSlug = slugify(input.name) || "departamento";

  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const inserted = await db
      .insert(schema.department)
      .values({
        id: newId("department"),
        organizationId,
        name: input.name.trim(),
        slug,
        description: input.description ?? null,
        color: input.color ?? undefined,
        icon: input.icon ?? undefined,
      })
      .onConflictDoNothing({
        target: [schema.department.organizationId, schema.department.slug],
      })
      .returning();
    if (inserted[0]) return inserted[0];
  }
  throw new DepartmentError(
    "duplicate_slug",
    "Não foi possível gerar um identificador único para o departamento"
  );
}

/** Qualquer coluna editável do departamento — inclui fila/roteamento e
 * Modo B (Sprint Q). Campos estruturais (id, organizationId, slug,
 * createdAt) ficam de fora de propósito. */
type DepartmentPatch = Partial<
  Omit<
    typeof schema.department.$inferInsert,
    "id" | "organizationId" | "slug" | "createdAt" | "updatedAt"
  >
>;

export async function updateDepartment(
  id: string,
  organizationId: string,
  patch: DepartmentPatch
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.department)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(schema.department.id, id),
        scoped(schema.department.organizationId, organizationId)
      )
    );
}

/** Remoção definitiva. Tudo que aponta pro departamento (conversas, canais,
 * pipeline_stage, campanhas, kb_entry, template, member.active_department_id)
 * tem FK `ON DELETE SET NULL` — nada é apagado em cascata, só desvinculado. */
export async function deleteDepartment(
  id: string,
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.department)
    .where(
      and(
        eq(schema.department.id, id),
        scoped(schema.department.organizationId, organizationId)
      )
    );
}

export type DepartmentMemberRow = {
  memberId: string;
  role: "admin" | "agent";
  name: string;
  email: string;
};

export async function listDepartmentMembers(
  departmentId: string
): Promise<DepartmentMemberRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      memberId: schema.memberDepartment.memberId,
      role: schema.memberDepartment.role,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.memberDepartment)
    .innerJoin(schema.member, eq(schema.memberDepartment.memberId, schema.member.id))
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.memberDepartment.departmentId, departmentId));
  return rows;
}

export async function addDepartmentMember(
  departmentId: string,
  memberId: string,
  role: "admin" | "agent" = "agent"
): Promise<void> {
  const db = getDb();
  await db
    .insert(schema.memberDepartment)
    .values({ id: newId("memberDepartment"), memberId, departmentId, role })
    .onConflictDoUpdate({
      target: [schema.memberDepartment.memberId, schema.memberDepartment.departmentId],
      set: { role },
    });
}

export async function removeDepartmentMember(
  departmentId: string,
  memberId: string
): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.memberDepartment)
    .where(
      and(
        eq(schema.memberDepartment.departmentId, departmentId),
        eq(schema.memberDepartment.memberId, memberId)
      )
    );
}
