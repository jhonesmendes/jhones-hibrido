"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

const MIN_PASSWORD_LENGTH = 8;

/** Códigos do Better Auth (`/change-password`) → mensagem em pt-BR. */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_PASSWORD: "A senha atual está incorreta",
  PASSWORD_TOO_SHORT: `A nova senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
  PASSWORD_TOO_LONG: "A nova senha é longa demais",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Esta conta não usa senha para entrar",
};

/**
 * Troca da própria senha — vale para qualquer papel (owner, admin, agente).
 * Exige a senha atual e encerra as outras sessões abertas: quem trocou a
 * senha por suspeita de vazamento derruba quem estiver usando a antiga.
 */
export function PasswordClient() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(ERROR_MESSAGES.PASSWORD_TOO_SHORT ?? null);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha");
      return;
    }
    if (newPassword === currentPassword) {
      setError("A nova senha precisa ser diferente da atual");
      return;
    }
    setSaving(true);
    const { error: apiError } = await authClient
      .changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
      .catch(() => ({ error: { code: undefined, status: 0, message: undefined } }));
    setSaving(false);
    if (apiError) {
      setError(
        (apiError.code && ERROR_MESSAGES[apiError.code]) ||
          (apiError.status === 429
            ? "Muitas tentativas; aguarde alguns minutos"
            : "Não foi possível trocar a senha")
      );
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4 text-muted-foreground" /> Senha
        </CardTitle>
        <CardDescription>
          Troque a senha que você usa para entrar. As outras sessões abertas com
          esta conta são encerradas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Senha atual</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-brand-text">Senha alterada com sucesso.</p>}
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando…" : "Trocar senha"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
