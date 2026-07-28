"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setLoading(false);
    // Sempre mostra a mesma confirmação — nunca revela se o e-mail existe.
    setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Esqueci minha senha</CardTitle>
        <CardDescription>
          Informe seu e-mail. Se houver uma conta, você recebe um link — ou o
          administrador da sua organização vê o pedido e envia manualmente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm">
              Se esse e-mail tiver uma conta ativa, um link de redefinição foi
              enviado (ou o administrador foi notificado para enviar um
              manualmente).
            </p>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                Voltar para o login
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de redefinição"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                Voltar para o login
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
