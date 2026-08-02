import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { resolveMembership } from "@/server/auth/on-signup";

export type SessionContext = {
  userId: string;
  memberId: string;
  organizationId: string;
  role: string;
  /** Departamento ativo (v0.1) — preferência do membro, não do navegador;
   * null = visão consolidada (sem filtro) ou org sem departamentos ainda. */
  activeDepartmentId: string | null;
};

export class UnauthorizedError extends Error {
  constructor(message = "Não autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Sessão + organização ativa para route handlers e server components.
 * Lança UnauthorizedError se não houver sessão ou organização.
 */
export async function requireSession(): Promise<SessionContext> {
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new UnauthorizedError();
  // A sessão pode ser criada antes de a membresia existir (registro
  // inicial) — a membresia no BD é a fonte de verdade de org + papel.
  const membership = await resolveMembership(session.user.id);
  if (!membership) {
    throw new UnauthorizedError("Sessão sem organização ativa");
  }
  // Reavaliado a cada requisição: um membro desativado a meio da sessão
  // perde acesso na próxima chamada, não só num futuro login (FR-009).
  if (!membership.isActive) {
    throw new UnauthorizedError("Conta desativada");
  }
  return {
    userId: session.user.id,
    memberId: membership.memberId,
    organizationId: membership.organizationId,
    role: membership.role,
    activeDepartmentId: membership.activeDepartmentId,
  };
}

/** Igual a requireSession mas retorna null em vez de lançar. */
export async function getSessionOrNull(): Promise<SessionContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
