import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Transporte SMTP mockado — cifragem/decifragem já é coberta por crypto.test.ts. */

let configRow: Record<string, unknown> | undefined;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(configRow ? [configRow] : []), {
            limit: () => Promise.resolve(configRow ? [configRow] : []),
          }),
      }),
    }),
  }),
  schema: { smtpConfig: { organizationId: "organization_id", isActive: "is_active" } },
}));

const sendMailTransportMock = vi.fn();
const createTransportMock = vi.fn((..._args: unknown[]) => ({
  sendMail: sendMailTransportMock,
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: (...args: unknown[]) => createTransportMock(...args) },
}));

beforeAll(() => {
  process.env.APP_BASE_URL = "http://localhost:3000";
  process.env.DATABASE_URL = "postgresql://t:t@localhost:5432/t";
  process.env.BETTER_AUTH_SECRET = "secret-de-test-suficiente";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.META_WEBHOOK_VERIFY_TOKEN = "verify-test";
});

beforeEach(() => {
  configRow = undefined;
  sendMailTransportMock.mockReset();
  createTransportMock.mockClear();
});

import { sendMail, SmtpNotConfiguredError, SmtpSendError } from "@/lib/mail/smtp";
import { encryptSecret } from "@/lib/crypto";
import { resolveSmtpSecure } from "@/lib/mail/tls";

function activeConfig(): Record<string, unknown> {
  const enc = encryptSecret("senha-secreta");
  return {
    host: "smtp.exemplo.com",
    port: 587,
    secure: false,
    user: "user@exemplo.com",
    passwordCipher: enc.cipher,
    passwordIv: enc.iv,
    passwordTag: enc.tag,
    fromName: "Vocero CRM",
    fromEmail: "noreply@exemplo.com",
    isActive: true,
  };
}

describe("sendMail", () => {
  it("sem configuração ativa → SmtpNotConfiguredError", async () => {
    configRow = undefined;
    await expect(
      sendMail("org_1", { to: "a@b.com", subject: "Teste", text: "oi" })
    ).rejects.toBeInstanceOf(SmtpNotConfiguredError);
  });

  it("com configuração: monta o transporte e envia com from/to corretos", async () => {
    configRow = activeConfig();
    sendMailTransportMock.mockResolvedValue({ messageId: "1" });
    await sendMail("org_1", { to: "destino@teste.com", subject: "Assunto", text: "corpo" });

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.exemplo.com",
        port: 587,
        secure: false,
        auth: { user: "user@exemplo.com", pass: "senha-secreta" },
      })
    );
    expect(sendMailTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '"Vocero CRM" <noreply@exemplo.com>',
        to: "destino@teste.com",
        subject: "Assunto",
        text: "corpo",
      })
    );
  });

  it("falha no envio → SmtpSendError com a mensagem real", async () => {
    configRow = activeConfig();
    sendMailTransportMock.mockRejectedValue(new Error("credenciais inválidas"));
    await expect(
      sendMail("org_1", { to: "a@b.com", subject: "Teste", text: "oi" })
    ).rejects.toThrow(SmtpSendError);
  });

  it("porta 465 com TLS desmarcado → força TLS implícito (Hostinger 'Greeting never received')", async () => {
    configRow = { ...activeConfig(), port: 465, secure: false };
    sendMailTransportMock.mockResolvedValue({ messageId: "1" });
    await sendMail("org_1", { to: "a@b.com", subject: "Teste", text: "oi" });
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it("porta 587 com TLS marcado → usa STARTTLS (secure=false)", async () => {
    configRow = { ...activeConfig(), port: 587, secure: true };
    sendMailTransportMock.mockResolvedValue({ messageId: "1" });
    await sendMail("org_1", { to: "a@b.com", subject: "Teste", text: "oi" });
    expect(createTransportMock).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }));
  });

  it("erro de greeting ganha dica acionável", async () => {
    configRow = activeConfig();
    sendMailTransportMock.mockRejectedValue(new Error("Greeting never received"));
    await expect(
      sendMail("org_1", { to: "a@b.com", subject: "Teste", text: "oi" })
    ).rejects.toThrow(/465 = TLS implícito/);
  });
});

describe("resolveSmtpSecure", () => {
  it("porta-padrão manda; porta fora do padrão respeita o checkbox", () => {
    expect(resolveSmtpSecure(465, false)).toBe(true);
    expect(resolveSmtpSecure(587, true)).toBe(false);
    expect(resolveSmtpSecure(25, true)).toBe(false);
    expect(resolveSmtpSecure(2465, true)).toBe(true);
    expect(resolveSmtpSecure(2465, false)).toBe(false);
  });
});
