import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Conta de equipe criada: dispara e-mail com credenciais, degradando sem SMTP. */

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
  sendMailMock.mockReset();
});

import { sendWelcomeEmail } from "@/server/auth/welcome-email";
import { SmtpNotConfiguredError, SmtpSendError } from "@/lib/mail/smtp";

describe("sendWelcomeEmail", () => {
  const member = { name: "Ana", email: "ana@teste.com", password: "SenhaTemp123" };

  it("SMTP configurado: envia e retorna true", async () => {
    sendMailMock.mockResolvedValue(undefined);
    const emailed = await sendWelcomeEmail("org_1", member);
    expect(emailed).toBe(true);
    expect(sendMailMock).toHaveBeenCalledOnce();
    const [, message] = sendMailMock.mock.calls[0] as [string, { to: string; text: string }];
    expect(message.to).toBe("ana@teste.com");
    expect(message.text).toContain("SenhaTemp123");
    expect(message.text).toContain("http://localhost:3000/login");
  });

  it("SMTP não configurado: degrada e retorna false, sem lançar", async () => {
    sendMailMock.mockRejectedValue(new SmtpNotConfiguredError());
    await expect(sendWelcomeEmail("org_1", member)).resolves.toBe(false);
  });

  it("Envio falha (SmtpSendError): degrada e retorna false, sem lançar", async () => {
    sendMailMock.mockRejectedValue(new SmtpSendError("host inacessível"));
    await expect(sendWelcomeEmail("org_1", member)).resolves.toBe(false);
  });

  it("Erro inesperado: propaga", async () => {
    sendMailMock.mockRejectedValue(new Error("boom"));
    await expect(sendWelcomeEmail("org_1", member)).rejects.toThrow("boom");
  });
});
