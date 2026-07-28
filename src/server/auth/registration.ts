import { count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Registro público fechado após a primeira organização (FR-060), exceto pela
 * variável de escape ALLOW_SIGNUP=true. As contas de equipe são criadas pelo
 * proprietário (bypass interno do gate).
 */
export async function isPublicSignupAllowed(): Promise<boolean> {
  if (process.env.ALLOW_SIGNUP === "true") return true;
  const db = getDb();
  const rows = await db.select({ n: count() }).from(schema.organization);
  return (rows[0]?.n ?? 0) === 0;
}
