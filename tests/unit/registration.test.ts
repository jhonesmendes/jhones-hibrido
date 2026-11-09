import { afterEach, describe, expect, it, vi } from "vitest";

/** FR-060/FR-081 + spec 009: cadastro fechado após a 1ª org; dono por convite. */

let orgCount = 0;
let pendingOwnerInvite = false;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => Promise.resolve([{ n: orgCount }]),
    }),
  }),
  schema: { organization: {} },
}));

vi.mock("@/server/auth/owner-invite", () => ({
  hasPendingOwnerInvite: () => Promise.resolve(pendingOwnerInvite),
}));

import {
  decideRegistrationState,
  getRegistrationState,
  isPublicSignupAllowed,
} from "@/server/auth/registration";

afterEach(() => {
  vi.unstubAllEnvs();
  orgCount = 0;
  pendingOwnerInvite = false;
});

describe("decideRegistrationState", () => {
  const base = { allowSignup: false, organizationCount: 0, pendingOwnerInvite: false, isProduction: false };

  it("produção sem organização → aguarda o convite do dono", () => {
    expect(decideRegistrationState({ ...base, isProduction: true })).toBe("awaiting_owner");
  });

  it("convite pendente fecha o cadastro também fora de produção", () => {
    expect(decideRegistrationState({ ...base, pendingOwnerInvite: true })).toBe("awaiting_owner");
  });

  it("desenvolvimento sem org e sem convite → aberto (fluxo legado)", () => {
    expect(decideRegistrationState(base)).toBe("open");
  });

  it("com organização → fechado, com ou sem produção", () => {
    expect(decideRegistrationState({ ...base, organizationCount: 1 })).toBe("closed");
    expect(decideRegistrationState({ ...base, organizationCount: 1, isProduction: true })).toBe("closed");
  });

  it("ALLOW_SIGNUP vence tudo", () => {
    expect(
      decideRegistrationState({ allowSignup: true, organizationCount: 3, pendingOwnerInvite: true, isProduction: true })
    ).toBe("open");
  });
});

describe("registro público", () => {
  it("instância vazia em dev → permitido (primeiro usuário)", async () => {
    vi.stubEnv("ALLOW_SIGNUP", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(await isPublicSignupAllowed()).toBe(true);
  });

  it("instância vazia em produção → aguardando o dono, cadastro negado", async () => {
    vi.stubEnv("ALLOW_SIGNUP", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await getRegistrationState()).toBe("awaiting_owner");
    expect(await isPublicSignupAllowed()).toBe(false);
  });

  it("convite do dono pendente em dev → negado", async () => {
    vi.stubEnv("ALLOW_SIGNUP", "");
    vi.stubEnv("NODE_ENV", "development");
    pendingOwnerInvite = true;
    expect(await getRegistrationState()).toBe("awaiting_owner");
  });

  it("já existe uma organização → fechado", async () => {
    orgCount = 1;
    vi.stubEnv("ALLOW_SIGNUP", "");
    expect(await getRegistrationState()).toBe("closed");
  });

  it("escape ALLOW_SIGNUP=true → permitido mesmo com organização", async () => {
    orgCount = 1;
    vi.stubEnv("ALLOW_SIGNUP", "true");
    expect(await isPublicSignupAllowed()).toBe(true);
  });

  it("outros valores do escape NÃO abrem o cadastro", async () => {
    orgCount = 1;
    vi.stubEnv("ALLOW_SIGNUP", "1");
    expect(await isPublicSignupAllowed()).toBe(false);
  });
});
