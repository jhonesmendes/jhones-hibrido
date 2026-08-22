import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionCookieValue } from "@/server/admin/session";
import { AdminLogoutButton } from "@/components/admin/logout-button";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const session = verifySessionCookieValue(jar.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-screen bg-[#0f1117] text-[#e8eaf2]">
      <AdminSidebar email={session.email} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-end border-b border-[#1e2130] px-5 py-2">
          <AdminLogoutButton />
        </div>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
