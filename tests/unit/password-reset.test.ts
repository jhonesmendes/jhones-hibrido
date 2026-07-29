import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** FR-016 a FR-018: solicitação/consumo de redefinição de senha, degradação sem SMTP. */

let memberRows: Record<string, unknown>[] = [];
let resetTokenRows: Record<string, unknown>[] = [];
let insertedRows: { table: string; values: Record<string, unknown> }[] = [];
let updateClaimSucceeds = true;
let accountUpdateCalls: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => {
  const member = { __name: "member" };
  const user = { __name: "user" };
  const passwordResetToken = { __name: "passwordResetToken" };
  const account = { __name: "account" };

  function chain(resultGetter: () => unknown[]) {
    return {
      innerJoin: () => chain(resultGetter),
      where: () =>
        Object.assign(Promise.resolve(resultGetter()), {
          limit: () => Promise.resolve(resultGetter()),
        }),
    };
  }

  return {
    getDb: () => ({
      select: () => ({
        from: (table: { __name: string }) => {
          if (table.__name === "passwordResetToken") return chain(() => resetTokenRows);
          if (table.__name === "member") return chain(() => memberRows);
          return chain(() => []);
        },
      }),
      insert: (table: { __name: string }) => ({
        values: (v: Record<string, unknown>) => {
          insertedRows.push({ table: table.__name, values: v });
          if (table.__name === "passwordResetToken") resetTokenRows = [v];
          return Promise.resolve();
        },
      }),
      update: (table: { __name: string }) => ({
        set: (v: Record<string, unknown>) => ({
          where: () => {
            if (table.__name === "account") {
              accountUpdateCalls.push(v);
              return Promise.resolve();
            }
            return Object.assign(Promise.resolve(), {
              returning: () =>
                Promise.resolve(updateClaimSucceeds ? [{ id: "prt_1" }] : []),
            });
          },
        }),
      }),
    }),
    schema: { member, user, passwordResetToken, account },
  };
});

const sendMailMock = vi.fn();
vi.mock("@/lib/mail/smtp", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mail/smtp")>("@/lib/mail/smtp");
  return {
    ...actual,
    sendMail: (...args: unknown[]) => sendMailMock(...args),
  };
});

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  memberRows = [];
  resetTokenRows = [];
  insertedRows = [];
  updateClaimSucceeds = true;
  accountUpdateCalls = [];
  sendMailMock.mockReset();
});

import {
  consumePasswordReset,
  PasswordResetError,
  requestPasswordReset,
} from "@/server/auth/password-reset";
import { SmtpNotConfiguredError } from "@/lib/mail/smtp";

describe("requestPasswordReset", () => {
  it("membro inexistente não cria token nem lança (nunca revela existência)", async () => {
    memberRows = [];
    await expect(requestPasswordReset("ninguem@teste.com")).resolves.toBeUndefined();
    expect(insertedRows.some((r) => r.table === "passwordResetToken")).toBe(false);
  });

  it("membro inativo não cria token", async () => {
    memberRows = [{ memberId: "mb_1", organizationId: "org_1", isActive: false }];
    await requestPasswordReset("inativo@teste.com");
    expect(insertedRows.some((r) => r.table === "passwordResetToken")).toBe(false);
  });

  it("membro ativo: cria o token e tenta enviar por SMTP", async () => {
    memberRows = [{ memberId: "mb_1", organizationId: "org_1", isActive: true }];
    sendMailMock.mockResolvedValue(undefined);
    await requestPasswordReset("ativo@teste.com");
    expect(insertedRows.some((r) => r.table === "passwordResetToken")).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();
  });

  it("SMTP não configurado: token já existe, degrada sem lançar (FR-018)", async () => {
    memberRows = [{ memberId: "mb_1", organizationId: "org_1", isActive: true }];
    sendMailMock.mockRejectedValue(new SmtpNotConfiguredError());
    await expect(requestPasswordReset("semSmtp@teste.com")).resolves.toBeUndefined();
    expect(insertedRows.some((r) => r.table === "passwordResetToken")).toBe(true);
  });
});

describe("consumePasswordReset", () => {
  it("token inexistente → invalid", async () => {
    resetTokenRows = [];
    await expect(consumePasswordReset("token", "novaSenha123")).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("token já usado → used", async () => {
    resetTokenRows = [
      { id: "prt_1", memberId: "mb_1", usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    ];
    await expect(consumePasswordReset("token", "novaSenha123")).rejects.toMatchObject({
      code: "used",
    });
  });

  it("token expirado → expired", async () => {
    resetTokenRows = [
      { id: "prt_1", memberId: "mb_1", usedAt: null, expiresAt: new Date(Date.now() - 1000) },
    ];
    await expect(consumePasswordReset("token", "novaSenha123")).rejects.toMatchObject({
      code: "expired",
    });
  });

  it("token válido: consome e troca a senha do account", async () => {
    resetTokenRows = [
      { id: "prt_1", memberId: "mb_1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) },
    ];
    memberRows = [{ userId: "user_1" }];
    await consumePasswordReset("token", "novaSenha123");
    expect(accountUpdateCalls.length).toBe(1);
    expect(accountUpdateCalls[0]?.password).toBeTypeOf("string");
    expect(accountUpdateCalls[0]?.password).not.toBe("novaSenha123");
  });

  it("corrida: claim falha → used, mesmo com o registro lido como válido", async () => {
    resetTokenRows = [
      { id: "prt_1", memberId: "mb_1", usedAt: null, expiresAt: new Date(Date.now() + 60_000) },
    ];
    updateClaimSucceeds = false;
    await expect(consumePasswordReset("token", "novaSenha123")).rejects.toBeInstanceOf(
      PasswordResetError
    );
  });
});
