import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import {
  DEFAULT_BRANDING,
  normalizeBranding,
  type Branding,
} from "@/lib/branding";

/** Marca salva em organization.metadata (JSON do Better Auth). */

function parseMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function getBranding(
  organizationId?: string | null
): Promise<Branding> {
  const db = getDb();
  const rows = organizationId
    ? await db
        .select({ metadata: schema.organization.metadata, logo: schema.organization.logo })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1)
    : // Sem sessão (login, layout raiz): a única organização da instância.
      await db
        .select({ metadata: schema.organization.metadata, logo: schema.organization.logo })
        .from(schema.organization)
        .limit(1);
  if (!rows[0]) return DEFAULT_BRANDING;
  const meta = parseMetadata(rows[0].metadata);
  return normalizeBranding({
    ...((meta.branding as Partial<Branding> | undefined) ?? null),
    logo: rows[0].logo,
  });
}

/** Logo cifrado em `organization.logo` (coluna dedicada); nome/acento em metadata. */
export async function saveBranding(
  organizationId: string,
  branding: Branding
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = parseMetadata(rows[0]?.metadata ?? null);
  const normalized = normalizeBranding(branding);
  meta.branding = { name: normalized.name, accent: normalized.accent };
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta), logo: normalized.logo })
    .where(eq(schema.organization.id, organizationId));
}
