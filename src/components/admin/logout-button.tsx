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
      className="rounded-lg border border-[#1e2540] px-3 py-1.5 text-xs text-[#8890b0] transition-colors hover:bg-[#1a1e2e] hover:text-[#c0c8e8]"
    >
      Sair
    </button>
  );
}
