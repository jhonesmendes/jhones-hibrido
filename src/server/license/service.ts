import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

export type LicenseRow = typeof schema.license.$inferSelect;

export type LicenseType = "trial" | "starter" | "business" | "enterprise";
export type LicenseStatus = "active" | "expired" | "suspended";

export type LimitKey =
  | "maxOfficialNumbers"
  | "maxWebNumbers"
  | "maxDepartments"
  | "maxAdmins"
  | "maxAgents";

/** Cache em memória (processo único por instância) — evita 1 SELECT por
 * request em toda rota guardada. TTL curto: o painel central pode mudar a
 * licença a qualquer momento via PATCH /api/internal/license. */
const cache = new Map<string, { data: LicenseRow; at: number }>();
const CACHE_TTL_MS = 60_000;

export async function getLicense(organizationId: string): Promise<LicenseRow | null> {
  const hit = cache.get(organizationId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const db = getDb();
  const rows = await db
    .select()
    .from(schema.license)
    .where(scoped(schema.license.organizationId, organizationId))
    .limit(1);
  const lic = rows[0] ?? null;
  if (lic) cache.set(organizationId, { data: lic, at: Date.now() });
  return lic;
}

/** Como `getLicense`, mas semeia um trial de 14 dias na hora se a org ainda
 * não tem licença — cobre orgs criadas ANTES dessa feature existir (o seed
 * automático só roda no primeiro cadastro). Sem isso, toda organização
 * antiga ficaria bloqueada (guards tratam "sem licença" como inativa). */
export async function getOrSeedLicense(organizationId: string): Promise<LicenseRow> {
  const existing = await getLicense(organizationId);
  if (existing) return existing;

  const db = getDb();
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);
  const inserted = await db
    .insert(schema.license)
    .values({
      id: newId("license"),
      organizationId,
      trialEndsAt: trialEnd,
      expiresAt: trialEnd,
    })
    .onConflictDoNothing({ target: schema.license.organizationId })
    .returning();

  invalidateLicenseCache(organizationId);
  // onConflictDoNothing devolve [] numa corrida genuína (outra request
  // inseriu entre o getLicense e o insert acima) — busca de novo nesse caso.
  return inserted[0] ?? (await getLicense(organizationId))!;
}

export function invalidateLicenseCache(organizationId: string): void {
  cache.delete(organizationId);
}

export function isLicenseActive(lic: LicenseRow): boolean {
  if (lic.status !== "active") return false;
  if (lic.expiresAt && lic.expiresAt.getTime() < Date.now()) return false;
  return true;
}

export function effectiveAgentLimit(lic: LicenseRow): number {
  return lic.maxAgents + lic.addonAgents;
}

export function limitFor(lic: LicenseRow, key: LimitKey): number {
  return key === "maxAgents" ? effectiveAgentLimit(lic) : lic[key];
}

export function withinLimit(lic: LicenseRow, key: LimitKey, current: number): boolean {
  return current < limitFor(lic, key);
}

/** Uso atual de cada recurso limitado — consultado pelo painel central
 * (`GET /api/internal/license/usage`) e pela tela `/settings/license`. */
export async function getLicenseUsage(organizationId: string): Promise<{
  maxOfficialNumbers: number;
  maxWebNumbers: number;
  maxDepartments: number;
  maxAdmins: number;
  maxAgents: number;
}> {
  const db = getDb();
  const [official, web, departments, admins, agents] = await Promise.all([
    db
      .select({ id: schema.metaCredentials.id })
      .from(schema.metaCredentials)
      .where(
        and(
          scoped(schema.metaCredentials.organizationId, organizationId),
          eq(schema.metaCredentials.isActive, true)
        )
      ),
    db
      .select({ id: schema.unofficialChannel.id })
      .from(schema.unofficialChannel)
      .where(
        and(
          scoped(schema.unofficialChannel.organizationId, organizationId),
          eq(schema.unofficialChannel.isActive, true)
        )
      ),
    db
      .select({ id: schema.department.id })
      .from(schema.department)
      .where(scoped(schema.department.organizationId, organizationId)),
    db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          scoped(schema.member.organizationId, organizationId),
          eq(schema.member.role, "admin")
        )
      ),
    db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          scoped(schema.member.organizationId, organizationId),
          eq(schema.member.role, "agent")
        )
      ),
  ]);
  return {
    maxOfficialNumbers: official.length,
    maxWebNumbers: web.length,
    maxDepartments: departments.length,
    maxAdmins: admins.length,
    maxAgents: agents.length,
  };
}

/** Aplica a licença enviada pelo painel central (upsert local — a instância
 * nunca decide seu próprio plano, só grava o que o operador mandou). */
export async function applyLicenseUpdate(
  organizationId: string,
  input: {
    type: LicenseType;
    status: LicenseStatus;
    maxOfficialNumbers: number;
    maxWebNumbers: number;
    maxDepartments: number;
    maxAdmins: number;
    maxAgents: number;
    addonAgents: number;
    hideOwner: boolean;
    expiresAt: Date | null;
    trialEndsAt: Date | null;
    notes?: string | null;
  }
): Promise<LicenseRow> {
  const db = getDb();
  const existing = await getLicense(organizationId);
  const set = {
    type: input.type,
    status: input.status,
    maxOfficialNumbers: input.maxOfficialNumbers,
    maxWebNumbers: input.maxWebNumbers,
    maxDepartments: input.maxDepartments,
    maxAdmins: input.maxAdmins,
    maxAgents: input.maxAgents,
    addonAgents: input.addonAgents,
    hideOwner: input.hideOwner,
    expiresAt: input.expiresAt,
    trialEndsAt: input.trialEndsAt,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    updatedAt: new Date(),
  };

  let row: LicenseRow;
  if (existing) {
    const updated = await db
      .update(schema.license)
      .set(set)
      .where(eq(schema.license.organizationId, organizationId))
      .returning();
    row = updated[0]!;
  } else {
    const inserted = await db
      .insert(schema.license)
      .values({ id: newId("license"), organizationId, ...set })
      .returning();
    row = inserted[0]!;
  }
  invalidateLicenseCache(organizationId);
  return row;
}
