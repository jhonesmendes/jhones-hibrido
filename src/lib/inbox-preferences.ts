"use client";

/** Preferência pessoal de exibição de grupos na Caixa de Entrada — ver
 * `src/app/api/settings/inbox-preferences/route.ts`. */
export async function fetchGroupsInInbox(): Promise<boolean> {
  const res = await fetch("/api/settings/inbox-preferences").catch(() => null);
  if (!res?.ok) return true;
  const data = (await res.json()) as { groupsInInbox?: boolean };
  return data.groupsInInbox ?? true;
}
