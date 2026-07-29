"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signUp } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSIONS } from "@/lib/auth/permissions";

function formatExpiresIn(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expirando agora";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `Expira em ${days} dia${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `Expira em ${hours}h`;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  agent: "Agente",
};

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  if (token) return <InviteRegisterForm token={token} />;
  return <PublicRegisterForm onDone={() => { router.push("/inbox"); router.refresh(); }} />;
}

function PublicRegisterForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signUp.email({ name, email, password });
    setLoading(false);
    if (err) {
      if (err.status === 403) {
        setError(
          "O cadastro está fechado: esta instância já tem a sua organização. Peça um convite ao proprietário."
        );
      } else if (err.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos.");
      } else {
        setError(err.message ?? "Não foi possível criar a conta.");
      }
      return;
    }
    onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          O primeiro cadastro cria a organização desta instância e fica como
          proprietário.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Seu nome</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando…" : "Criar conta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

type InviteCheck =
  | { status: "loading" }
  | { status: "invalid"; message: string }
  | {
      status: "valid";
      email: string | null;
      role: string;
      expiresAt: string;
      inviterName: string | null;
      permissions: string[];
    };

function InviteRegisterForm({ token }: { token: string }) {
  const router = useRouter();
  const [check, setCheck] = useState<InviteCheck>({ status: "loading" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/auth/invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as
          | {
              email: string | null;
              role: string;
              expiresAt: string;
              inviterName: string | null;
              permissions: string[];
            }
          | { error?: { message?: string } }
          | null;
        if (cancelled) return;
        if (!res.ok) {
          const message =
            (data as { error?: { message?: string } } | null)?.error?.message ??
            "Convite inválido";
          setCheck({ status: "invalid", message });
          return;
        }
        const valid = data as {
          email: string | null;
          role: string;
          expiresAt: string;
          inviterName: string | null;
          permissions: string[];
        };
        setCheck({
          status: "valid",
          email: valid.email,
          role: valid.role,
          expiresAt: valid.expiresAt,
          inviterName: valid.inviterName,
          permissions: valid.permissions,
        });
        if (valid.email) setEmail(valid.email);
      })
      .catch(() => {
        if (!cancelled) setCheck({ status: "invalid", message: "Convite inválido" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name, email, password }),
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "Não foi possível criar a conta");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  if (check.status === "loading") {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Verificando convite…
        </CardContent>
      </Card>
    );
  }

  if (check.status === "invalid") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Convite inválido</CardTitle>
          <CardDescription>{check.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Peça um novo link a quem administra esta instância, ou{" "}
            <Link href="/login" className="text-primary hover:underline">
              entre na sua conta
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aceitar convite</CardTitle>
        <CardDescription>
          Você foi convidado como {ROLE_LABEL[check.role] ?? check.role}.
          Defina seu nome e senha para começar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-md border border-emerald-800/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-400">
          <p className="font-medium">Convite válido</p>
          <p className="text-xs text-emerald-400/80">
            {formatExpiresIn(check.expiresAt)}
            {check.inviterName ? ` · Convidado por ${check.inviterName}` : ""}
          </p>
        </div>
        {check.permissions.length > 0 && (
          <div className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              SUAS PERMISSÕES INICIAIS
            </p>
            <div className="flex flex-wrap gap-1.5">
              {check.permissions.map((key) => (
                <span
                  key={key}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                >
                  {PERMISSIONS[key as keyof typeof PERMISSIONS] ?? key}
                </span>
              ))}
            </div>
          </div>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Seu nome</Label>
            <Input
              id="invite-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="email"
              required
              readOnly={!!check.email}
              disabled={!!check.email}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-password">Senha</Label>
            <Input
              id="invite-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Criando…" : "Criar conta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
