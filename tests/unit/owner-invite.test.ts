import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: () => ({}), schema: {} }));

import {
  evaluateOwnerInvite,
  hashOwnerToken,
  normalizeEmail,
} from "@/server/auth/owner-invite";

/** Spec 009 — regras puras do convite do proprietário. */
describe("evaluateOwnerInvite", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  const future = new Date("2026-11-08T12:00:00Z");

  it("sem linha → inválido", () => {
    expect(evaluateOwnerInvite(undefined, now)).toEqual({ ok: false, code: "invalid" });
  });

  it("válido quando não usado, não revogado e dentro do prazo", () => {
    expect(evaluateOwnerInvite({ usedAt: null, revokedAt: null, expiresAt: future }, now)).toEqual({ ok: true });
  });

  it("usado tem prioridade sobre os demais estados", () => {
    expect(
      evaluateOwnerInvite({ usedAt: now, revokedAt: now, expiresAt: new Date(0) }, now)
    ).toEqual({ ok: false, code: "used" });
  });

  it("revogado por convite mais novo", () => {
    expect(evaluateOwnerInvite({ usedAt: null, revokedAt: now, expiresAt: future }, now)).toEqual({
      ok: false,
      code: "revoked",
    });
  });

  it("expira exatamente no instante de expiração", () => {
    expect(evaluateOwnerInvite({ usedAt: null, revokedAt: null, expiresAt: now }, now)).toEqual({
      ok: false,
      code: "expired",
    });
  });
});

describe("helpers", () => {
  it("e-mail normalizado sem espaços e em minúsculas", () => {
    expect(normalizeEmail("  Dono@Cliente.COM.br ")).toBe("dono@cliente.com.br");
  });

  it("hash determinístico e diferente do token", () => {
    expect(hashOwnerToken("abc")).toBe(hashOwnerToken("abc"));
    expect(hashOwnerToken("abc")).not.toContain("abc");
    expect(hashOwnerToken("abc")).toHaveLength(64);
  });
});
