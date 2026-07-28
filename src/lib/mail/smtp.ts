import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super("SMTP não configurado");
    this.name = "SmtpNotConfiguredError";
  }
}

export class SmtpSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpSendError";
  }
}

async function getActiveSmtpConfig(organizationId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.smtpConfig)
    .where(
      and(
        eq(schema.smtpConfig.organizationId, organizationId),
        eq(schema.smtpConfig.isActive, true)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Envia um e-mail via o SMTP do próprio operador (Constituição II v2.1.0).
 * Nunca falha silenciosamente: lança `SmtpNotConfiguredError` quando não há
 * configuração ativa, ou `SmtpSendError` com a mensagem real do servidor.
 */
export async function sendMail(
  organizationId: string,
  message: { to: string; subject: string; text: string; html?: string }
): Promise<void> {
  const config = await getActiveSmtpConfig(organizationId);
  if (!config) throw new SmtpNotConfiguredError();

  const password = decryptSecret({
    cipher: config.passwordCipher,
    iv: config.passwordIv,
    tag: config.passwordTag,
  });

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: password },
  });

  try {
    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "Erro desconhecido";
    throw new SmtpSendError(`Falha ao enviar e-mail: ${detail}`);
  }
}
