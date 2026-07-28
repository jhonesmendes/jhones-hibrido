import { apiError, withAuth } from "@/lib/api";
import { getDb } from "@/lib/db";
import { isDomainEmpty, seedDemo } from "@/server/seed/demo";

export const dynamic = "force-dynamic";

/**
 * Carrega o negócio demo (FR-075). Só com o BD de domínio vazio — a
 * versão por script (`pnpm seed:demo`) permite recarregar com --force.
 */
export const POST = withAuth(async (session) => {
  const db = getDb();
  const empty = await isDomainEmpty(db, session.organizationId);
  if (!empty) {
    return apiError(
      409,
      "not_empty",
      "Já há dados na organização; a demo só carrega com a base vazia"
    );
  }
  const result = await seedDemo(db, session.organizationId);
  return Response.json({ ok: true, ...result });
});
