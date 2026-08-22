"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setError("E-mail ou senha incorretos");
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f1117] p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[#1e2130] bg-[#13161f] p-6 text-[#e8eaf2] shadow-xl"
      >
        <div className="text-center">
          <h1 className="text-lg font-medium">Vocero Admin</h1>
          <p className="text-sm text-[#4a5070]">Acesso restrito ao operador</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm text-[#8890b0]">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm text-[#8890b0]">
            Senha
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[#1e2130] bg-[#0f1117] px-3 py-2 text-sm text-[#c0c8e8] outline-none focus:border-[#2a4090]"
          />
        </div>
        {error && <p className="text-sm text-[#f07070]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md border border-[#2a4090] bg-[#1e3080] py-2.5 text-sm font-medium text-[#7c9ff5] transition hover:bg-[#243898] disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
