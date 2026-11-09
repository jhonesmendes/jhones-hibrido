import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { getSessionOrNull } from "@/lib/auth/session";
import { getBranding } from "@/server/branding";
import { resolvePermissions } from "@/lib/auth/require-permission";
import { AppNav } from "@/components/app-nav";
import { EmbedNav } from "@/components/embed-nav";
import { EMBED_HEADER } from "@/lib/embed";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const branding = await getBranding(session.organizationId);
  const requestHeaders = await headers();
  const authSession = await getAuth().api.getSession({ headers: requestHeaders });
  const userName = authSession?.user.name ?? "Usuario";

  // Spec 010: dentro do iframe (ex.: painel do Sankhya) a barra lateral dá
  // lugar a uma barra compacta. Quem decide é o middleware (`?embed=1`).
  if (requestHeaders.get(EMBED_HEADER) === "1") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        <PresenceHeartbeat />
        <EmbedNav branding={branding} userName={userName} />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
      </div>
    );
  }

  const permissions = await resolvePermissions(session.memberId, session.role);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background md:flex-row">
      <PresenceHeartbeat />
      <AppNav
        branding={branding}
        userName={userName}
        role={session.role}
        permissions={[...permissions]}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
