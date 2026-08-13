import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionCookieValue } from "@/server/admin/session";
import { AdminLogoutButton } from "@/components/admin/logout-button";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const session = verifySessionCookieValue(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div>
          <p className="text-sm font-bold">Painel central Vocero</p>
          <p className="text-xs text-white/50">{session.email}</p>
        </div>
        <AdminLogoutButton />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
