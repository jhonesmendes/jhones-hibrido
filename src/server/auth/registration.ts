import { count } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { hasPendingOwnerInvite } from "@/server/auth/owner-invite";

/**
 * Estado do cadastro público da instância (FR-060 + spec 009).
 *
 * - `open`: o formulário público cria a conta (e a organização, se for a 1ª).
 * - `closed`: a instância já tem organização; contas novas só por convite.
 * - `awaiting_owner`: sem organização, esperando o convite do proprietário
 *   gerado na instalação. Em produção é SEMPRE este o caso de instância vazia:
 *   o primeiro visitante não vira mais dono.
 *
 * `ALLOW_SIGNUP=true` reabre o cadastro em qualquer caso (escape explícito).
 */
export type RegistrationState = "open" | "closed" | "awaiting_owner";

export function decideRegistrationState(input: {
  allowSignup: boolean;
  organizationCount: number;
  pendingOwnerInvite: boolean;
  isProduction: boolean;
}): RegistrationState {
  if (input.allowSignup) return "open";
  if (input.organizationCount > 0) return "closed";
  if (input.pendingOwnerInvite || input.isProduction) return "awaiting_owner";
  return "open";
}

export async function getRegistrationState(): Promise<RegistrationState> {
  const allowSignup = process.env.ALLOW_SIGNUP === "true";
  if (allowSignup) return "open";
  const rows = await getDb().select({ n: count() }).from(schema.organization);
  const organizationCount = rows[0]?.n ?? 0;
  if (organizationCount > 0) return "closed";
  return decideRegistrationState({
    allowSignup,
    organizationCount,
    pendingOwnerInvite: await hasPendingOwnerInvite(),
    isProduction: process.env.NODE_ENV === "production",
  });
}

export async function isPublicSignupAllowed(): Promise<boolean> {
  return (await getRegistrationState()) === "open";
}
