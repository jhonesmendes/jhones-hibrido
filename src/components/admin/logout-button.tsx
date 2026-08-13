"use client";

import { useRouter } from "next/navigation";

export function AdminLogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => null);
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={() => void logout()}
      className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
    >
      Sair
    </button>
  );
}
